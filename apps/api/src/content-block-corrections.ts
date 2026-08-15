import { createId, PublicError, type Identifier } from "@avlp/config";
import {
  contentBlockCorrections,
  contentBlocks,
  nextRevision,
  parsedDocuments,
  sourceContentInvalidations,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  contentBlockCorrectionInputSchema,
  contentBlockRestoreInputSchema,
  contentBlockCorrectionStateSchema,
  reviewContentBlockSchema,
  type ContentBlockCorrectionInput,
  type ReviewContentBlock,
} from "@avlp/schemas";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

/** Immutable block shape needed to build the effective-content projection. */
export interface EffectiveContentBlockInput {
  id: Identifier;
  kind: string;
  order: number;
  pageStart: number;
  pageEnd: number;
  content: Record<string, unknown>;
}

export interface CorrectionOverlayState {
  revision: number;
  correctedText: string | null;
  correctedItems: string[] | null;
  correctedLatex: string | null;
}

/**
 * Projects immutable content blocks through their correction overlays into the
 * effective review view. The immutable `content` row stays authoritative; the
 * correction overlay is attached so the UI can show original versus corrected
 * text and downstream source packages consume the corrected content.
 */
export function projectEffectiveContentBlocks(
  blocks: readonly EffectiveContentBlockInput[],
  corrections: ReadonlyMap<string, CorrectionOverlayState>,
): ReviewContentBlock[] {
  return blocks.map((block) => {
    const correction = corrections.get(block.id);
    return mapEffectiveBlock(block, correction);
  });
}

function mapEffectiveBlock(
  block: EffectiveContentBlockInput,
  correction: CorrectionOverlayState | undefined,
): ReviewContentBlock {
  const correctionState =
    correction === undefined
      ? undefined
      : contentBlockCorrectionStateSchema.parse({
          revision: correction.revision,
          correctedText: correction.correctedText,
          correctedItems: correction.correctedItems,
          correctedLatex: correction.correctedLatex,
        });
  switch (block.kind) {
    case "paragraph":
      return reviewContentBlockSchema.parse({
        id: block.id,
        kind: "paragraph",
        order: block.order,
        pageStart: block.pageStart,
        pageEnd: block.pageEnd,
        text: typeof block.content.text === "string" ? block.content.text : "",
        ...(correctionState === undefined
          ? {}
          : { correction: correctionState }),
      });
    case "list":
      return reviewContentBlockSchema.parse({
        id: block.id,
        kind: "list",
        order: block.order,
        pageStart: block.pageStart,
        pageEnd: block.pageEnd,
        items: Array.isArray(block.content.items)
          ? block.content.items.filter(
              (item): item is string => typeof item === "string",
            )
          : [],
        ...(correctionState === undefined
          ? {}
          : { correction: correctionState }),
      });
    case "equation":
      return reviewContentBlockSchema.parse({
        id: block.id,
        kind: "equation",
        order: block.order,
        pageStart: block.pageStart,
        pageEnd: block.pageEnd,
        latex:
          typeof block.content.latex === "string" ? block.content.latex : "",
        ...(typeof block.content.text === "string"
          ? { text: block.content.text }
          : {}),
        ...(correctionState === undefined
          ? {}
          : { correction: correctionState }),
      });
    case "caption":
      return reviewContentBlockSchema.parse({
        id: block.id,
        kind: "caption",
        order: block.order,
        pageStart: block.pageStart,
        pageEnd: block.pageEnd,
        text: typeof block.content.text === "string" ? block.content.text : "",
        ...(correctionState === undefined
          ? {}
          : { correction: correctionState }),
      });
    default:
      return reviewContentBlockSchema.parse({
        id: block.id,
        kind: "unsupported",
        order: block.order,
        pageStart: block.pageStart,
        pageEnd: block.pageEnd,
        parserKind:
          typeof block.content.parserKind === "string"
            ? block.content.parserKind
            : block.kind,
      });
  }
}

export interface ContentBlockCorrectionService {
  update(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ReviewContentBlock>;
  restore(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ReviewContentBlock>;
}

export class PostgresContentBlockCorrectionService implements ContentBlockCorrectionService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async update(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ReviewContentBlock> {
    const parsed = parseBoundary(contentBlockCorrectionInputSchema, input.body);
    const document = await this.latestDocument(
      input.ownerUserId,
      input.projectId,
    );
    if (document === undefined) throw blockCorrectionNotFound();

    return this.database.transaction(async (transaction) => {
      const block = await this.loadBlock(
        transaction,
        document.id,
        input.blockId,
      );
      if (block === undefined) throw blockCorrectionNotFound();
      if (block.kind !== parsed.kind)
        throw blockKindMismatch(parsed.kind, block.kind);

      const current = await this.loadCorrection(
        transaction,
        input.ownerUserId,
        input.projectId,
        input.blockId,
      );
      if (
        (current === undefined && parsed.revision !== 0) ||
        (current !== undefined && current.revision !== parsed.revision)
      )
        throw blockCorrectionConflict();

      const timestamp = this.now();
      const nextRevisionValue =
        current === undefined ? 1 : nextRevision(current.revision);
      const overlay = overlayValues(parsed);

      if (current === undefined) {
        const [created] = await transaction
          .insert(contentBlockCorrections)
          .values({
            id: createId(timestamp),
            projectId: input.projectId,
            ownerUserId: input.ownerUserId,
            parsedDocumentId: document.id,
            sectionId: block.sectionId,
            blockId: input.blockId,
            kind: parsed.kind,
            correctedText: overlay.correctedText,
            correctedItems: overlay.correctedItems,
            correctedLatex: overlay.correctedLatex,
            revision: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .onConflictDoNothing({
            target: [
              contentBlockCorrections.projectId,
              contentBlockCorrections.blockId,
            ],
          })
          .returning();
        if (created === undefined) throw blockCorrectionConflict();
      } else {
        const [updated] = await transaction
          .update(contentBlockCorrections)
          .set({
            correctedText: overlay.correctedText,
            correctedItems: overlay.correctedItems,
            correctedLatex: overlay.correctedLatex,
            revision: nextRevisionValue,
            updatedAt: timestamp,
          })
          .where(
            and(
              eq(contentBlockCorrections.projectId, input.projectId),
              eq(contentBlockCorrections.blockId, input.blockId),
              eq(contentBlockCorrections.revision, current.revision),
            ),
          )
          .returning();
        if (updated === undefined) throw blockCorrectionConflict();
      }

      await this.recordInvalidation(
        transaction,
        {
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          parsedDocumentId: document.id,
          sectionId: block.sectionId,
          blockId: input.blockId,
        },
        nextRevisionValue,
        timestamp,
      );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "source.block_corrected",
        target: { type: "source_block", id: input.blockId },
        correlationId: input.correlationId,
        metadata: {
          parsedDocumentId: document.id,
          sectionId: block.sectionId,
          kind: parsed.kind,
          revision: nextRevisionValue,
        },
        occurredAt: timestamp,
      });

      return mapEffectiveBlock(toEffectiveBlockInput(block), {
        revision: nextRevisionValue,
        correctedText: overlay.correctedText,
        correctedItems: overlay.correctedItems,
        correctedLatex: overlay.correctedLatex,
      });
    });
  }

  public async restore(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ReviewContentBlock> {
    const parsed = parseBoundary(contentBlockRestoreInputSchema, input.body);
    const document = await this.latestDocument(
      input.ownerUserId,
      input.projectId,
    );
    if (document === undefined) throw blockCorrectionNotFound();

    return this.database.transaction(async (transaction) => {
      const block = await this.loadBlock(
        transaction,
        document.id,
        input.blockId,
      );
      if (block === undefined) throw blockCorrectionNotFound();

      const current = await this.loadCorrection(
        transaction,
        input.ownerUserId,
        input.projectId,
        input.blockId,
      );
      if (current === undefined) {
        if (parsed.revision !== 0) throw blockCorrectionConflict();
        return mapEffectiveBlock(toEffectiveBlockInput(block), undefined);
      }
      if (current.revision !== parsed.revision) throw blockCorrectionConflict();

      const [deleted] = await transaction
        .delete(contentBlockCorrections)
        .where(
          and(
            eq(contentBlockCorrections.projectId, input.projectId),
            eq(contentBlockCorrections.blockId, input.blockId),
            eq(contentBlockCorrections.revision, current.revision),
          ),
        )
        .returning({ id: contentBlockCorrections.id });
      if (deleted === undefined) throw blockCorrectionConflict();

      const timestamp = this.now();
      await this.recordInvalidation(
        transaction,
        {
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          parsedDocumentId: document.id,
          sectionId: block.sectionId,
          blockId: input.blockId,
        },
        current.revision + 1,
        timestamp,
      );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "source.block_restored",
        target: { type: "source_block", id: input.blockId },
        correlationId: input.correlationId,
        metadata: {
          parsedDocumentId: document.id,
          sectionId: block.sectionId,
          kind: block.kind,
          restoredRevision: current.revision + 1,
        },
        occurredAt: timestamp,
      });

      return mapEffectiveBlock(toEffectiveBlockInput(block), undefined);
    });
  }

  private async recordInvalidation(
    executor: DatabaseExecutor,
    identity: {
      ownerUserId: Identifier;
      projectId: Identifier;
      parsedDocumentId: Identifier;
      sectionId: string;
      blockId: Identifier;
    },
    blockRevision: number,
    timestamp: Date,
  ): Promise<void> {
    await executor
      .insert(sourceContentInvalidations)
      .values({
        id: createId(timestamp),
        projectId: identity.projectId,
        ownerUserId: identity.ownerUserId,
        parsedDocumentId: identity.parsedDocumentId,
        sectionId: identity.sectionId,
        blockId: identity.blockId,
        blockRevision,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing({
        target: [
          sourceContentInvalidations.projectId,
          sourceContentInvalidations.blockId,
          sourceContentInvalidations.blockRevision,
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

  private async loadBlock(
    executor: DatabaseExecutor,
    parsedDocumentId: Identifier,
    blockId: Identifier,
  ): Promise<typeof contentBlocks.$inferSelect | undefined> {
    const [block] = await executor
      .select()
      .from(contentBlocks)
      .where(
        and(
          eq(contentBlocks.id, blockId),
          eq(contentBlocks.parsedDocumentId, parsedDocumentId),
        ),
      )
      .limit(1);
    return block;
  }

  private async loadCorrection(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    blockId: Identifier,
  ): Promise<typeof contentBlockCorrections.$inferSelect | undefined> {
    const [row] = await executor
      .select()
      .from(contentBlockCorrections)
      .where(
        and(
          eq(contentBlockCorrections.ownerUserId, ownerUserId),
          eq(contentBlockCorrections.projectId, projectId),
          eq(contentBlockCorrections.blockId, blockId),
        ),
      )
      .limit(1);
    return row;
  }
}

function toEffectiveBlockInput(
  row: typeof contentBlocks.$inferSelect,
): EffectiveContentBlockInput {
  return {
    id: row.id as Identifier,
    kind: row.kind,
    order: row.order,
    pageStart: row.pageStart,
    pageEnd: row.pageEnd,
    content: (row.content ?? {}) as Record<string, unknown>,
  };
}

function overlayValues(input: ContentBlockCorrectionInput): {
  correctedText: string | null;
  correctedItems: string[] | null;
  correctedLatex: string | null;
} {
  switch (input.kind) {
    case "paragraph":
      return {
        correctedText: input.correctedText,
        correctedItems: null,
        correctedLatex: null,
      };
    case "list":
      return {
        correctedText: null,
        correctedItems: input.correctedItems,
        correctedLatex: null,
      };
    case "equation":
      return {
        correctedText: null,
        correctedItems: null,
        correctedLatex: input.correctedLatex,
      };
    case "caption":
      return {
        correctedText: input.correctedText,
        correctedItems: null,
        correctedLatex: null,
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

function blockCorrectionNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested resource was not found.",
    404,
  );
}

function blockCorrectionConflict(): PublicError {
  return new PublicError(
    "bad_request",
    "The block content changed. Please refresh and try again.",
    409,
  );
}

function blockKindMismatch(expected: string, actual: string): PublicError {
  return new PublicError(
    "validation_failed",
    `Corrected content must match the block kind (expected ${expected}, found ${actual}).`,
    400,
    false,
    { kind: `Expected ${expected}, found ${actual}.` },
  );
}
