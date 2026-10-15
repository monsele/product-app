import { createId, PublicError, type Identifier } from "@avlp/config";
import {
  nextRevision,
  parsedTableCells,
  parsedTables,
  sourceTableInvalidations,
  tableCellCorrections,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  reviewTableSchema,
  tableCellCorrectionInputSchema,
  tableCellRestoreInputSchema,
  type ReviewTable,
  type ReviewTableCellCorrection,
} from "@avlp/schemas";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { findLatestProjectParsedDocument } from "./project-parsed-document.js";

/** One cell's overlay as the projections need it. `correctedText` is null
 * when the cell was restored to the parser's text. */
export interface TableCellOverlayState {
  rowIndex: number;
  columnIndex: number;
  revision: number;
  correctedText: string | null;
}

/** A cell whose effective text is the teacher's, at this overlay revision. */
export interface CorrectedCellReference {
  rowIndex: number;
  columnIndex: number;
  revision: number;
}

const byPosition = (
  left: { rowIndex: number; columnIndex: number },
  right: { rowIndex: number; columnIndex: number },
): number =>
  left.rowIndex - right.rowIndex || left.columnIndex - right.columnIndex;

/**
 * ST-117. Projects an immutable table's `rows` grid through its cell
 * overlays: every active correction replaces that cell's text, and restored
 * overlays leave the parser text in place. The input grid is never mutated.
 * `correctedCells` is sorted by position so the snapshot hash is stable.
 * Overlays outside the grid are ignored; the command never writes one.
 */
export function projectEffectiveTableRows(
  rows: readonly (readonly string[])[],
  overlays: readonly TableCellOverlayState[],
): { rows: string[][]; correctedCells: CorrectedCellReference[] } {
  const effective = rows.map((row) => [...row]);
  const correctedCells: CorrectedCellReference[] = [];
  for (const overlay of [...overlays].sort(byPosition)) {
    if (overlay.correctedText === null) continue;
    const row = effective[overlay.rowIndex];
    if (row === undefined || overlay.columnIndex >= row.length) continue;
    row[overlay.columnIndex] = overlay.correctedText;
    correctedCells.push({
      rowIndex: overlay.rowIndex,
      columnIndex: overlay.columnIndex,
      revision: overlay.revision,
    });
  }
  return { rows: effective, correctedCells };
}

/** Immutable table row plus its cells, as review loads it. */
export interface ReviewTableInput {
  id: string;
  order: number;
  pageStart: number;
  pageEnd: number;
  captionBlockId: string | null;
  columns: unknown;
  rows: unknown;
  cells: readonly {
    rowIndex: number;
    columnIndex: number;
    text: string;
    rowSpan: number;
    columnSpan: number;
  }[];
}

/**
 * ST-117. The table as ingestion review shows it: `rows` stay the parser's
 * original text so the teacher can always see it, and `cellCorrections`
 * carries every overlay (active or restored, for its revision). The field is
 * omitted when the table has never been corrected.
 */
export function projectReviewTable(
  table: ReviewTableInput,
  overlays: readonly TableCellOverlayState[],
): ReviewTable {
  const cellCorrections: ReviewTableCellCorrection[] = [...overlays]
    .sort(byPosition)
    .map((overlay) => ({
      rowIndex: overlay.rowIndex,
      columnIndex: overlay.columnIndex,
      revision: overlay.revision,
      correctedText: overlay.correctedText,
    }));
  return reviewTableSchema.parse({
    id: table.id,
    order: table.order,
    pageStart: table.pageStart,
    pageEnd: table.pageEnd,
    captionBlockId: table.captionBlockId ?? undefined,
    columns: table.columns as string[],
    rows: table.rows as string[][],
    cells: table.cells.map((cell) => ({
      rowIndex: cell.rowIndex,
      columnIndex: cell.columnIndex,
      text: cell.text,
      rowSpan: cell.rowSpan,
      columnSpan: cell.columnSpan,
    })),
    ...(cellCorrections.length === 0 ? {} : { cellCorrections }),
  });
}

export interface TableCellCorrectionService {
  update(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    tableId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ReviewTable>;
  restore(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    tableId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ReviewTable>;
}

type TableRow = typeof parsedTables.$inferSelect;
type OverlayRow = typeof tableCellCorrections.$inferSelect;

export class PostgresTableCellCorrectionService implements TableCellCorrectionService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async update(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    tableId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ReviewTable> {
    const parsed = parseBoundary(tableCellCorrectionInputSchema, input.body);
    const document = await findLatestProjectParsedDocument(this.database, {
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
    if (document === undefined) throw tableCellNotFound();

    return this.database.transaction(async (transaction) => {
      const table = await this.loadTable(transaction, document.id, input.tableId);
      if (table === undefined) throw tableCellNotFound();
      const originalText = await this.cellText(transaction, table, parsed);

      const current = await this.loadOverlay(transaction, input, parsed);
      if (
        (current === undefined && parsed.revision !== 0) ||
        (current !== undefined && current.revision !== parsed.revision)
      )
        throw tableCellConflict();

      const timestamp = this.now();
      const revision =
        current === undefined ? 1 : nextRevision(current.revision);
      if (current === undefined) {
        const [created] = await transaction
          .insert(tableCellCorrections)
          .values({
            id: createId(timestamp),
            projectId: input.projectId,
            ownerUserId: input.ownerUserId,
            parsedDocumentId: document.id,
            sectionId: table.sectionId,
            tableId: input.tableId,
            rowIndex: parsed.rowIndex,
            columnIndex: parsed.columnIndex,
            originalText,
            correctedText: parsed.correctedText,
            editedBy: input.ownerUserId,
            revision,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .onConflictDoNothing({
            target: [
              tableCellCorrections.projectId,
              tableCellCorrections.tableId,
              tableCellCorrections.rowIndex,
              tableCellCorrections.columnIndex,
            ],
          })
          .returning({ id: tableCellCorrections.id });
        if (created === undefined) throw tableCellConflict();
      } else {
        const [updated] = await transaction
          .update(tableCellCorrections)
          .set({
            correctedText: parsed.correctedText,
            editedBy: input.ownerUserId,
            revision,
            updatedAt: timestamp,
          })
          .where(overlayAtRevision(current))
          .returning({ id: tableCellCorrections.id });
        if (updated === undefined) throw tableCellConflict();
      }

      await this.recordChange(transaction, {
        input,
        parsedDocumentId: document.id,
        sectionId: table.sectionId,
        position: parsed,
        revision,
        eventType: "source.table_cell_corrected",
        timestamp,
      });
      return this.reviewTable(transaction, input, table);
    });
  }

  public async restore(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    tableId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ReviewTable> {
    const parsed = parseBoundary(tableCellRestoreInputSchema, input.body);
    const document = await findLatestProjectParsedDocument(this.database, {
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
    if (document === undefined) throw tableCellNotFound();

    return this.database.transaction(async (transaction) => {
      const table = await this.loadTable(transaction, document.id, input.tableId);
      if (table === undefined) throw tableCellNotFound();
      await this.cellText(transaction, table, parsed);

      const current = await this.loadOverlay(transaction, input, parsed);
      if (current === undefined) {
        if (parsed.revision !== 0) throw tableCellConflict();
        return this.reviewTable(transaction, input, table);
      }
      if (current.revision !== parsed.revision) throw tableCellConflict();
      // Already showing the parser's text: nothing to restore.
      if (current.correctedText === null)
        return this.reviewTable(transaction, input, table);

      const timestamp = this.now();
      const revision = nextRevision(current.revision);
      const [updated] = await transaction
        .update(tableCellCorrections)
        .set({
          correctedText: null,
          editedBy: input.ownerUserId,
          revision,
          updatedAt: timestamp,
        })
        .where(overlayAtRevision(current))
        .returning({ id: tableCellCorrections.id });
      if (updated === undefined) throw tableCellConflict();

      await this.recordChange(transaction, {
        input,
        parsedDocumentId: document.id,
        sectionId: table.sectionId,
        position: parsed,
        revision,
        eventType: "source.table_cell_restored",
        timestamp,
      });
      return this.reviewTable(transaction, input, table);
    });
  }

  /** Records the invalidation and the audit event. Neither carries cell text. */
  private async recordChange(
    executor: DatabaseExecutor,
    change: {
      input: {
        ownerUserId: Identifier;
        projectId: Identifier;
        tableId: Identifier;
        correlationId: Identifier;
      };
      parsedDocumentId: string;
      sectionId: string;
      position: { rowIndex: number; columnIndex: number };
      revision: number;
      eventType: "source.table_cell_corrected" | "source.table_cell_restored";
      timestamp: Date;
    },
  ): Promise<void> {
    const { input, position, revision, timestamp } = change;
    await executor
      .insert(sourceTableInvalidations)
      .values({
        id: createId(timestamp),
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        parsedDocumentId: change.parsedDocumentId,
        sectionId: change.sectionId,
        tableId: input.tableId,
        rowIndex: position.rowIndex,
        columnIndex: position.columnIndex,
        cellRevision: revision,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing({
        target: [
          sourceTableInvalidations.projectId,
          sourceTableInvalidations.tableId,
          sourceTableInvalidations.rowIndex,
          sourceTableInvalidations.columnIndex,
          sourceTableInvalidations.cellRevision,
        ],
      });
    await new PostgresAuditWriter(executor).write({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      actor: { type: "user", userId: input.ownerUserId },
      eventType: change.eventType,
      target: { type: "source_table", id: input.tableId },
      correlationId: input.correlationId,
      metadata: {
        parsedDocumentId: change.parsedDocumentId,
        sectionId: change.sectionId,
        rowIndex: position.rowIndex,
        columnIndex: position.columnIndex,
        revision,
      },
      occurredAt: timestamp,
    });
  }

  /** Only a table of the project's latest parsed document can be corrected. */
  private async loadTable(
    executor: DatabaseExecutor,
    parsedDocumentId: string,
    tableId: Identifier,
  ): Promise<TableRow | undefined> {
    const [table] = await executor
      .select()
      .from(parsedTables)
      .where(
        and(
          eq(parsedTables.id, tableId),
          eq(parsedTables.parsedDocumentId, parsedDocumentId),
        ),
      )
      .limit(1);
    return table;
  }

  /**
   * The parser's text at the addressed cell. The position must lie inside
   * the `rows` grid and must not be covered by a merged cell that starts
   * elsewhere: correcting table structure is out of scope.
   */
  private async cellText(
    executor: DatabaseExecutor,
    table: TableRow,
    position: { rowIndex: number; columnIndex: number },
  ): Promise<string> {
    const rows = Array.isArray(table.rows) ? (table.rows as unknown[]) : [];
    const columns = Array.isArray(table.columns) ? table.columns : [];
    const row = rows[position.rowIndex];
    const text = Array.isArray(row) ? row[position.columnIndex] : undefined;
    if (position.columnIndex >= columns.length || typeof text !== "string")
      throw cellOutsideTable();
    const cells = await executor
      .select({
        rowIndex: parsedTableCells.rowIndex,
        columnIndex: parsedTableCells.columnIndex,
        rowSpan: parsedTableCells.rowSpan,
        columnSpan: parsedTableCells.columnSpan,
      })
      .from(parsedTableCells)
      .where(eq(parsedTableCells.parsedTableId, table.id));
    const covered = cells.some(
      (cell) =>
        (cell.rowIndex !== position.rowIndex ||
          cell.columnIndex !== position.columnIndex) &&
        position.rowIndex >= cell.rowIndex &&
        position.rowIndex < cell.rowIndex + cell.rowSpan &&
        position.columnIndex >= cell.columnIndex &&
        position.columnIndex < cell.columnIndex + cell.columnSpan,
    );
    if (covered) throw cellInsideMergedCell();
    return text;
  }

  private async loadOverlay(
    executor: DatabaseExecutor,
    scope: { ownerUserId: Identifier; projectId: Identifier; tableId: Identifier },
    position: { rowIndex: number; columnIndex: number },
  ): Promise<OverlayRow | undefined> {
    const [row] = await executor
      .select()
      .from(tableCellCorrections)
      .where(
        and(
          eq(tableCellCorrections.ownerUserId, scope.ownerUserId),
          eq(tableCellCorrections.projectId, scope.projectId),
          eq(tableCellCorrections.tableId, scope.tableId),
          eq(tableCellCorrections.rowIndex, position.rowIndex),
          eq(tableCellCorrections.columnIndex, position.columnIndex),
        ),
      )
      .limit(1);
    return row;
  }

  private async reviewTable(
    executor: DatabaseExecutor,
    scope: { ownerUserId: Identifier; projectId: Identifier; tableId: Identifier },
    table: TableRow,
  ): Promise<ReviewTable> {
    const [cells, overlays] = await Promise.all([
      executor
        .select()
        .from(parsedTableCells)
        .where(eq(parsedTableCells.parsedTableId, table.id))
        .orderBy(parsedTableCells.rowIndex, parsedTableCells.columnIndex),
      executor
        .select()
        .from(tableCellCorrections)
        .where(
          and(
            eq(tableCellCorrections.ownerUserId, scope.ownerUserId),
            eq(tableCellCorrections.projectId, scope.projectId),
            eq(tableCellCorrections.tableId, scope.tableId),
          ),
        ),
    ]);
    return projectReviewTable({ ...table, cells }, overlays.map(toOverlayState));
  }
}

export function toOverlayState(row: OverlayRow): TableCellOverlayState {
  return {
    rowIndex: row.rowIndex,
    columnIndex: row.columnIndex,
    revision: row.revision,
    correctedText: row.correctedText,
  };
}

function overlayAtRevision(current: OverlayRow) {
  return and(
    eq(tableCellCorrections.id, current.id),
    eq(tableCellCorrections.ownerUserId, current.ownerUserId),
    eq(tableCellCorrections.projectId, current.projectId),
    eq(tableCellCorrections.revision, current.revision),
  );
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

function tableCellNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested resource was not found.",
    404,
  );
}

function tableCellConflict(): PublicError {
  return new PublicError(
    "bad_request",
    "The table cell changed. Please refresh and try again.",
    409,
  );
}

function cellOutsideTable(): PublicError {
  return new PublicError(
    "validation_failed",
    "That cell is not in this table.",
    400,
    false,
    { cell: "The row and column must address a cell in the table." },
  );
}

function cellInsideMergedCell(): PublicError {
  return new PublicError(
    "validation_failed",
    "That cell is part of a merged cell. Correct the merged cell where it starts.",
    400,
    false,
    { cell: "Part of a merged cell." },
  );
}
