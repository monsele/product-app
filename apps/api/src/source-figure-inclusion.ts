import { createId, PublicError, type Identifier } from "@avlp/config";
import {
  extractedFigures,
  figureInclusionOverlays,
  nextRevision,
  parsedDocuments,
  sourceFigureInvalidations,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  effectiveFigureSchema,
  figureInclusionInputSchema,
  type EffectiveFigure,
} from "@avlp/schemas";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

/** Immutable figure shape needed to build the effective projection. */
export interface EffectiveFigureInput {
  id: Identifier;
  order: number;
  pageStart: number;
  pageEnd: number;
  captionBlockId: string | null;
  altText: string | null;
  sourceLocator: string | null;
  contentType: string | null;
  width: number | null;
  height: number | null;
}

export interface FigureOverlayState {
  included: boolean;
  revision: number;
}

/**
 * Projects immutable extracted figures through their inclusion overlays into
 * the effective figure view used by the review UI and asset-planning filters.
 * A figure with no overlay is included with revision 0.
 */
export function projectEffectiveFigures(
  figures: readonly EffectiveFigureInput[],
  overlays: ReadonlyMap<string, FigureOverlayState>,
): EffectiveFigure[] {
  return figures.map((figure) => {
    const overlay = overlays.get(figure.id);
    return effectiveFigureSchema.parse({
      id: figure.id,
      order: figure.order,
      pageStart: figure.pageStart,
      pageEnd: figure.pageEnd,
      ...(figure.captionBlockId === null
        ? {}
        : { captionBlockId: figure.captionBlockId }),
      ...(figure.altText === null ? {} : { altText: figure.altText }),
      ...(figure.sourceLocator === null
        ? {}
        : { sourceLocator: figure.sourceLocator }),
      contentType: figure.contentType,
      width: figure.width,
      height: figure.height,
      included: overlay?.included ?? true,
      revision: overlay?.revision ?? 0,
    });
  });
}

export interface FigureInclusionService {
  update(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    figureId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<EffectiveFigure>;
}

export class PostgresFigureInclusionService implements FigureInclusionService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async update(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    figureId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<EffectiveFigure> {
    const parsed = parseBoundary(figureInclusionInputSchema, input.body);
    const document = await this.latestDocument(
      input.ownerUserId,
      input.projectId,
    );
    if (document === undefined) throw figureInclusionNotFound();

    return this.database.transaction(async (transaction) => {
      const figure = await this.loadFigure(
        transaction,
        document.id,
        input.figureId,
      );
      if (figure === undefined) throw figureInclusionNotFound();

      const current = await this.loadOverlay(
        transaction,
        input.ownerUserId,
        input.projectId,
        input.figureId,
      );
      if (
        (current === undefined && parsed.revision !== 0) ||
        (current !== undefined && current.revision !== parsed.revision)
      )
        throw figureInclusionConflict();

      const timestamp = this.now();
      const nextRevisionValue =
        current === undefined ? 1 : nextRevision(current.revision);

      if (current === undefined) {
        const [created] = await transaction
          .insert(figureInclusionOverlays)
          .values({
            id: createId(timestamp),
            projectId: input.projectId,
            ownerUserId: input.ownerUserId,
            parsedDocumentId: document.id,
            figureId: input.figureId,
            included: parsed.included,
            revision: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .onConflictDoNothing({
            target: [
              figureInclusionOverlays.projectId,
              figureInclusionOverlays.figureId,
            ],
          })
          .returning();
        if (created === undefined) throw figureInclusionConflict();
      } else {
        const [updated] = await transaction
          .update(figureInclusionOverlays)
          .set({
            included: parsed.included,
            revision: nextRevisionValue,
            updatedAt: timestamp,
          })
          .where(
            and(
              eq(figureInclusionOverlays.projectId, input.projectId),
              eq(figureInclusionOverlays.figureId, input.figureId),
              eq(figureInclusionOverlays.revision, current.revision),
            ),
          )
          .returning();
        if (updated === undefined) throw figureInclusionConflict();
      }

      if (parsed.included === false) {
        await this.recordInvalidation(
          transaction,
          {
            ownerUserId: input.ownerUserId,
            projectId: input.projectId,
            parsedDocumentId: document.id,
            figureId: input.figureId,
          },
          nextRevisionValue,
          timestamp,
        );
      }
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: parsed.included
          ? "source.figure_restored"
          : "source.figure_updated",
        target: { type: "source_figure", id: input.figureId },
        correlationId: input.correlationId,
        metadata: {
          parsedDocumentId: document.id,
          sectionId: figure.sectionId,
          included: parsed.included,
          revision: nextRevisionValue,
        },
        occurredAt: timestamp,
      });

      return projectEffectiveFigures(
        [toEffectiveInput(figure)],
        new Map([
          [
            input.figureId,
            { included: parsed.included, revision: nextRevisionValue },
          ],
        ]),
      )[0]!;
    });
  }

  private async recordInvalidation(
    executor: DatabaseExecutor,
    identity: {
      ownerUserId: Identifier;
      projectId: Identifier;
      parsedDocumentId: Identifier;
      figureId: Identifier;
    },
    figureRevision: number,
    timestamp: Date,
  ): Promise<void> {
    await executor
      .insert(sourceFigureInvalidations)
      .values({
        id: createId(timestamp),
        projectId: identity.projectId,
        ownerUserId: identity.ownerUserId,
        parsedDocumentId: identity.parsedDocumentId,
        figureId: identity.figureId,
        figureRevision,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing({
        target: [
          sourceFigureInvalidations.projectId,
          sourceFigureInvalidations.figureId,
          sourceFigureInvalidations.figureRevision,
        ],
      });
  }

  private async latestDocument(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<typeof parsedDocuments.$inferSelect | undefined> {
    const [document] = await this.database
      .select()
      .from(parsedDocuments)
      .where(
        and(
          eq(parsedDocuments.ownerUserId, ownerUserId),
          eq(parsedDocuments.projectId, projectId),
        ),
      )
      .orderBy(desc(parsedDocuments.createdAt))
      .limit(1);
    return document;
  }

  private async loadFigure(
    executor: DatabaseExecutor,
    parsedDocumentId: Identifier,
    figureId: Identifier,
  ): Promise<typeof extractedFigures.$inferSelect | undefined> {
    const [figure] = await executor
      .select()
      .from(extractedFigures)
      .where(
        and(
          eq(extractedFigures.id, figureId),
          eq(extractedFigures.parsedDocumentId, parsedDocumentId),
        ),
      )
      .limit(1);
    return figure;
  }

  private async loadOverlay(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    figureId: Identifier,
  ): Promise<typeof figureInclusionOverlays.$inferSelect | undefined> {
    const [row] = await executor
      .select()
      .from(figureInclusionOverlays)
      .where(
        and(
          eq(figureInclusionOverlays.ownerUserId, ownerUserId),
          eq(figureInclusionOverlays.projectId, projectId),
          eq(figureInclusionOverlays.figureId, figureId),
        ),
      )
      .limit(1);
    return row;
  }
}

function toEffectiveInput(
  row: typeof extractedFigures.$inferSelect,
): EffectiveFigureInput {
  return {
    id: row.id as Identifier,
    order: row.order,
    pageStart: row.pageStart,
    pageEnd: row.pageEnd,
    captionBlockId: row.captionBlockId,
    altText: row.altText,
    sourceLocator: row.sourceLocator,
    contentType: row.contentType,
    width: row.width,
    height: row.height,
  };
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

function figureInclusionNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested resource was not found.",
    404,
  );
}

function figureInclusionConflict(): PublicError {
  return new PublicError(
    "bad_request",
    "The figure selection changed. Please refresh and try again.",
    409,
  );
}
