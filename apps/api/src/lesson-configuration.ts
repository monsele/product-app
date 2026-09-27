import {
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  ingestionQualityReports,
  lessonConfigurations,
  projects,
  soundBedTracks,
  sourceSnapshots,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  lessonConfigurationInputSchema,
  lessonConfigurationSchema,
  lessonConfigurationResponseSchema,
  defaultVideoApproach,
  narrationWordCountRange,
  readSoundBedChoice,
  readVideoApproach,
  soundBedNone,
  type LessonConfiguration,
  type LessonConfigurationInput,
  type LessonConfigurationResponse,
} from "@avlp/schemas";
import type { DemonstrationEligibility } from "@avlp/schemas/demonstration-pilot";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { findLatestProjectParsedDocument } from "./project-parsed-document.js";
import { assertProjectStageTransition } from "./projects.js";
import { requestActor } from "./audit-actor.js";

export interface LessonConfigurationService {
  get(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<LessonConfigurationResponse>;
  save(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
    /** ST-105. Set when a prompt-to-video run acts for the owner. */
    oneShotRunId?: Identifier | undefined;
  }): Promise<LessonConfigurationResponse>;
}

type ConfigRow = typeof lessonConfigurations.$inferSelect;
type SourceContext = {
  parsedDocumentVersion: number | null;
  sourceReviewComplete: boolean;
};

/** The pilot service remains the authority for an experimental configuration
 * choice. Kept as a narrow dependency so ordinary configuration persistence
 * does not need to know about recipes or cohort implementation details. */
export type DemonstrationApproachEligibility = Pick<
  DemonstrationEligibility,
  "reasons" | "selectable"
>;

export class PostgresLessonConfigurationService implements LessonConfigurationService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
    private readonly demonstrationEligibility: (input: {
      ownerUserId: Identifier;
      projectId: Identifier;
    }) => Promise<DemonstrationApproachEligibility> = async () => ({
      selectable: false,
      reasons: [],
    }),
  ) {}

  public async get(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<LessonConfigurationResponse> {
    const [configuration, source] = await Promise.all([
      this.loadConfiguration(ownerUserId, projectId),
      this.loadSourceContext(ownerUserId, projectId),
    ]);
    return lessonConfigurationResponseSchema.parse({
      configuration:
        configuration === undefined ? null : toConfiguration(configuration),
      source: {
        parsedDocumentVersion: source.parsedDocumentVersion,
        sourceReviewComplete: source.sourceReviewComplete,
      },
      narrationTarget:
        configuration === undefined
          ? null
          : narrationWordCountRange(configuration.targetDurationSeconds),
      canProceed: configuration !== undefined && source.sourceReviewComplete,
    });
  }

  public async save(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
    /** ST-105. Set when a prompt-to-video run acts for the owner. */
    oneShotRunId?: Identifier | undefined;
  }): Promise<LessonConfigurationResponse> {
    const parsed = parseBoundary(lessonConfigurationInputSchema, input.body);
    const timestamp = this.now();
    return this.database.transaction(async (transaction) => {
      const project = await this.loadProject(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (project === undefined) throw configurationNotFound();

      const source = await this.loadSourceContextWithin(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (!source.sourceReviewComplete || source.parsedDocumentVersion === null)
        throw sourceNotConfirmed();

      const current = await this.loadConfigurationWithin(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      assertExpectedVersion(current, parsed.expectedVersion);

      // ST-103. A newly chosen track must be an active catalog row. Keeping
      // the stored choice (omitted field, or the same ID re-sent) is always
      // allowed, so retiring a track never blocks unrelated saves.
      const soundBedTrackId =
        parsed.soundBed === undefined
          ? (current?.soundBedTrackId ?? null)
          : parsed.soundBed === soundBedNone
            ? null
            : parsed.soundBed;
      if (
        soundBedTrackId !== null &&
        soundBedTrackId !== (current?.soundBedTrackId ?? null)
      ) {
        const [track] = await transaction
          .select({ trackId: soundBedTracks.trackId })
          .from(soundBedTracks)
          .where(
            and(
              eq(soundBedTracks.trackId, soundBedTrackId),
              eq(soundBedTracks.status, "active"),
            ),
          )
          .limit(1);
        if (track === undefined)
          throw new PublicError(
            "validation_failed",
            "Request validation failed.",
            400,
            false,
            { soundBed: "Choose a sound bed from the catalog, or none." },
          );
      }

      // A stale or hand-crafted request must not persist an experimental choice
      // merely because the browser hid its radio control. Recheck the *effective*
      // value too: an existing demonstration choice remains subject to the same
      // rule when another configuration field is saved.
      const effectiveApproach =
        parsed.videoApproach ?? current?.videoApproach ?? defaultVideoApproach;
      if (effectiveApproach === "demonstration") {
        const eligibility = await this.demonstrationEligibility({
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        if (!eligibility.selectable)
          throw new PublicError(
            "bad_request",
            "The demonstration-led approach is not available for this lesson.",
            409,
            false,
            Object.fromEntries(
              eligibility.reasons.map((reason, index) => [
                `reasons.${index}`,
                `${reason.code}: ${reason.suggestedCorrection}`,
              ]),
            ),
          );
      }

      const nextVersion = current === undefined ? 1 : current.version + 1;
      let saved: ConfigRow;
      if (current === undefined) {
        const [created] = await transaction
          .insert(lessonConfigurations)
          .values({
            id: createId(timestamp),
            projectId: input.projectId,
            ownerUserId: input.ownerUserId,
            version: 1,
            ageBand: parsed.ageBand,
            difficulty: parsed.difficulty,
            subject: parsed.subject,
            lessonTitle: parsed.lessonTitle,
            targetDurationSeconds: parsed.targetDurationSeconds,
            tone: parsed.tone,
            visualTheme: "mvp-default",
            videoApproach: parsed.videoApproach ?? defaultVideoApproach,
            creativeStylePack: parsed.creativeStylePack ?? null,
            soundBedTrackId,
            focusPrompt: parsed.focusPrompt ?? null,
            includeRecallQuestions: parsed.includeRecallQuestions,
            sourceParsedDocumentVersion: source.parsedDocumentVersion,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .onConflictDoNothing({
            target: [lessonConfigurations.projectId],
          })
          .returning();
        if (created === undefined) throw configurationConflict();
        saved = created;
      } else {
        const [updated] = await transaction
          .update(lessonConfigurations)
          .set({
            version: nextVersion,
            ageBand: parsed.ageBand,
            difficulty: parsed.difficulty,
            subject: parsed.subject,
            lessonTitle: parsed.lessonTitle,
            targetDurationSeconds: parsed.targetDurationSeconds,
            tone: parsed.tone,
            // Omitting the field leaves the stored choice alone, which is what
            // a client that predates ST-096 means by not sending it. Only an
            // explicit value changes the approach.
            ...(parsed.videoApproach === undefined
              ? {}
              : { videoApproach: parsed.videoApproach }),
            // Same omission-keeps-existing-value semantics as videoApproach.
            ...(parsed.creativeStylePack === undefined
              ? {}
              : { creativeStylePack: parsed.creativeStylePack }),
            soundBedTrackId,
            // ST-104. Same omission-keeps-existing-value semantics; an
            // explicit `null` clears the focus.
            ...(parsed.focusPrompt === undefined
              ? {}
              : { focusPrompt: parsed.focusPrompt }),
            includeRecallQuestions: parsed.includeRecallQuestions,
            sourceParsedDocumentVersion: source.parsedDocumentVersion,
            updatedAt: timestamp,
          })
          .where(
            and(
              eq(lessonConfigurations.id, current.id),
              eq(lessonConfigurations.ownerUserId, input.ownerUserId),
              eq(lessonConfigurations.version, current.version),
            ),
          )
          .returning();
        if (updated === undefined) throw configurationConflict();
        saved = updated;
      }

      if (project.stage === "ingestion_review") {
        assertProjectStageTransition(
          "ingestion_review",
          "lesson_configuration",
        );
        await transaction
          .update(projects)
          .set({
            stage: "lesson_configuration",
            updatedAt: timestamp,
            revision: sql`${projects.revision} + 1`,
          })
          .where(
            and(
              eq(projects.id, input.projectId),
              eq(projects.ownerUserId, input.ownerUserId),
            ),
          );
      }

      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: requestActor(input),
        eventType: "lesson.configuration_saved",
        target: { type: "lesson_configuration", id: saved.id },
        correlationId: input.correlationId,
        metadata: {
          version: saved.version,
          videoApproach: saved.videoApproach,
          creativeStylePack: saved.creativeStylePack,
          soundBed: readSoundBedChoice(saved.soundBedTrackId),
          // ST-104. The focus is user content: record only its presence.
          focusSet: saved.focusPrompt !== null,
          sourceParsedDocumentVersion: saved.sourceParsedDocumentVersion,
          stage:
            project.stage === "ingestion_review"
              ? "lesson_configuration"
              : project.stage,
        },
        occurredAt: timestamp,
      });

      return lessonConfigurationResponseSchema.parse({
        configuration: toConfiguration(saved),
        source: {
          parsedDocumentVersion: source.parsedDocumentVersion,
          sourceReviewComplete: source.sourceReviewComplete,
        },
        narrationTarget: narrationWordCountRange(saved.targetDurationSeconds),
        canProceed: true,
      });
    });
  }

  private async loadProject(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<typeof projects.$inferSelect | undefined> {
    const [project] = await executor
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.ownerUserId, ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    return project;
  }

  private async loadConfiguration(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ConfigRow | undefined> {
    const [row] = await this.database
      .select()
      .from(lessonConfigurations)
      .where(
        and(
          eq(lessonConfigurations.ownerUserId, ownerUserId),
          eq(lessonConfigurations.projectId, projectId),
        ),
      )
      .limit(1);
    return row;
  }

  private async loadConfigurationWithin(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ConfigRow | undefined> {
    const [row] = await executor
      .select()
      .from(lessonConfigurations)
      .where(
        and(
          eq(lessonConfigurations.ownerUserId, ownerUserId),
          eq(lessonConfigurations.projectId, projectId),
        ),
      )
      .limit(1)
      .for("update");
    return row;
  }

  private async loadSourceContext(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<SourceContext> {
    const doc = await findLatestProjectParsedDocument(this.database, {
      ownerUserId,
      projectId,
    });
    if (doc === undefined)
      return { parsedDocumentVersion: null, sourceReviewComplete: false };

    const [quality] = await this.database
      .select({
        status: ingestionQualityReports.status,
      })
      .from(ingestionQualityReports)
      .where(eq(ingestionQualityReports.parsedDocumentId, doc.id))
      .limit(1);

    const [snapshot] = await this.database
      .select({ id: sourceSnapshots.id })
      .from(sourceSnapshots)
      .where(
        and(
          eq(sourceSnapshots.ownerUserId, ownerUserId),
          eq(sourceSnapshots.projectId, projectId),
        ),
      )
      .limit(1);

    return {
      parsedDocumentVersion: doc.version,
      sourceReviewComplete:
        snapshot !== undefined || quality?.status === "ready",
    };
  }

  private async loadSourceContextWithin(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<SourceContext> {
    const doc = await findLatestProjectParsedDocument(executor, {
      ownerUserId,
      projectId,
    });
    if (doc === undefined)
      return { parsedDocumentVersion: null, sourceReviewComplete: false };

    const [quality] = await executor
      .select({
        status: ingestionQualityReports.status,
      })
      .from(ingestionQualityReports)
      .where(eq(ingestionQualityReports.parsedDocumentId, doc.id))
      .limit(1);

    const [snapshot] = await executor
      .select({ id: sourceSnapshots.id })
      .from(sourceSnapshots)
      .where(
        and(
          eq(sourceSnapshots.ownerUserId, ownerUserId),
          eq(sourceSnapshots.projectId, projectId),
        ),
      )
      .limit(1);

    return {
      parsedDocumentVersion: doc.version,
      sourceReviewComplete:
        snapshot !== undefined || quality?.status === "ready",
    };
  }
}

function toConfiguration(row: ConfigRow): NonNullable<LessonConfiguration> {
  return lessonConfigurationSchema.parse({
    version: row.version,
    ageBand: row.ageBand,
    difficulty: row.difficulty,
    subject: row.subject,
    lessonTitle: row.lessonTitle,
    targetDurationSeconds: row.targetDurationSeconds,
    tone: row.tone,
    visualTheme: row.visualTheme,
    // ST-096. A row written before the column existed is impossible - the
    // migration gave every row `standard` - but the reader is used anyway so
    // the whole codebase has exactly one place that decides what an absent or
    // unknown approach means.
    videoApproach: readVideoApproach(row.videoApproach),
    creativeStylePack: row.creativeStylePack,
    // ST-103. `null` - every row stored before this story - reads as `none`.
    soundBed: readSoundBedChoice(row.soundBedTrackId),
    // ST-104. `null` - every row stored before this story - means no focus.
    focusPrompt: row.focusPrompt,
    includeRecallQuestions: row.includeRecallQuestions,
    sourceParsedDocumentVersion: row.sourceParsedDocumentVersion,
    updatedAt: serializeUtcTimestamp(row.updatedAt),
  });
}

function assertExpectedVersion(
  current: ConfigRow | undefined,
  expectedVersion: number,
): void {
  if (
    (current === undefined && expectedVersion !== 0) ||
    (current !== undefined && current.version !== expectedVersion)
  )
    throw configurationConflict();
}

function parseBoundary<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new PublicError(
    "validation_failed",
    "Request validation failed.",
    400,
    false,
    Object.fromEntries(
      result.error.issues.map((issue) => [
        issue.path.join(".") || "root",
        issue.message,
      ]),
    ),
  );
}

function configurationNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested resource was not found.",
    404,
  );
}

function sourceNotConfirmed(): PublicError {
  return new PublicError(
    "bad_request",
    "Source content must be confirmed before configuring the lesson.",
    409,
  );
}

function configurationConflict(): PublicError {
  return new PublicError(
    "bad_request",
    "The lesson configuration changed. Please refresh and try again.",
    409,
  );
}

export type { LessonConfigurationInput };
