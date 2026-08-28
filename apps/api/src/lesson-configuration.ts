import { createId, PublicError, serializeUtcTimestamp, type Identifier } from "@avlp/config";
import {
  ingestionQualityReports,
  lessonConfigurations,
  parsedDocuments,
  projects,
  sourceSnapshots,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  lessonConfigurationInputSchema,
  lessonConfigurationSchema,
  lessonConfigurationResponseSchema,
  narrationWordCountRange,
  type LessonConfiguration,
  type LessonConfigurationInput,
  type LessonConfigurationResponse,
} from "@avlp/schemas";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { assertProjectStageTransition } from "./projects.js";

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
  }): Promise<LessonConfigurationResponse>;
}

type ConfigRow = typeof lessonConfigurations.$inferSelect;
type SourceContext = {
  parsedDocumentVersion: number | null;
  sourceReviewComplete: boolean;
};

export class PostgresLessonConfigurationService
  implements LessonConfigurationService
{
  public constructor(
    private readonly database: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
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
      canProceed:
        configuration !== undefined && source.sourceReviewComplete,
    });
  }

  public async save(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
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
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "lesson.configuration_saved",
        target: { type: "lesson_configuration", id: saved.id },
        correlationId: input.correlationId,
        metadata: {
          version: saved.version,
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
    const [doc] = await this.database
      .select({
        id: parsedDocuments.id,
        version: parsedDocuments.version,
      })
      .from(parsedDocuments)
      .where(
        and(
          eq(parsedDocuments.ownerUserId, ownerUserId),
          eq(parsedDocuments.projectId, projectId),
        ),
      )
      .orderBy(desc(parsedDocuments.createdAt))
      .limit(1);
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
    const [doc] = await executor
      .select({
        id: parsedDocuments.id,
        version: parsedDocuments.version,
      })
      .from(parsedDocuments)
      .where(
        and(
          eq(parsedDocuments.ownerUserId, ownerUserId),
          eq(parsedDocuments.projectId, projectId),
        ),
      )
      .orderBy(desc(parsedDocuments.createdAt))
      .limit(1)
      .for("update");
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

function toConfiguration(
  row: ConfigRow,
): NonNullable<LessonConfiguration> {
  return lessonConfigurationSchema.parse({
    version: row.version,
    ageBand: row.ageBand,
    difficulty: row.difficulty,
    subject: row.subject,
    lessonTitle: row.lessonTitle,
    targetDurationSeconds: row.targetDurationSeconds,
    tone: row.tone,
    visualTheme: row.visualTheme,
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
