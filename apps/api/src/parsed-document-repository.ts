import type { Identifier } from "@avlp/config";
import {
  contentBlockCorrections,
  contentBlocks,
  extractedFigures,
  figureInclusionOverlays,
  ingestionQualityReports,
  ingestionWarnings,
  parsedDocuments,
  parsedSections,
  parsedTableCells,
  parsedTables,
  type DatabaseClient,
} from "@avlp/database";
import { and, count, desc, eq, inArray } from "drizzle-orm";

/** Tenant-scoped read model for ingestion review and downstream source lookup. */
export class ParsedDocumentRepository {
  public constructor(private readonly database: DatabaseClient) {}

  /** Resolves the latest parsed document for a project without requiring a sourceDocumentId. */
  public async findLatestForProject(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<
    | {
        document: typeof parsedDocuments.$inferSelect;
        quality:
          | {
              score: number;
              status: string;
              findings: unknown;
            }
          | undefined;
        sections: readonly (typeof parsedSections.$inferSelect)[];
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
        ),
      )
      .orderBy(desc(parsedDocuments.createdAt))
      .limit(1);
    if (document === undefined) return undefined;
    const [qualityRow] = await this.database
      .select({
        score: ingestionQualityReports.score,
        status: ingestionQualityReports.status,
        findings: ingestionQualityReports.findings,
      })
      .from(ingestionQualityReports)
      .where(eq(ingestionQualityReports.parsedDocumentId, document.id))
      .limit(1);
    const [sections, warnings] = await Promise.all([
      this.database
        .select()
        .from(parsedSections)
        .where(eq(parsedSections.parsedDocumentId, document.id))
        .orderBy(parsedSections.order),
      this.database
        .select()
        .from(ingestionWarnings)
        .where(eq(ingestionWarnings.parsedDocumentId, document.id))
        .orderBy(ingestionWarnings.pageStart, ingestionWarnings.createdAt),
    ]);
    return {
      document,
      quality: qualityRow,
      sections,
      warnings,
    };
  }

  /** Counts blocks, figures, and tables per section for tree summary display. */
  public async countSectionChildren(parsedDocumentId: Identifier): Promise<{
    blocks: Map<string, number>;
    figures: Map<string, number>;
    tables: Map<string, number>;
  }> {
    const [blockCounts, figureCounts, tableCounts] = await Promise.all([
      this.database
        .select({
          sectionId: contentBlocks.sectionId,
          count: count(),
        })
        .from(contentBlocks)
        .where(eq(contentBlocks.parsedDocumentId, parsedDocumentId))
        .groupBy(contentBlocks.sectionId),
      this.database
        .select({
          sectionId: extractedFigures.sectionId,
          count: count(),
        })
        .from(extractedFigures)
        .where(eq(extractedFigures.parsedDocumentId, parsedDocumentId))
        .groupBy(extractedFigures.sectionId),
      this.database
        .select({
          sectionId: parsedTables.sectionId,
          count: count(),
        })
        .from(parsedTables)
        .where(eq(parsedTables.parsedDocumentId, parsedDocumentId))
        .groupBy(parsedTables.sectionId),
    ]);
    const toMap = (
      rows: readonly { sectionId: string; count: number }[],
    ): Map<string, number> => {
      const map = new Map<string, number>();
      for (const row of rows) map.set(row.sectionId, row.count);
      return map;
    };
    return {
      blocks: toMap(blockCounts),
      figures: toMap(figureCounts),
      tables: toMap(tableCounts),
    };
  }

  /** Loads blocks, figures (with cells), and tables for a single section. */
  public async findSectionDetail(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    parsedDocumentId: Identifier;
    sectionId: Identifier;
  }): Promise<
    | {
        section: typeof parsedSections.$inferSelect;
        blocks: readonly (typeof contentBlocks.$inferSelect)[];
        figures: readonly (typeof extractedFigures.$inferSelect)[];
        tables: readonly (typeof parsedTables.$inferSelect & {
          cells: readonly (typeof parsedTableCells.$inferSelect)[];
        })[];
      }
    | undefined
  > {
    const [document] = await this.database
      .select({ id: parsedDocuments.id })
      .from(parsedDocuments)
      .where(
        and(
          eq(parsedDocuments.id, input.parsedDocumentId),
          eq(parsedDocuments.ownerUserId, input.ownerUserId),
          eq(parsedDocuments.projectId, input.projectId),
        ),
      )
      .limit(1);
    if (document === undefined) return undefined;
    const [section] = await this.database
      .select()
      .from(parsedSections)
      .where(
        and(
          eq(parsedSections.id, input.sectionId),
          eq(parsedSections.parsedDocumentId, document.id),
        ),
      )
      .limit(1);
    if (section === undefined) return undefined;
    const [blocks, figures, tables] = await Promise.all([
      this.database
        .select()
        .from(contentBlocks)
        .where(eq(contentBlocks.sectionId, section.id))
        .orderBy(contentBlocks.pageStart, contentBlocks.order),
      this.database
        .select()
        .from(extractedFigures)
        .where(eq(extractedFigures.sectionId, section.id))
        .orderBy(extractedFigures.pageStart, extractedFigures.order),
      this.database
        .select()
        .from(parsedTables)
        .where(eq(parsedTables.sectionId, section.id))
        .orderBy(parsedTables.pageStart, parsedTables.order),
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
      section,
      blocks,
      figures,
      tables: tables.map((table) => ({
        ...table,
        cells: cellsByTable.get(table.id) ?? [],
      })),
    };
  }

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

  /** Loads tenant-scoped block-correction overlays for a parsed document. */
  public async findBlockCorrections(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    parsedDocumentId: Identifier;
  }): Promise<readonly (typeof contentBlockCorrections.$inferSelect)[]> {
    return this.database
      .select()
      .from(contentBlockCorrections)
      .where(
        and(
          eq(contentBlockCorrections.ownerUserId, input.ownerUserId),
          eq(contentBlockCorrections.projectId, input.projectId),
          eq(contentBlockCorrections.parsedDocumentId, input.parsedDocumentId),
        ),
      );
  }

  /** Loads tenant-scoped figure inclusion overlays for a parsed document. */
  public async findFigureInclusionOverlays(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    parsedDocumentId: Identifier;
  }): Promise<readonly (typeof figureInclusionOverlays.$inferSelect)[]> {
    return this.database
      .select()
      .from(figureInclusionOverlays)
      .where(
        and(
          eq(figureInclusionOverlays.ownerUserId, input.ownerUserId),
          eq(figureInclusionOverlays.projectId, input.projectId),
          eq(figureInclusionOverlays.parsedDocumentId, input.parsedDocumentId),
        ),
      );
  }
}
