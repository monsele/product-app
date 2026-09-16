import type { Identifier } from "@avlp/config";
import {
  extractedFigures,
  parsedDocuments,
  parsedSections,
  type DatabaseClient,
} from "@avlp/database";
import {
  sourceVisualPickerResponseSchema,
  type SourceVisualPickerResponse,
} from "@avlp/schemas";
import { and, eq, inArray } from "drizzle-orm";
import { storageKeySchema, type ObjectStorage } from "@avlp/storage";
import type { SourceSnapshotService } from "./source-snapshot.js";

export interface SourceVisualsService {
  list(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<SourceVisualPickerResponse>;
}

const contentTypeToExtension: Readonly<
  Record<string, "gif" | "jpeg" | "png" | "webp">
> = {
  "image/gif": "gif",
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * The `Source visuals` picker (ST-093) lists only what the project's
 * currently approved snapshot contains — never merely parsed, excluded,
 * superseded, or unapproved material. Figure metadata and table content both
 * come from the immutable snapshot payload; only a figure's binary preview
 * requires a signed URL from object storage.
 */
export class PostgresSourceVisualsService implements SourceVisualsService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly sourceSnapshots: Pick<
      SourceSnapshotService,
      "latestApprovedVisuals"
    >,
    private readonly storage: Pick<ObjectStorage, "createSignedDownload"> | undefined,
  ) {}

  public async list(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<SourceVisualPickerResponse> {
    const latest = await this.sourceSnapshots.latestApprovedVisuals(input);
    if (latest === undefined)
      return sourceVisualPickerResponseSchema.parse({
        entries: [],
        snapshotId: null,
      });

    const figureIds = latest.figures.map((figure) => figure.figureId);
    const [document] =
      figureIds.length === 0
        ? []
        : await this.database
            .select({ id: parsedDocuments.id })
            .from(parsedDocuments)
            .where(eq(parsedDocuments.id, latest.parsedDocumentId))
            .limit(1);
    const figureRows =
      figureIds.length === 0 || document === undefined
        ? []
        : await this.database
            .select()
            .from(extractedFigures)
            .where(
              and(
                eq(extractedFigures.parsedDocumentId, latest.parsedDocumentId),
                inArray(extractedFigures.id, figureIds),
              ),
            );
    const figureRowById = new Map(figureRows.map((row) => [row.id, row]));

    const sectionIds = [
      ...new Set([
        ...latest.figures.map((figure) => figure.sectionId),
        ...latest.tables.map((table) => table.sectionId),
      ]),
    ];
    const sectionRows =
      sectionIds.length === 0
        ? []
        : await this.database
            .select({
              id: parsedSections.id,
              heading: parsedSections.heading,
            })
            .from(parsedSections)
            .where(
              and(
                eq(parsedSections.parsedDocumentId, latest.parsedDocumentId),
                inArray(parsedSections.id, sectionIds),
              ),
            );
    const headingBySectionId = new Map(
      sectionRows.map((section) => [section.id, section.heading]),
    );

    const figureEntries = await Promise.all(
      latest.figures.map(async (figure) => {
        const row = figureRowById.get(figure.figureId);
        const sectionHeading = headingBySectionId.get(figure.sectionId);
        const thumbnailUrl = await this.signThumbnail(
          row?.contentType ?? null,
          row?.thumbnailStorageKey ?? null,
        );
        return {
          kind: "figure" as const,
          figureId: figure.figureId,
          sectionId: figure.sectionId,
          ...(sectionHeading === undefined ? {} : { sectionHeading }),
          pageStart: figure.pageStart,
          ...(figure.pageEnd === undefined ? {} : { pageEnd: figure.pageEnd }),
          ...(figure.altText === undefined
            ? {}
            : { caption: figure.altText, altText: figure.altText }),
          ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
        };
      }),
    );

    const tableEntries = latest.tables.map((table) => {
      const sectionHeading = headingBySectionId.get(table.sectionId);
      return {
        kind: "table" as const,
        tableId: table.tableId,
        sectionId: table.sectionId,
        ...(sectionHeading === undefined ? {} : { sectionHeading }),
        pageStart: table.pageStart,
        ...(table.pageEnd === undefined ? {} : { pageEnd: table.pageEnd }),
        columns: table.columns,
        rowCount: table.rows.length,
      };
    });

    return sourceVisualPickerResponseSchema.parse({
      entries: [...figureEntries, ...tableEntries],
      snapshotId: latest.snapshotId,
    });
  }

  /**
   * Signs the figure's own stored thumbnail key directly, the same way
   * `PreviewManifestService`/`PostgresRenderService` resolve source figures.
   * A figure's `thumbnailStorageKey` was written once, at ingestion, under
   * the *ingesting* project's tenant prefix (see
   * `document-ingestion-job.ts`); for a same-owner reused artifact that is
   * not the requesting project, so the key must never be reconstructed from
   * the requesting project's id (as `AuthorizedProjectStorage`'s semantic
   * locator would do) — only the stored key resolves to the real object.
   */
  private async signThumbnail(
    contentType: string | null,
    thumbnailStorageKey: string | null,
  ): Promise<string | undefined> {
    if (
      this.storage === undefined ||
      contentType === null ||
      thumbnailStorageKey === null ||
      contentTypeToExtension[contentType] === undefined
    )
      return undefined;
    try {
      const signed = await this.storage.createSignedDownload({
        key: storageKeySchema.parse(thumbnailStorageKey),
        expiresInSeconds: 300,
      });
      return signed.url;
    } catch {
      // Listed without a thumbnail if signing fails.
      return undefined;
    }
  }
}
