import { createHash, randomBytes } from "node:crypto";
import {
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  jobs,
  projects,
  renderJobs,
  renderedVideos,
  renderThumbnails,
  shareLinks,
  type DatabaseClient,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  createShareLinkInputSchema,
  publicPlaybackSchema,
  shareLinkCreatedResponseSchema,
  shareLinkSchema,
  shareLinksResponseSchema,
  type PublicPlayback,
  type ShareLink,
  type ShareLinkCreatedResponse,
} from "@avlp/schemas";
import { storageKeySchema, type ObjectStorage } from "@avlp/storage";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

type Scope = { ownerUserId: Identifier; projectId: Identifier };
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const publicUnavailable = () =>
  new PublicError("not_found", "This shared lesson is unavailable.", 404);

/** A bounded local guard. Production deployments should pair it with an edge
 * limiter; the raw token is deliberately never used as the limiter key. */
export class InMemoryPublicShareRateLimiter {
  private readonly requests = new Map<
    string,
    { count: number; resetAt: number }
  >();
  public constructor(
    private readonly clock: () => Date = () => new Date(),
    private readonly maximumRequests = 60,
    private readonly windowMs = 60_000,
  ) {}
  public check(network: string): boolean {
    const now = this.clock().getTime();
    const existing = this.requests.get(network);
    const record =
      existing === undefined || existing.resetAt <= now
        ? { count: 0, resetAt: now + this.windowMs }
        : existing;
    record.count += 1;
    this.requests.set(network, record);
    return record.count <= this.maximumRequests;
  }
}

export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ShareLinkService {
  create(
    input: Scope & { body: unknown; correlationId: Identifier },
  ): Promise<ShareLinkCreatedResponse>;
  list(input: Scope): Promise<{ shareLinks: ShareLink[] }>;
  revoke(
    input: Scope & { shareLinkId: Identifier; correlationId: Identifier },
  ): Promise<void>;
  resolve(input: { token: string; network: string }): Promise<PublicPlayback>;
}

export class PostgresShareLinkService implements ShareLinkService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly storage: Pick<ObjectStorage, "createSignedDownload">,
    private readonly publicLimiter = new InMemoryPublicShareRateLimiter(),
    private readonly now: () => Date = () => new Date(),
    private readonly maximumCreatesPerProjectHour = 30,
  ) {}

  public async create(
    input: Scope & { body: unknown; correlationId: Identifier },
  ): Promise<ShareLinkCreatedResponse> {
    const command = this.parseCommand(input.body);
    const now = this.now();
    const expiresAt =
      command.expiresAt === undefined ? null : new Date(command.expiresAt);
    if (expiresAt !== null && expiresAt <= now)
      throw new PublicError(
        "validation_failed",
        "The expiry must be in the future.",
        400,
      );
    const token = generateShareToken();
    const hash = hashShareToken(token);
    const link = await this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.projectId}))`,
      );
      const recent = await tx
        .select({ id: shareLinks.id })
        .from(shareLinks)
        .where(
          and(
            eq(shareLinks.ownerUserId, input.ownerUserId),
            eq(shareLinks.projectId, input.projectId),
            gt(shareLinks.createdAt, new Date(now.getTime() - 3_600_000)),
          ),
        );
      if (recent.length >= this.maximumCreatesPerProjectHour)
        throw new PublicError(
          "rate_limited",
          "The share-link limit has been reached. Try again later.",
          429,
        );
      const [target] = await tx
        .select({ render: renderJobs, video: renderedVideos })
        .from(renderJobs)
        .innerJoin(jobs, eq(jobs.id, renderJobs.jobId))
        .innerJoin(
          renderedVideos,
          eq(renderedVideos.renderJobId, renderJobs.id),
        )
        .where(
          and(
            eq(renderJobs.ownerUserId, input.ownerUserId),
            eq(renderJobs.projectId, input.projectId),
            eq(renderJobs.id, command.renderId),
            eq(jobs.state, "succeeded"),
            eq(renderedVideos.ownerUserId, input.ownerUserId),
            eq(renderedVideos.projectId, input.projectId),
            eq(renderedVideos.width, 1920),
            eq(renderedVideos.height, 1080),
            eq(renderedVideos.fps, 30),
            eq(renderedVideos.videoCodec, "h264"),
            eq(renderedVideos.audioCodec, "aac"),
          ),
        )
        .orderBy(desc(renderJobs.createdAt))
        .limit(1);
      if (!target)
        throw new PublicError(
          "bad_request",
          "A verified completed render is required before sharing.",
          409,
        );
      const id = createId(now);
      const [created] = await tx
        .insert(shareLinks)
        .values({
          id,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          renderedVideoId: target.video.id,
          lessonVersionId: target.render.lessonVersionId,
          tokenHash: hash,
          status: "active",
          expiresAt,
          createdBy: input.ownerUserId,
          createdAt: now,
        })
        .returning();
      if (!created)
        throw new Error("Share-link creation did not return a row.");
      await new PostgresAuditWriter(tx).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "share.created",
        target: { type: "share_link", id },
        correlationId: input.correlationId,
        metadata: {
          lessonVersionId: target.render.lessonVersionId,
          renderedVideoId: target.video.id,
          expiresAt: expiresAt?.toISOString() ?? null,
        },
        occurredAt: now,
      });
      return this.toShareLink(created);
    });
    return shareLinkCreatedResponseSchema.parse({ shareLink: link, token });
  }

  public async list(input: Scope): Promise<{ shareLinks: ShareLink[] }> {
    const rows = await this.database
      .select()
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.ownerUserId, input.ownerUserId),
          eq(shareLinks.projectId, input.projectId),
        ),
      )
      .orderBy(desc(shareLinks.createdAt))
      .limit(100);
    return shareLinksResponseSchema.parse({
      shareLinks: rows.map((row) => this.toShareLink(row)),
    });
  }

  public async revoke(
    input: Scope & { shareLinkId: Identifier; correlationId: Identifier },
  ): Promise<void> {
    const now = this.now();
    const [revoked] = await this.database
      .update(shareLinks)
      .set({ status: "revoked", revokedAt: now })
      .where(
        and(
          eq(shareLinks.id, input.shareLinkId),
          eq(shareLinks.ownerUserId, input.ownerUserId),
          eq(shareLinks.projectId, input.projectId),
          eq(shareLinks.status, "active"),
        ),
      )
      .returning({
        id: shareLinks.id,
        lessonVersionId: shareLinks.lessonVersionId,
      });
    if (!revoked)
      throw new PublicError(
        "not_found",
        "The requested share link was not found.",
        404,
      );
    await new PostgresAuditWriter(this.database).write({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      actor: { type: "user", userId: input.ownerUserId },
      eventType: "share.revoked",
      target: { type: "share_link", id: revoked.id as Identifier },
      correlationId: input.correlationId,
      metadata: { lessonVersionId: revoked.lessonVersionId },
      occurredAt: now,
    });
  }

  public async resolve(input: {
    token: string;
    network: string;
  }): Promise<PublicPlayback> {
    if (!this.publicLimiter.check(input.network))
      throw new PublicError(
        "rate_limited",
        "Too many requests. Please try again later.",
        429,
      );
    if (!tokenPattern.test(input.token)) throw publicUnavailable();
    const now = this.now();
    const [row] = await this.database
      .select({
        title: projects.title,
        video: renderedVideos,
        thumbnail: renderThumbnails,
      })
      .from(shareLinks)
      .innerJoin(projects, eq(projects.id, shareLinks.projectId))
      .innerJoin(
        renderedVideos,
        eq(renderedVideos.id, shareLinks.renderedVideoId),
      )
      .leftJoin(
        renderThumbnails,
        eq(renderThumbnails.renderedVideoId, renderedVideos.id),
      )
      .where(
        and(
          eq(shareLinks.tokenHash, hashShareToken(input.token)),
          eq(shareLinks.status, "active"),
          isNull(shareLinks.revokedAt),
          isNull(projects.deletedAt),
          or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, now)),
        ),
      )
      .limit(1);
    if (!row) throw publicUnavailable();
    const [playback, thumbnail] = await Promise.all([
      this.storage.createSignedDownload({
        key: storageKeySchema.parse(row.video.storageKey),
        expiresInSeconds: 300,
      }),
      row.thumbnail === null
        ? Promise.resolve(null)
        : this.storage.createSignedDownload({
            key: storageKeySchema.parse(row.thumbnail.storageKey),
            expiresInSeconds: 300,
          }),
    ]);
    return publicPlaybackSchema.parse({
      title: row.title,
      playbackUrl: playback.url,
      thumbnailUrl: thumbnail?.url ?? null,
    });
  }

  private parseCommand(
    value: unknown,
  ): z.infer<typeof createShareLinkInputSchema> {
    const parsed = createShareLinkInputSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw new PublicError(
      "validation_failed",
      "Request validation failed.",
      400,
      false,
      Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path.join(".") || "root",
          issue.message,
        ]),
      ),
    );
  }
  private toShareLink(row: typeof shareLinks.$inferSelect): ShareLink {
    return shareLinkSchema.parse({
      id: row.id,
      lessonVersionId: row.lessonVersionId,
      renderedVideoId: row.renderedVideoId,
      status: row.status,
      expiresAt:
        row.expiresAt === null ? null : serializeUtcTimestamp(row.expiresAt),
      revokedAt:
        row.revokedAt === null ? null : serializeUtcTimestamp(row.revokedAt),
      createdAt: serializeUtcTimestamp(row.createdAt),
    });
  }
}
