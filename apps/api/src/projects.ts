import { Buffer } from "node:buffer";
import {
  createId,
  identifierSchema,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import type {
  OwnerScopedProjectRepository,
  ProjectAccessScope,
} from "@avlp/auth";
import { createJobEnvelope, createIdempotencyKey } from "@avlp/jobs";
import {
  jobs,
  outboxEvents,
  projectCloneRequests,
  projects,
  type DatabaseClient,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  projectCleanupJobPayloadSchema,
  projectCloneIdempotencyKeySchema,
  projectDeleteInputSchema,
  projectDetailSchema,
  projectDuplicateInputSchema,
  projectTitleSchema,
  type ProjectDetail,
  type ProjectStage,
  type ProjectSummary,
} from "@avlp/schemas";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

export {
  projectCleanupJobPayloadSchema,
  projectCloneIdempotencyKeySchema,
  projectDeleteInputSchema,
  projectDetailSchema,
  projectDuplicateInputSchema,
  projectTitleSchema,
} from "@avlp/schemas";
export { projectStageSchema, projectSummarySchema } from "@avlp/schemas";
export type {
  ProjectDetail,
  ProjectStage,
  ProjectSummary,
} from "@avlp/schemas";

export const createProjectInputSchema = z.object({ title: projectTitleSchema });

/** MVP retained-deletion window before a worker removes project-owned objects. */
export const projectDeletionRetentionMs = 30 * 24 * 60 * 60 * 1_000;

const projectListQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ProjectListQuery = { cursor?: string; limit: number };
export type ProjectListPage = { items: ProjectSummary[]; nextCursor?: string };

const projectCursorSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().datetime({ offset: true }),
  id: identifierSchema,
});
type ProjectCursor = z.infer<typeof projectCursorSchema>;

export const projectStageTransitions: Readonly<
  Record<ProjectStage, readonly ProjectStage[]>
> = {
  draft: ["uploading"],
  uploading: ["ingesting"],
  ingesting: ["ingestion_review"],
  ingestion_review: ["lesson_configuration"],
  lesson_configuration: ["objectives_review"],
  objectives_review: ["outline_review"],
  outline_review: ["narration_storyboard_review"],
  narration_storyboard_review: ["audio_generation"],
  audio_generation: ["ready_for_validation"],
  ready_for_validation: ["ready_to_render"],
  ready_to_render: ["rendering"],
  rendering: ["completed"],
  completed: [],
};

export function assertProjectStageTransition(
  current: ProjectStage,
  next: ProjectStage,
): void {
  const permittedTransitions = projectStageTransitions[current];
  if (
    permittedTransitions === undefined ||
    !permittedTransitions.includes(next)
  )
    throw new RangeError(
      `Project stage cannot transition from ${current} to ${next}.`,
    );
}

export interface ProjectRepository extends OwnerScopedProjectRepository {
  create(input: {
    ownerUserId: Identifier;
    title: string;
    correlationId: Identifier;
  }): Promise<ProjectDetail>;
  listOwnedProjects(
    ownerUserId: Identifier,
    query: ProjectListQuery,
  ): Promise<ProjectListPage>;
  loadOwnedProjectDetail(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ProjectDetail | null>;
  duplicate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    title?: string;
    idempotencyKey: string;
    correlationId: Identifier;
  }): Promise<ProjectDetail>;
  delete(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    correlationId: Identifier;
  }): Promise<void>;
}

export class ProjectService {
  public constructor(private readonly repository: ProjectRepository) {}

  public create(
    ownerUserId: Identifier,
    input: unknown,
    correlationId: Identifier,
  ): Promise<ProjectDetail> {
    const parsed = parseProjectBoundary(createProjectInputSchema, input);
    return this.repository.create({ ...parsed, ownerUserId, correlationId });
  }

  public list(
    ownerUserId: Identifier,
    query: unknown,
  ): Promise<ProjectListPage> {
    return this.repository.listOwnedProjects(
      ownerUserId,
      parseProjectBoundary(projectListQuerySchema, query) as ProjectListQuery,
    );
  }

  public async detail(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ProjectDetail | null> {
    return this.repository.loadOwnedProjectDetail(ownerUserId, projectId);
  }

  public duplicate(
    ownerUserId: Identifier,
    projectId: Identifier,
    input: unknown,
    correlationId: Identifier,
    idempotencyKey: unknown,
  ): Promise<ProjectDetail> {
    const parsed = parseProjectBoundary(projectDuplicateInputSchema, input);
    const parsedIdempotencyKey = parseProjectBoundary(
      projectCloneIdempotencyKeySchema,
      idempotencyKey,
    );
    return this.repository.duplicate({
      ownerUserId,
      projectId,
      correlationId,
      idempotencyKey: parsedIdempotencyKey,
      ...(parsed.title === undefined ? {} : { title: parsed.title }),
    });
  }

  public async delete(
    ownerUserId: Identifier,
    projectId: Identifier,
    input: unknown,
    correlationId: Identifier,
  ): Promise<void> {
    parseProjectBoundary(projectDeleteInputSchema, input);
    await this.repository.delete({ ownerUserId, projectId, correlationId });
  }
}

export class PostgresProjectRepository implements ProjectRepository {
  public constructor(
    private readonly executor: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async create(input: {
    ownerUserId: Identifier;
    title: string;
    correlationId: Identifier;
  }): Promise<ProjectDetail> {
    const timestamp = this.now();
    const id = createId(timestamp);
    const [record] = await this.executor.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(projects)
        .values({
          id,
          ownerUserId: input.ownerUserId,
          title: input.title,
          stage: "draft",
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning();
      if (created === undefined)
        throw new Error("The project was not persisted.");
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: id,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "project.created",
        target: { type: "project", id },
        correlationId: input.correlationId,
        metadata: { stage: "draft" },
        occurredAt: timestamp,
      });
      return [created];
    });
    if (record === undefined) throw new Error("The project was not persisted.");
    return toProjectDetail(record);
  }

  public async loadOwnedProject(
    scope: ProjectAccessScope,
  ): Promise<{ id: Identifier; ownerUserId: Identifier } | null> {
    const [project] = await this.executor
      .select({ id: projects.id, ownerUserId: projects.ownerUserId })
      .from(projects)
      .where(
        and(
          eq(projects.id, scope.projectId),
          eq(projects.ownerUserId, scope.ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    return project === undefined
      ? null
      : {
          id: project.id as Identifier,
          ownerUserId: project.ownerUserId as Identifier,
        };
  }

  public async loadOwnedProjectDetail(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ProjectDetail | null> {
    const [project] = await this.executor
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
    return project === undefined ? null : toProjectDetail(project);
  }

  public async duplicate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    title?: string;
    idempotencyKey: string;
    correlationId: Identifier;
  }): Promise<ProjectDetail> {
    const timestamp = this.now();
    return this.executor.transaction(async (transaction) => {
      const [source] = await transaction
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.ownerUserId, input.ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1);
      if (source === undefined)
        throw new PublicError(
          "not_found",
          "The requested resource was not found.",
          404,
        );

      const id = createId(timestamp);
      const [request] = await transaction
        .insert(projectCloneRequests)
        .values({
          id: createId(timestamp),
          projectId: input.projectId,
          ownerUserId: input.ownerUserId,
          duplicateProjectId: id,
          idempotencyKey: input.idempotencyKey,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoNothing({
          target: [
            projectCloneRequests.ownerUserId,
            projectCloneRequests.projectId,
            projectCloneRequests.idempotencyKey,
          ],
        })
        .returning({
          duplicateProjectId: projectCloneRequests.duplicateProjectId,
        });
      if (request === undefined) {
        const [existingRequest] = await transaction
          .select({
            duplicateProjectId: projectCloneRequests.duplicateProjectId,
          })
          .from(projectCloneRequests)
          .where(
            and(
              eq(projectCloneRequests.ownerUserId, input.ownerUserId),
              eq(projectCloneRequests.projectId, input.projectId),
              eq(projectCloneRequests.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (existingRequest === undefined)
          throw new Error("The idempotent clone request could not be read.");
        const [existingProject] = await transaction
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.id, existingRequest.duplicateProjectId),
              eq(projects.ownerUserId, input.ownerUserId),
              isNull(projects.deletedAt),
            ),
          )
          .limit(1);
        if (existingProject === undefined)
          throw new PublicError(
            "not_found",
            "The requested resource was not found.",
            404,
          );
        return toProjectDetail(existingProject);
      }
      const [duplicate] = await transaction
        .insert(projects)
        .values({
          id,
          ownerUserId: input.ownerUserId,
          title: input.title ?? duplicateProjectTitle(source.title),
          stage: "draft",
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning();
      if (duplicate === undefined)
        throw new Error("The duplicate project was not persisted.");

      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: id,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "project.duplicated",
        target: { type: "project", id },
        correlationId: input.correlationId,
        metadata: { sourceProjectId: source.id, stage: "draft" },
        occurredAt: timestamp,
      });
      return toProjectDetail(duplicate);
    });
  }

  public async delete(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    correlationId: Identifier;
  }): Promise<void> {
    const timestamp = this.now();
    const cleanupAfter = new Date(
      timestamp.getTime() + projectDeletionRetentionMs,
    );
    await this.executor.transaction(async (transaction) => {
      const [deleted] = await transaction
        .update(projects)
        .set({
          deletedAt: timestamp,
          cleanupAfter,
          updatedAt: timestamp,
          revision: sql`${projects.revision} + 1`,
        })
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.ownerUserId, input.ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .returning();
      if (deleted === undefined)
        throw new PublicError(
          "not_found",
          "The requested resource was not found.",
          404,
        );

      const cancelledJobs = await transaction
        .update(jobs)
        .set({
          state: "cancelled",
          errorClassification: "cancelled",
          errorMetadata: {
            classification: "cancelled",
            code: "PROJECT_DELETED",
            message: "The project was deleted before this job completed.",
          },
          completedAt: timestamp,
          leaseExpiresAt: null,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(jobs.ownerUserId, input.ownerUserId),
            eq(jobs.projectId, input.projectId),
            inArray(jobs.state, ["queued", "retry_wait", "running"]),
          ),
        )
        .returning({ id: jobs.id });

      const cleanupJobId = createId(timestamp);
      const cleanupPayload = projectCleanupJobPayloadSchema.parse({
        schemaVersion: 1,
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        deletedAt: serializeUtcTimestamp(timestamp),
        cleanupAfter: serializeUtcTimestamp(cleanupAfter),
      });
      const cleanupEnvelope = createJobEnvelope(
        projectCleanupJobPayloadSchema,
        {
          jobId: cleanupJobId,
          jobType: "project.cleanup",
          projectId: input.projectId,
          ownerUserId: input.ownerUserId,
          inputVersion: "project-deletion-v1",
          idempotencyKey: createIdempotencyKey({
            jobType: "project.cleanup",
            projectId: input.projectId,
            inputVersion: "project-deletion-v1",
            options: { cleanupAfter: cleanupPayload.cleanupAfter },
          }),
          correlationId: input.correlationId,
          payloadVersion: 1,
          payload: cleanupPayload,
          requestedAt: timestamp,
        },
      );
      await transaction.insert(jobs).values({
        id: cleanupEnvelope.jobId,
        jobType: cleanupEnvelope.jobType,
        queueName: "pipeline",
        projectId: cleanupEnvelope.projectId,
        ownerUserId: cleanupEnvelope.ownerUserId,
        inputVersion: cleanupEnvelope.inputVersion,
        idempotencyKey: cleanupEnvelope.idempotencyKey,
        correlationId: cleanupEnvelope.correlationId,
        payloadVersion: cleanupEnvelope.payloadVersion,
        payload: cleanupEnvelope.payload,
        availableAt: cleanupAfter,
      });
      await transaction.insert(outboxEvents).values({
        id: createId(timestamp),
        jobId: cleanupEnvelope.jobId,
        eventType: "project.cleanup.requested.v1",
        queueName: "pipeline",
        envelope: cleanupEnvelope,
        deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 },
        availableAt: cleanupAfter,
      });
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "project.deleted",
        target: { type: "project", id: input.projectId },
        correlationId: input.correlationId,
        metadata: {
          cancelledJobCount: cancelledJobs.length,
          cleanupJobId,
          cleanupAfter: serializeUtcTimestamp(cleanupAfter),
        },
        occurredAt: timestamp,
      });
    });
  }

  public async listOwnedProjects(
    ownerUserId: Identifier,
    query: ProjectListQuery,
  ): Promise<ProjectListPage> {
    const cursor =
      query.cursor === undefined
        ? undefined
        : decodeProjectCursor(query.cursor);
    const rows = await this.executor
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.ownerUserId, ownerUserId),
          isNull(projects.deletedAt),
          ...(cursor === undefined
            ? []
            : [
                or(
                  lt(projects.updatedAt, new Date(cursor.updatedAt)),
                  and(
                    eq(projects.updatedAt, new Date(cursor.updatedAt)),
                    lt(projects.id, cursor.id),
                  ),
                ),
              ]),
        ),
      )
      .orderBy(desc(projects.updatedAt), desc(projects.id))
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit).map(toProjectDetail);
    const extra = rows[query.limit];
    return {
      items: page,
      ...(extra === undefined || page.length === 0
        ? {}
        : { nextCursor: encodeProjectCursor(page[page.length - 1]!) }),
    };
  }
}

function toProjectDetail(record: typeof projects.$inferSelect): ProjectDetail {
  return projectDetailSchema.parse({
    id: record.id,
    title: record.title,
    stage: record.stage,
    latestFailedOperation: record.latestFailedOperation,
    createdAt: serializeUtcTimestamp(record.createdAt),
    updatedAt: serializeUtcTimestamp(record.updatedAt),
    revision: record.revision,
  });
}

function duplicateProjectTitle(title: string): string {
  return projectTitleSchema.parse(`Copy of ${title}`.slice(0, 160));
}

function encodeProjectCursor(project: ProjectSummary): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      updatedAt: project.updatedAt,
      id: project.id,
    }),
  ).toString("base64url");
}

function decodeProjectCursor(cursor: string): ProjectCursor {
  try {
    return projectCursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
  } catch {
    throw new PublicError(
      "validation_failed",
      "Request validation failed.",
      400,
      false,
      { cursor: "Invalid project cursor." },
    );
  }
}

function parseProjectBoundary<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors = Object.fromEntries(
    result.error.issues.map((issue) => [
      issue.path.join(".") || "root",
      issue.message,
    ]),
  );
  throw new PublicError(
    "validation_failed",
    "Request validation failed.",
    400,
    false,
    fieldErrors,
  );
}
