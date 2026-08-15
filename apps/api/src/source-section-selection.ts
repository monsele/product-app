import {
  createId,
  PublicError,
  type Identifier,
} from "@avlp/config";
import {
  nextRevision,
  parsedDocuments,
  parsedSections,
  sourceSectionOverlays,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  sourceSectionOverlayInputSchema,
  sourceSectionSelectionResponseSchema,
  sourceSectionSelectionSchema,
  type SourceSectionSelection,
  type SourceSectionSelectionResponse,
} from "@avlp/schemas";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

/** Immutable section shape needed to build the effective projection. */
export interface EffectiveSectionInput {
  id: Identifier;
  parentSectionId: string | null;
  order: number;
  level: number;
  heading: string;
  pageStart: number;
  pageEnd: number;
}

export interface OverlayState {
  included: boolean;
  displayHeading: string | null;
  reviewOrder: number | null;
  revision: number;
}

/**
 * Projects immutable parsed sections through their overlays into the effective
 * source-section view used by the review UI and downstream source queries.
 * A section with no overlay is included with its original heading.
 */
export function projectEffectiveSections(
  sections: readonly EffectiveSectionInput[],
  overlays: ReadonlyMap<string, OverlayState>,
): SourceSectionSelection[] {
  return sections.map((section) => {
    const overlay = overlays.get(section.id);
    return sourceSectionSelectionSchema.parse({
      id: section.id,
      ...(section.parentSectionId === null
        ? {}
        : { parentSectionId: section.parentSectionId }),
      order: section.order,
      level: section.level,
      heading: section.heading,
      displayHeading: overlay?.displayHeading ?? null,
      included: overlay?.included ?? true,
      reviewOrder: overlay?.reviewOrder ?? null,
      pageStart: section.pageStart,
      pageEnd: section.pageEnd,
      revision: overlay?.revision ?? 0,
    });
  });
}

export interface SourceSectionSelectionService {
  list(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<SourceSectionSelectionResponse>;
  update(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sectionId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<SourceSectionSelection>;
}

export class PostgresSourceSectionSelectionService
  implements SourceSectionSelectionService
{
  public constructor(
    private readonly database: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async list(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<SourceSectionSelectionResponse> {
    const document = await this.latestDocument(ownerUserId, projectId);
    if (document === undefined) throw sourceSelectionNotFound();
    const { sections, overlays } = await this.loadSectionsAndOverlays(
      this.database,
      document.id,
      ownerUserId,
      projectId,
    );
    return sourceSectionSelectionResponseSchema.parse({
      documentId: document.id,
      sections: projectEffectiveSections(sections, overlays),
    });
  }

  public async update(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sectionId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<SourceSectionSelection> {
    const parsed = parseBoundary(sourceSectionOverlayInputSchema, input.body);
    const document = await this.latestDocument(
      input.ownerUserId,
      input.projectId,
    );
    if (document === undefined) throw sourceSelectionNotFound();

    return this.database.transaction(async (transaction) => {
      const { sections, overlays } = await this.loadSectionsAndOverlays(
        transaction,
        document.id,
        input.ownerUserId,
        input.projectId,
      );
      const section = sections.find(
        (candidate) => candidate.id === input.sectionId,
      );
      if (section === undefined) throw sourceSelectionNotFound();

      const current = overlays.get(input.sectionId);
      if (
        (current === undefined && parsed.revision !== 0) ||
        (current !== undefined && current.revision !== parsed.revision)
      )
        throw sourceSelectionConflict();

      const nextIncluded = parsed.included ?? current?.included ?? true;
      const nextDisplayHeading =
        parsed.displayHeading === undefined
          ? (current?.displayHeading ?? null)
          : parsed.displayHeading;
      const nextReviewOrder =
        parsed.reviewOrder === undefined
          ? (current?.reviewOrder ?? null)
          : parsed.reviewOrder;

      const candidateOverlays = new Map(overlays);
      candidateOverlays.set(input.sectionId, {
        included: nextIncluded,
        displayHeading: nextDisplayHeading,
        reviewOrder: nextReviewOrder,
        revision: (current?.revision ?? 0) + 1,
      });
      if (!projectEffectiveSections(sections, candidateOverlays).some(
        (entry) => entry.included,
      ))
        throw atLeastOneSectionRequired();

      const timestamp = this.now();
      const nextRevisionValue = current === undefined
        ? 1
        : nextRevision(current.revision);

      if (current === undefined) {
        const [created] = await transaction
          .insert(sourceSectionOverlays)
          .values({
            id: createId(timestamp),
            projectId: input.projectId,
            ownerUserId: input.ownerUserId,
            parsedDocumentId: document.id,
            sectionId: input.sectionId,
            included: nextIncluded,
            displayHeading: nextDisplayHeading,
            reviewOrder: nextReviewOrder,
            revision: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .onConflictDoNothing({
            target: [
              sourceSectionOverlays.projectId,
              sourceSectionOverlays.sectionId,
            ],
          })
          .returning();
        if (created === undefined) throw sourceSelectionConflict();
      } else {
        const [updated] = await transaction
          .update(sourceSectionOverlays)
          .set({
            included: nextIncluded,
            displayHeading: nextDisplayHeading,
            reviewOrder: nextReviewOrder,
            revision: nextRevisionValue,
            updatedAt: timestamp,
          })
          .where(
            and(
              eq(sourceSectionOverlays.projectId, input.projectId),
              eq(sourceSectionOverlays.sectionId, input.sectionId),
              eq(sourceSectionOverlays.revision, current.revision),
            ),
          )
          .returning();
        if (updated === undefined) throw sourceSelectionConflict();
      }

      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "source.selection_updated",
        target: { type: "source_section", id: input.sectionId },
        correlationId: input.correlationId,
        metadata: {
          parsedDocumentId: document.id,
          included: nextIncluded,
          ...(nextDisplayHeading === null
            ? {}
            : { displayHeading: nextDisplayHeading }),
          ...(nextReviewOrder === null ? {} : { reviewOrder: nextReviewOrder }),
        },
        occurredAt: timestamp,
      });

      return sourceSectionSelectionSchema.parse({
        id: section.id,
        ...(section.parentSectionId === null
          ? {}
          : { parentSectionId: section.parentSectionId }),
        order: section.order,
        level: section.level,
        heading: section.heading,
        displayHeading: nextDisplayHeading,
        included: nextIncluded,
        reviewOrder: nextReviewOrder,
        pageStart: section.pageStart,
        pageEnd: section.pageEnd,
        revision: nextRevisionValue,
      });
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

  private async loadSectionsAndOverlays(
    executor: DatabaseExecutor,
    parsedDocumentId: Identifier,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<{
    sections: readonly EffectiveSectionInput[];
    overlays: Map<string, OverlayState>;
  }> {
    const [sections, overlayRows] = await Promise.all([
      executor
        .select()
        .from(parsedSections)
        .where(eq(parsedSections.parsedDocumentId, parsedDocumentId))
        .orderBy(parsedSections.order),
      executor
        .select()
        .from(sourceSectionOverlays)
        .where(
          and(
            eq(sourceSectionOverlays.ownerUserId, ownerUserId),
            eq(sourceSectionOverlays.projectId, projectId),
            eq(sourceSectionOverlays.parsedDocumentId, parsedDocumentId),
          ),
        ),
    ]);
    const overlays = new Map<string, OverlayState>();
    for (const row of overlayRows)
      overlays.set(row.sectionId, {
        included: row.included,
        displayHeading: row.displayHeading,
        reviewOrder: row.reviewOrder,
        revision: row.revision,
      });
    return {
      sections: sections.map((section) => ({
        id: section.id as Identifier,
        parentSectionId: section.parentSectionId,
        order: section.order,
        level: section.level,
        heading: section.heading,
        pageStart: section.pageStart,
        pageEnd: section.pageEnd,
      })),
      overlays,
    };
  }
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

function sourceSelectionNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested resource was not found.",
    404,
  );
}

function sourceSelectionConflict(): PublicError {
  return new PublicError(
    "bad_request",
    "The section selection changed. Please refresh and try again.",
    409,
  );
}

function atLeastOneSectionRequired(): PublicError {
  return new PublicError(
    "bad_request",
    "At least one section must remain included.",
    409,
  );
}
