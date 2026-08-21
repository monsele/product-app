import { createHash } from "node:crypto";
import {
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  contentBlockCorrections,
  contentBlocks,
  extractedFigures,
  figureInclusionOverlays,
  parsedDocuments,
  parsedSections,
  parsedTables,
  sourceSectionOverlays,
  sourceSnapshots,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  citationIssueSchema,
  resolvedCitationSchema,
  sourceApprovalResponseSchema,
  sourceApprovalStatusSchema,
  sourceBlockLookupEntrySchema,
  sourceSnapshotBlockSchema,
  sourceSnapshotBlockText,
  sourceSnapshotFigureSchema,
  sourceSnapshotMetadataSchema,
  sourceSnapshotSchema,
  sourceSnapshotSectionSchema,
  sourceSnapshotTableSchema,
  sourceSnapshotVersion,
  type CitationIssue,
  type ResolvedCitation,
  type ResolvedCitationBlock,
  type ResolvedCitationFigure,
  type ResolvedCitationTable,
  type SourceApprovalResponse,
  type SourceApprovalStatus,
  type SourceBlockLookupEntry,
  type SourceRef,
  type SourceSnapshot,
  type SourceSnapshotBlock,
  type SourceSnapshotFigure,
  type SourceSnapshotMetadata,
  type SourceSnapshotSection,
  type SourceSnapshotTable,
} from "@avlp/schemas";
import { and, desc, eq } from "drizzle-orm";

/** Immutable section shape needed to materialize the effective source. */
export interface EffectiveSectionInput {
  id: Identifier;
  parentSectionId: string | null;
  order: number;
  level: number;
  heading: string;
  pageStart: number;
  pageEnd: number;
}

/** Immutable content-block row plus its parser content payload. */
export interface EffectiveBlockInput {
  id: Identifier;
  sectionId: Identifier;
  kind: string;
  order: number;
  pageStart: number;
  pageEnd: number;
  content: unknown;
}

/** Immutable extracted-figure metadata. */
export interface EffectiveFigureInput {
  id: Identifier;
  sectionId: Identifier;
  order: number;
  pageStart: number;
  pageEnd: number;
  captionBlockId: string | null;
  altText: string | null;
  sourceLocator: string | null;
}

/** Immutable parsed-table metadata and shape. */
export interface EffectiveTableInput {
  id: Identifier;
  sectionId: Identifier;
  order: number;
  pageStart: number;
  pageEnd: number;
  captionBlockId: string | null;
  columns: unknown;
  rows: unknown;
}

export interface SourceSectionOverlayState {
  included: boolean;
  displayHeading: string | null;
  reviewOrder: number | null;
  revision: number;
}

export interface BlockCorrectionOverlayState {
  correctedText: string | null;
  correctedItems: string[] | null;
  correctedLatex: string | null;
  revision: number;
}

export interface FigureInclusionOverlayState {
  included: boolean;
  revision: number;
}

/** All immutable rows and mutable overlays needed to materialize one snapshot. */
export interface EffectiveSourceInput {
  document: {
    id: Identifier;
    sourceDocumentId: Identifier;
    version: number;
  };
  sections: readonly EffectiveSectionInput[];
  blocks: readonly EffectiveBlockInput[];
  figures: readonly EffectiveFigureInput[];
  tables: readonly EffectiveTableInput[];
  overlays: {
    sections: ReadonlyMap<string, SourceSectionOverlayState>;
    blocks: ReadonlyMap<string, BlockCorrectionOverlayState>;
    figures: ReadonlyMap<string, FigureInclusionOverlayState>;
  };
}

/** The frozen effective source content that is hashed and packaged. */
export interface SourceSnapshotContent {
  schemaVersion: typeof sourceSnapshotVersion;
  sourceDocumentId: Identifier;
  parsedDocumentId: Identifier;
  parsedDocumentVersion: number;
  sections: SourceSnapshotSection[];
  blocks: SourceSnapshotBlock[];
  figures: SourceSnapshotFigure[];
  tables: SourceSnapshotTable[];
}

/**
 * Projects immutable parsed content through the current overlays into the
 * effective reviewed source: only included sections, corrected block text,
 * and included figures/tables. Unsupported blocks are excluded because they
 * cannot be packaged into a bounded AI source package.
 */
export function materializeEffectiveSource(
  input: EffectiveSourceInput,
): SourceSnapshotContent {
  const sectionOverlay = (
    sectionId: string,
  ): SourceSectionOverlayState | undefined =>
    input.overlays.sections.get(sectionId);
  const includedSections = input.sections.filter(
    (section) => sectionOverlay(section.id)?.included ?? true,
  );
  const includedSectionIds = new Set(
    includedSections.map((section) => section.id),
  );

  const effectiveBlocks: SourceSnapshotBlock[] = [];
  const blockIdsBySection = new Map<string, string[]>();
  for (const block of input.blocks) {
    if (block.kind === "unsupported") continue;
    if (!includedSectionIds.has(block.sectionId)) continue;
    const correction = input.overlays.blocks.get(block.id);
    const raw = (block.content ?? {}) as Record<string, unknown>;
    const base = {
      blockId: block.id,
      sectionId: block.sectionId,
      order: block.order,
      pageStart: block.pageStart,
      ...(block.pageEnd === undefined ? {} : { pageEnd: block.pageEnd }),
      corrected: correction !== undefined,
      revision: correction?.revision ?? 0,
    };
    let effective: SourceSnapshotBlock;
    switch (block.kind) {
      case "paragraph":
        effective = sourceSnapshotBlockSchema.parse({
          ...base,
          kind: "paragraph",
          text:
            correction?.correctedText ??
            (typeof raw.text === "string" ? raw.text : ""),
        });
        break;
      case "list":
        effective = sourceSnapshotBlockSchema.parse({
          ...base,
          kind: "list",
          items:
            correction?.correctedItems ??
            (Array.isArray(raw.items) ? raw.items : []),
        });
        break;
      case "equation":
        effective = sourceSnapshotBlockSchema.parse({
          ...base,
          kind: "equation",
          latex:
            correction?.correctedLatex ??
            (typeof raw.latex === "string" ? raw.latex : ""),
          ...(typeof raw.text === "string" ? { text: raw.text } : {}),
        });
        break;
      case "caption":
        effective = sourceSnapshotBlockSchema.parse({
          ...base,
          kind: "caption",
          text:
            correction?.correctedText ??
            (typeof raw.text === "string" ? raw.text : ""),
        });
        break;
      default:
        continue;
    }
    effectiveBlocks.push(effective);
    const current = blockIdsBySection.get(block.sectionId) ?? [];
    current.push(block.id);
    blockIdsBySection.set(block.sectionId, current);
  }

  const figureIdsBySection = new Map<string, string[]>();
  const effectiveFigures: SourceSnapshotFigure[] = [];
  for (const figure of input.figures) {
    if (!includedSectionIds.has(figure.sectionId)) continue;
    const overlay = input.overlays.figures.get(figure.id);
    if (overlay !== undefined && !overlay.included) continue;
    effectiveFigures.push(
      sourceSnapshotFigureSchema.parse({
        figureId: figure.id,
        sectionId: figure.sectionId,
        order: figure.order,
        pageStart: figure.pageStart,
        ...(figure.pageEnd === undefined ? {} : { pageEnd: figure.pageEnd }),
        ...(figure.captionBlockId === null
          ? {}
          : { captionBlockId: figure.captionBlockId }),
        ...(figure.altText === null ? {} : { altText: figure.altText }),
        ...(figure.sourceLocator === null
          ? {}
          : { sourceLocator: figure.sourceLocator }),
        revision: overlay?.revision ?? 0,
      }),
    );
    const current = figureIdsBySection.get(figure.sectionId) ?? [];
    current.push(figure.id);
    figureIdsBySection.set(figure.sectionId, current);
  }

  const tableIdsBySection = new Map<string, string[]>();
  const effectiveTables: SourceSnapshotTable[] = [];
  for (const table of input.tables) {
    if (!includedSectionIds.has(table.sectionId)) continue;
    effectiveTables.push(
      sourceSnapshotTableSchema.parse({
        tableId: table.id,
        sectionId: table.sectionId,
        order: table.order,
        pageStart: table.pageStart,
        ...(table.pageEnd === undefined ? {} : { pageEnd: table.pageEnd }),
        ...(table.captionBlockId === null
          ? {}
          : { captionBlockId: table.captionBlockId }),
        columns: Array.isArray(table.columns) ? table.columns : [],
        rows: Array.isArray(table.rows) ? table.rows : [],
      }),
    );
    const current = tableIdsBySection.get(table.sectionId) ?? [];
    current.push(table.id);
    tableIdsBySection.set(table.sectionId, current);
  }

  const sections = includedSections.map((section) => {
    const overlay = sectionOverlay(section.id);
    return sourceSnapshotSectionSchema.parse({
      sectionId: section.id,
      ...(section.parentSectionId === null
        ? {}
        : { parentSectionId: section.parentSectionId }),
      order: section.order,
      level: section.level,
      heading: overlay?.displayHeading ?? section.heading,
      pageStart: section.pageStart,
      ...(section.pageEnd === undefined ? {} : { pageEnd: section.pageEnd }),
      reviewOrder: overlay?.reviewOrder ?? null,
      blockIds: blockIdsBySection.get(section.id) ?? [],
      figureIds: figureIdsBySection.get(section.id) ?? [],
      tableIds: tableIdsBySection.get(section.id) ?? [],
    });
  });

  return {
    schemaVersion: sourceSnapshotVersion,
    sourceDocumentId: input.document.sourceDocumentId,
    parsedDocumentId: input.document.id,
    parsedDocumentVersion: input.document.version,
    sections,
    blocks: effectiveBlocks,
    figures: effectiveFigures,
    tables: effectiveTables,
  };
}

function sortKeysForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysForHash);
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortKeysForHash(nested)]),
    );
  return value;
}

/**
 * Deterministic SHA-256 over the canonical effective source content. Approval
 * metadata (id, project, approver, timestamp) is deliberately excluded so the
 * same reviewed content always produces the same hash.
 */
export function computeSourceSnapshotHash(
  content: SourceSnapshotContent,
): string {
  const canonical = JSON.stringify(sortKeysForHash(content));
  return createHash("sha256").update(canonical).digest("hex");
}

export interface SourceSnapshotService {
  approve(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    correlationId: Identifier;
  }): Promise<SourceApprovalResponse>;
  metadata(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    snapshotId: Identifier;
  }): Promise<SourceSnapshotMetadata>;
  status(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<SourceApprovalStatus>;
  lookupBlocks(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    snapshotId: Identifier;
    blockIds: readonly Identifier[];
  }): Promise<SourceBlockLookupEntry[]>;
  resolveSourceRefs(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sourceRefs: readonly SourceRef[];
  }): Promise<ResolvedCitation[]>;
}

type SnapshotRow = typeof sourceSnapshots.$inferSelect;

export class PostgresSourceSnapshotService implements SourceSnapshotService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async approve(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    correlationId: Identifier;
  }): Promise<SourceApprovalResponse> {
    const timestamp = this.now();
    return this.database.transaction(async (transaction) => {
      const source = await this.loadEffectiveSource(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (source === undefined) throw sourceSnapshotSourceNotFound();
      const content = materializeEffectiveSource(source);
      if (content.sections.length === 0) throw atLeastOneSectionRequired();
      const contentHash = computeSourceSnapshotHash(content);

      const latest = await this.latestSnapshot(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (
        latest !== undefined &&
        latest.contentHash === contentHash &&
        latest.parsedDocumentId === content.parsedDocumentId
      )
        return sourceApprovalResponseSchema.parse({
          snapshot: toMetadata(parseSnapshot(latest), latest.snapshotVersion),
        });

      const snapshotVersion = (latest?.snapshotVersion ?? 0) + 1;
      const id = createId(timestamp);
      const approvedAt = serializeUtcTimestamp(timestamp);
      const snapshot = sourceSnapshotSchema.parse({
        schemaVersion: sourceSnapshotVersion,
        id,
        projectId: input.projectId,
        sourceDocumentId: content.sourceDocumentId,
        parsedDocumentId: content.parsedDocumentId,
        parsedDocumentVersion: content.parsedDocumentVersion,
        contentHash,
        approvedBy: input.ownerUserId,
        approvedAt,
        sections: content.sections,
        blocks: content.blocks,
        figures: content.figures,
        tables: content.tables,
      });
      await transaction.insert(sourceSnapshots).values({
        id,
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        parsedDocumentId: content.parsedDocumentId,
        parsedDocumentVersion: content.parsedDocumentVersion,
        snapshotVersion,
        schemaVersion: sourceSnapshotVersion,
        contentHash,
        approvedBy: input.ownerUserId,
        approvedAt: timestamp,
        payload: snapshot,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "source.review_approved",
        target: { type: "source_snapshot", id },
        correlationId: input.correlationId,
        metadata: {
          snapshotVersion,
          contentHash,
          parsedDocumentId: content.parsedDocumentId,
        },
        occurredAt: timestamp,
      });
      return sourceApprovalResponseSchema.parse({
        snapshot: toMetadata(snapshot, snapshotVersion),
      });
    });
  }

  public async metadata(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    snapshotId: Identifier;
  }): Promise<SourceSnapshotMetadata> {
    const row = await this.loadSnapshot(
      this.database,
      input.ownerUserId,
      input.projectId,
      input.snapshotId,
    );
    if (row === undefined) throw sourceSnapshotNotFound();
    return toMetadata(parseSnapshot(row), row.snapshotVersion);
  }

  public async status(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<SourceApprovalStatus> {
    const [source, latest] = await Promise.all([
      this.loadEffectiveSource(
        this.database,
        input.ownerUserId,
        input.projectId,
      ),
      this.latestSnapshot(this.database, input.ownerUserId, input.projectId),
    ]);
    if (latest === undefined)
      return sourceApprovalStatusSchema.parse({
        approved: false,
        parsedDocumentVersion: source?.document.version ?? null,
        snapshotId: null,
        snapshotVersion: null,
        contentHash: null,
        approvedAt: null,
        stale: false,
      });
    if (source === undefined) {
      const snapshot = parseSnapshot(latest);
      return sourceApprovalStatusSchema.parse({
        approved: true,
        parsedDocumentVersion: snapshot.parsedDocumentVersion,
        snapshotId: snapshot.id,
        snapshotVersion: latest.snapshotVersion,
        contentHash: latest.contentHash,
        approvedAt: serializeUtcTimestamp(latest.approvedAt),
        stale: true,
      });
    }
    const content = materializeEffectiveSource(source);
    const currentHash = computeSourceSnapshotHash(content);
    return sourceApprovalStatusSchema.parse({
      approved: true,
      parsedDocumentVersion: source.document.version,
      snapshotId: latest.id as Identifier,
      snapshotVersion: latest.snapshotVersion,
      contentHash: latest.contentHash,
      approvedAt: serializeUtcTimestamp(latest.approvedAt),
      stale:
        latest.contentHash !== currentHash ||
        latest.parsedDocumentId !== source.document.id,
    });
  }

  public async lookupBlocks(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    snapshotId: Identifier;
    blockIds: readonly Identifier[];
  }): Promise<SourceBlockLookupEntry[]> {
    const row = await this.loadSnapshot(
      this.database,
      input.ownerUserId,
      input.projectId,
      input.snapshotId,
    );
    if (row === undefined) throw sourceSnapshotNotFound();
    const snapshot = parseSnapshot(row);
    const sectionsById = new Map(
      snapshot.sections.map((section) => [section.sectionId, section]),
    );
    const requested = new Set(input.blockIds);
    const entries: SourceBlockLookupEntry[] = [];
    for (const block of snapshot.blocks) {
      if (!requested.has(block.blockId)) continue;
      const section = sectionsById.get(block.sectionId);
      if (section === undefined)
        throw new Error(
          "Snapshot data is inconsistent: block section is missing.",
        );
      entries.push(
        sourceBlockLookupEntrySchema.parse({
          blockId: block.blockId,
          sectionId: block.sectionId,
          sectionHeading: section.heading,
          page: block.pageStart,
          kind: block.kind,
          text: sourceSnapshotBlockText(block),
        }),
      );
    }
    return entries;
  }

  public async resolveSourceRefs(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sourceRefs: readonly SourceRef[];
  }): Promise<ResolvedCitation[]> {
    const latest = await this.latestSnapshot(
      this.database,
      input.ownerUserId,
      input.projectId,
    );
    if (latest === undefined) throw sourceSnapshotNotFound();
    return resolveSourceRefsAgainstSnapshot(
      parseSnapshot(latest),
      input.sourceRefs,
    );
  }

  private async loadEffectiveSource(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<EffectiveSourceInput | undefined> {
    const [document] = await executor
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
    if (document === undefined) return undefined;
    const [
      sections,
      blocks,
      figures,
      tables,
      sectionOverlays,
      blockCorrections,
      figureOverlays,
    ] = await Promise.all([
      executor
        .select()
        .from(parsedSections)
        .where(eq(parsedSections.parsedDocumentId, document.id))
        .orderBy(parsedSections.order),
      executor
        .select()
        .from(contentBlocks)
        .where(eq(contentBlocks.parsedDocumentId, document.id))
        .orderBy(contentBlocks.pageStart, contentBlocks.order),
      executor
        .select()
        .from(extractedFigures)
        .where(eq(extractedFigures.parsedDocumentId, document.id))
        .orderBy(extractedFigures.pageStart, extractedFigures.order),
      executor
        .select()
        .from(parsedTables)
        .where(eq(parsedTables.parsedDocumentId, document.id))
        .orderBy(parsedTables.pageStart, parsedTables.order),
      executor
        .select()
        .from(sourceSectionOverlays)
        .where(
          and(
            eq(sourceSectionOverlays.ownerUserId, ownerUserId),
            eq(sourceSectionOverlays.projectId, projectId),
            eq(sourceSectionOverlays.parsedDocumentId, document.id),
          ),
        ),
      executor
        .select()
        .from(contentBlockCorrections)
        .where(
          and(
            eq(contentBlockCorrections.ownerUserId, ownerUserId),
            eq(contentBlockCorrections.projectId, projectId),
            eq(contentBlockCorrections.parsedDocumentId, document.id),
          ),
        ),
      executor
        .select()
        .from(figureInclusionOverlays)
        .where(
          and(
            eq(figureInclusionOverlays.ownerUserId, ownerUserId),
            eq(figureInclusionOverlays.projectId, projectId),
            eq(figureInclusionOverlays.parsedDocumentId, document.id),
          ),
        ),
    ]);
    return {
      document: {
        id: document.id as Identifier,
        sourceDocumentId: document.sourceDocumentId as Identifier,
        version: document.version,
      },
      sections: sections.map((section) => ({
        id: section.id as Identifier,
        parentSectionId: section.parentSectionId,
        order: section.order,
        level: section.level,
        heading: section.heading,
        pageStart: section.pageStart,
        pageEnd: section.pageEnd,
      })),
      blocks: blocks.map((block) => ({
        id: block.id as Identifier,
        sectionId: block.sectionId as Identifier,
        kind: block.kind,
        order: block.order,
        pageStart: block.pageStart,
        pageEnd: block.pageEnd,
        content: block.content,
      })),
      figures: figures.map((figure) => ({
        id: figure.id as Identifier,
        sectionId: figure.sectionId as Identifier,
        order: figure.order,
        pageStart: figure.pageStart,
        pageEnd: figure.pageEnd,
        captionBlockId: figure.captionBlockId,
        altText: figure.altText,
        sourceLocator: figure.sourceLocator,
      })),
      tables: tables.map((table) => ({
        id: table.id as Identifier,
        sectionId: table.sectionId as Identifier,
        order: table.order,
        pageStart: table.pageStart,
        pageEnd: table.pageEnd,
        captionBlockId: table.captionBlockId,
        columns: table.columns,
        rows: table.rows,
      })),
      overlays: {
        sections: new Map(
          sectionOverlays.map((row) => [
            row.sectionId,
            {
              included: row.included,
              displayHeading: row.displayHeading,
              reviewOrder: row.reviewOrder,
              revision: row.revision,
            },
          ]),
        ),
        blocks: new Map(
          blockCorrections.map((row) => [
            row.blockId,
            {
              correctedText: row.correctedText,
              correctedItems: row.correctedItems as string[] | null,
              correctedLatex: row.correctedLatex,
              revision: row.revision,
            },
          ]),
        ),
        figures: new Map(
          figureOverlays.map((row) => [
            row.figureId,
            { included: row.included, revision: row.revision },
          ]),
        ),
      },
    };
  }

  private async latestSnapshot(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<SnapshotRow | undefined> {
    const [row] = await executor
      .select()
      .from(sourceSnapshots)
      .where(
        and(
          eq(sourceSnapshots.ownerUserId, ownerUserId),
          eq(sourceSnapshots.projectId, projectId),
        ),
      )
      .orderBy(desc(sourceSnapshots.snapshotVersion))
      .limit(1);
    return row;
  }

  private async loadSnapshot(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    snapshotId: Identifier,
  ): Promise<SnapshotRow | undefined> {
    const [row] = await executor
      .select()
      .from(sourceSnapshots)
      .where(
        and(
          eq(sourceSnapshots.id, snapshotId),
          eq(sourceSnapshots.ownerUserId, ownerUserId),
          eq(sourceSnapshots.projectId, projectId),
        ),
      )
      .limit(1);
    return row;
  }
}

function parseSnapshot(row: SnapshotRow): SourceSnapshot {
  return sourceSnapshotSchema.parse(row.payload);
}

function toMetadata(
  snapshot: SourceSnapshot,
  snapshotVersion: number,
): SourceSnapshotMetadata {
  return sourceSnapshotMetadataSchema.parse({
    id: snapshot.id,
    snapshotVersion,
    schemaVersion: snapshot.schemaVersion,
    parsedDocumentId: snapshot.parsedDocumentId,
    parsedDocumentVersion: snapshot.parsedDocumentVersion,
    contentHash: snapshot.contentHash,
    approvedBy: snapshot.approvedBy,
    approvedAt: snapshot.approvedAt,
    sectionCount: snapshot.sections.length,
    blockCount: snapshot.blocks.length,
    figureCount: snapshot.figures.length,
    tableCount: snapshot.tables.length,
  });
}

function sourceSnapshotSourceNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "No parsed document is available for this project.",
    404,
  );
}

function sourceSnapshotNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested source snapshot was not found.",
    404,
  );
}

function atLeastOneSectionRequired(): PublicError {
  return new PublicError(
    "bad_request",
    "At least one section must remain included before confirming the source.",
    409,
  );
}

/**
 * Resolves scene source references against an approved snapshot into
 * teacher-facing labels and bounded excerpts. Every stale or unknown
 * identifier becomes a `CitationIssue` on the resolved citation rather than
 * being silently dropped, so invalid grounding is always visible.
 */
export function resolveSourceRefsAgainstSnapshot(
  snapshot: SourceSnapshot,
  sourceRefs: readonly SourceRef[],
): ResolvedCitation[] {
  const sectionsById = new Map(
    snapshot.sections.map((section) => [section.sectionId, section]),
  );
  const blocksById = new Map(
    snapshot.blocks.map((block) => [block.blockId, block]),
  );
  const figuresById = new Map(
    snapshot.figures.map((figure) => [figure.figureId, figure]),
  );
  const tablesById = new Map(
    snapshot.tables.map((table) => [table.tableId, table]),
  );

  return sourceRefs.map((ref) => {
    const issues: CitationIssue[] = [];
    if (ref.documentId !== snapshot.parsedDocumentId)
      issues.push(
        citationIssueSchema.parse({
          kind: "document_mismatch",
          id: ref.documentId,
        }),
      );
    if (ref.parsedDocumentVersion !== snapshot.parsedDocumentVersion)
      issues.push(
        citationIssueSchema.parse({
          kind: "version_mismatch",
          id: ref.documentId,
        }),
      );

    let sectionHeading: string | undefined;
    if (ref.sectionId !== undefined) {
      const section = sectionsById.get(ref.sectionId);
      if (section === undefined)
        issues.push(
          citationIssueSchema.parse({
            kind: "missing_section",
            id: ref.sectionId,
          }),
        );
      else sectionHeading = section.heading;
    }

    const blocks: ResolvedCitationBlock[] = [];
    for (const blockId of ref.blockIds) {
      const block = blocksById.get(blockId);
      if (block === undefined) {
        issues.push(
          citationIssueSchema.parse({ kind: "missing_block", id: blockId }),
        );
        continue;
      }
      blocks.push({
        blockId: block.blockId,
        sectionId: block.sectionId,
        kind: block.kind,
        page: block.pageStart,
        text: sourceSnapshotBlockText(block),
      });
    }

    const figures: ResolvedCitationFigure[] = [];
    for (const figureId of ref.figureIds ?? []) {
      const figure = figuresById.get(figureId);
      if (figure === undefined) {
        issues.push(
          citationIssueSchema.parse({ kind: "missing_figure", id: figureId }),
        );
        continue;
      }
      figures.push({
        figureId: figure.figureId,
        sectionId: figure.sectionId,
        page: figure.pageStart,
        ...(figure.altText === undefined ? {} : { altText: figure.altText }),
        ...(figure.sourceLocator === undefined
          ? {}
          : { sourceLocator: figure.sourceLocator }),
      });
    }

    const tables: ResolvedCitationTable[] = [];
    for (const tableId of ref.tableIds ?? []) {
      const table = tablesById.get(tableId);
      if (table === undefined) {
        issues.push(
          citationIssueSchema.parse({ kind: "missing_table", id: tableId }),
        );
        continue;
      }
      tables.push({
        tableId: table.tableId,
        sectionId: table.sectionId,
        page: table.pageStart,
        columns: table.columns,
      });
    }

    return resolvedCitationSchema.parse({
      documentId: ref.documentId,
      parsedDocumentVersion: ref.parsedDocumentVersion,
      pageStart: ref.pageStart,
      ...(ref.pageEnd === undefined ? {} : { pageEnd: ref.pageEnd }),
      ...(ref.sectionId === undefined ? {} : { sectionId: ref.sectionId }),
      ...(sectionHeading === undefined ? {} : { sectionHeading }),
      blocks,
      figures,
      tables,
      issues,
    });
  });
}
