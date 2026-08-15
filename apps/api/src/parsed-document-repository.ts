import type { Identifier } from "@avlp/config";
import {
  contentBlocks,
  extractedFigures,
  ingestionWarnings,
  parsedDocuments,
  parsedSections,
  parsedTableCells,
  parsedTables,
  type DatabaseClient,
} from "@avlp/database";
import { and, eq, inArray } from "drizzle-orm";

/** Tenant-scoped read model for ingestion review and downstream source lookup. */
export class ParsedDocumentRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public async findForProject(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sourceDocumentId: Identifier;
  }): Promise<
    | {
        document: typeof parsedDocuments.$inferSelect;
        sections: readonly (typeof parsedSections.$inferSelect)[];
        blocks: readonly (typeof contentBlocks.$inferSelect)[];
        figures: readonly (typeof extractedFigures.$inferSelect)[];
        tables: readonly (typeof parsedTables.$inferSelect & {
          cells: readonly (typeof parsedTableCells.$inferSelect)[];
        })[];
        warnings: readonly (typeof ingestionWarnings.$inferSelect)[];
      }
    | undefined
  > {
    const [document] = await this.database
      .select()
      .from(parsedDocuments)
      .where(
        and(
          eq(parsedDocuments.ownerUserId, input.ownerUserId),
          eq(parsedDocuments.projectId, input.projectId),
          eq(parsedDocuments.sourceDocumentId, input.sourceDocumentId),
        ),
      )
      .orderBy(parsedDocuments.createdAt)
      .limit(1);
    if (document === undefined) return undefined;
    const [sections, blocks, figures, tables, warnings] = await Promise.all([
      this.database
        .select()
        .from(parsedSections)
        .where(eq(parsedSections.parsedDocumentId, document.id))
        .orderBy(parsedSections.order),
      this.database
        .select()
        .from(contentBlocks)
        .where(eq(contentBlocks.parsedDocumentId, document.id))
        .orderBy(contentBlocks.pageStart, contentBlocks.order),
      this.database
        .select()
        .from(extractedFigures)
        .where(eq(extractedFigures.parsedDocumentId, document.id))
        .orderBy(extractedFigures.pageStart, extractedFigures.order),
      this.database
        .select()
        .from(parsedTables)
        .where(eq(parsedTables.parsedDocumentId, document.id))
        .orderBy(parsedTables.pageStart, parsedTables.order),
      this.database
        .select()
        .from(ingestionWarnings)
        .where(eq(ingestionWarnings.parsedDocumentId, document.id))
        .orderBy(ingestionWarnings.pageStart, ingestionWarnings.createdAt),
    ]);
    const cells =
      tables.length === 0
        ? []
        : await this.database
            .select()
            .from(parsedTableCells)
            .where(
              inArray(
                parsedTableCells.parsedTableId,
                tables.map((table) => table.id),
              ),
            )
            .orderBy(parsedTableCells.rowIndex, parsedTableCells.columnIndex);
    const cellsByTable = new Map<
      string,
      (typeof parsedTableCells.$inferSelect)[]
    >();
    for (const cell of cells) {
      const collection = cellsByTable.get(cell.parsedTableId) ?? [];
      collection.push(cell);
      cellsByTable.set(cell.parsedTableId, collection);
    }
    return {
      document,
      sections,
      blocks,
      figures,
      tables: tables.map((table) => ({
        ...table,
        cells: cellsByTable.get(table.id) ?? [],
      })),
      warnings,
    };
  }
}
