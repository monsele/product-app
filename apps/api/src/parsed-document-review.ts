import {
  PublicError,
  type Identifier,
} from "@avlp/config";
import {
  type extractedFigures,
} from "@avlp/database";
import {
  parsedDocumentReviewResponseSchema,
  parsedDocumentSectionResponseSchema,
  reviewContentBlockSchema,
  reviewFigureExtensionValues,
  reviewFigureSchema,
  reviewSectionSummarySchema,
  reviewTableSchema,
  reviewWarningSchema,
  type ParsedDocumentReviewResponse,
  type ParsedDocumentSectionResponse,
  type ContentBlockCorrectionState,
} from "@avlp/schemas";
import type { AuthorizedProjectStorage } from "@avlp/storage";
import type { z } from "zod";
import { ParsedDocumentRepository } from "./parsed-document-repository.js";
import { projectEffectiveFigures } from "./source-figure-inclusion.js";

export interface ParsedDocumentReviewService {
  review(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ParsedDocumentReviewResponse>;
  section(
    ownerUserId: Identifier,
    projectId: Identifier,
    sectionId: Identifier,
  ): Promise<ParsedDocumentSectionResponse>;
}

const contentTypeToExtension: Readonly<
  Record<string, (typeof reviewFigureExtensionValues)[number]>
> = {
  "image/gif": "gif",
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

type FigureRow = (typeof extractedFigures)["$inferSelect"];

export class PostgresParsedDocumentReviewService
  implements ParsedDocumentReviewService
{
  public constructor(
    private readonly repository: ParsedDocumentRepository,
    private readonly storage: AuthorizedProjectStorage | undefined,
  ) {}

  public async review(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ParsedDocumentReviewResponse> {
    const result = await this.repository.findLatestForProject({
      ownerUserId,
      projectId,
    });
    if (result === undefined)
      throw new PublicError(
        "not_found",
        "No parsed document is available for this project.",
        404,
      );
    const { document, quality, sections, warnings } = result;
    const counts = await this.repository.countSectionChildren(document.id);
    return parsedDocumentReviewResponseSchema.parse({
      document: {
        id: document.id,
        sourceDocumentId: document.sourceDocumentId,
        version: document.version,
        schemaVersion: document.schemaVersion,
        parserVersion: document.parserVersion,
        title: document.title,
        language: document.language,
        pageCount: document.pageCount,
      },
      sections: sections.map((section) =>
        reviewSectionSummarySchema.parse({
          id: section.id,
          parentSectionId: section.parentSectionId ?? undefined,
          order: section.order,
          level: section.level,
          heading: section.heading,
          pageStart: section.pageStart,
          pageEnd: section.pageEnd,
          blockCount: counts.blocks.get(section.id) ?? 0,
          figureCount: counts.figures.get(section.id) ?? 0,
          tableCount: counts.tables.get(section.id) ?? 0,
        }),
      ),
      warnings: warnings.map((warning) =>
        reviewWarningSchema.parse({
          id: warning.id,
          code: warning.code,
          severity: warning.severity,
          message: warning.message,
          pageStart: warning.pageStart,
          pageEnd: warning.pageEnd,
          sectionId: warning.sectionId ?? undefined,
          blockId: warning.blockId ?? undefined,
          figureId: warning.figureId ?? undefined,
          tableId: warning.tableId ?? undefined,
        }),
      ),
      quality:
        quality === undefined
          ? null
          : {
              score: quality.score,
              status: quality.status,
              findings: quality.findings,
            },
    });
  }

  public async section(
    ownerUserId: Identifier,
    projectId: Identifier,
    sectionId: Identifier,
  ): Promise<ParsedDocumentSectionResponse> {
    const latest = await this.repository.findLatestForProject({
      ownerUserId,
      projectId,
    });
    if (latest === undefined)
      throw new PublicError(
        "not_found",
        "No parsed document is available for this project.",
        404,
      );
    const detail = await this.repository.findSectionDetail({
      ownerUserId,
      projectId,
      parsedDocumentId: latest.document.id,
      sectionId,
    });
    if (detail === undefined)
      throw new PublicError(
        "not_found",
        "The requested section was not found in this document.",
        404,
      );
    const corrections = await this.loadCorrections(
      ownerUserId,
      projectId,
      latest.document.id,
    );
    const [figureSignedUrls, figureOverlays] = await Promise.all([
      this.signFigureUrls(
        ownerUserId,
        projectId,
        latest.document.ingestionArtifactId,
        detail.figures,
      ),
      this.repository.findFigureInclusionOverlays({
        ownerUserId,
        projectId,
        parsedDocumentId: latest.document.id,
      }),
    ]);
    const figureOverlayMap = new Map(
      figureOverlays.map((overlay) => [
        overlay.figureId,
        { included: overlay.included, revision: overlay.revision },
      ]),
    );
    return parsedDocumentSectionResponseSchema.parse({
      section: {
        id: detail.section.id,
        parentSectionId: detail.section.parentSectionId ?? undefined,
        order: detail.section.order,
        level: detail.section.level,
        heading: detail.section.heading,
        pageStart: detail.section.pageStart,
        pageEnd: detail.section.pageEnd,
        blocks: detail.blocks.map((block) =>
          mapContentBlock(
            block.id,
            block.kind,
            block.order,
            block.pageStart,
            block.pageEnd,
            block.content,
            corrections.get(block.id),
          ),
        ),
        figures: projectEffectiveFigures(
          detail.figures.map((figure) => ({
            id: figure.id,
            order: figure.order,
            pageStart: figure.pageStart,
            pageEnd: figure.pageEnd,
            captionBlockId: figure.captionBlockId,
            altText: figure.altText,
            sourceLocator: figure.sourceLocator,
            contentType: figure.contentType,
            width: figure.width,
            height: figure.height,
          })),
          figureOverlayMap,
        ).map((figure) => {
          const signed = figureSignedUrls.get(figure.id);
          return reviewFigureSchema.parse({
            ...figure,
            previewUrl: signed?.previewUrl,
            ...(signed?.thumbnailUrl === undefined
              ? {}
              : { thumbnailUrl: signed.thumbnailUrl }),
          });
        }),
        tables: detail.tables.map((table) =>
          reviewTableSchema.parse({
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
          }),
        ),
      },
    });
  }

  private async loadCorrections(
    ownerUserId: Identifier,
    projectId: Identifier,
    parsedDocumentId: Identifier,
  ): Promise<Map<string, ContentBlockCorrectionState>> {
    const rows = await this.repository.findBlockCorrections({
      ownerUserId,
      projectId,
      parsedDocumentId,
    });
    const result = new Map<string, ContentBlockCorrectionState>();
    for (const row of rows) {
      result.set(row.blockId, {
        revision: row.revision,
        correctedText: row.correctedText,
        correctedItems: row.correctedItems as string[] | null,
        correctedLatex: row.correctedLatex,
      });
    }
    return result;
  }

  private async signFigureUrls(
    ownerUserId: Identifier,
    projectId: Identifier,
    versionId: Identifier,
    figures: readonly FigureRow[],
  ): Promise<Map<string, { previewUrl?: string; thumbnailUrl?: string }>> {
    const result = new Map<
      string,
      { previewUrl?: string; thumbnailUrl?: string }
    >();
    if (this.storage === undefined || figures.length === 0) return result;
    for (const figure of figures) {
      if (figure.contentType === null || figure.storageKey === null) continue;
      const extension = contentTypeToExtension[figure.contentType];
      if (extension === undefined) continue;
      try {
        const preview = await this.storage.createSignedDownload(ownerUserId, {
          projectId,
          object: {
            kind: "parsed_figure_original",
            versionId,
            figureId: figure.id,
            extension,
          },
        });
        let thumbnailUrl: string | undefined;
        if (figure.thumbnailStorageKey !== null) {
          const thumbnail = await this.storage.createSignedDownload(
            ownerUserId,
            {
              projectId,
              object: {
                kind: "parsed_figure_thumbnail",
                versionId,
                figureId: figure.id,
                extension,
              },
            },
          );
          thumbnailUrl = thumbnail.url;
        }
        result.set(figure.id, { previewUrl: preview.url, ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}) });
      } catch {
        // If signing fails, the figure is listed without a preview URL.
      }
    }
    return result;
  }
}

function mapContentBlock(
  id: string,
  kind: string,
  order: number,
  pageStart: number,
  pageEnd: number,
  content: unknown,
  correction?: ContentBlockCorrectionState,
): z.infer<typeof reviewContentBlockSchema> {
  const raw = (content ?? {}) as Record<string, unknown>;
  const correctionField =
    correction === undefined ? {} : { correction: { ...correction } };
  switch (kind) {
    case "paragraph":
      return reviewContentBlockSchema.parse({
        id,
        kind: "paragraph",
        order,
        pageStart,
        pageEnd,
        text: raw.text ?? "",
        ...correctionField,
      });
    case "list":
      return reviewContentBlockSchema.parse({
        id,
        kind: "list",
        order,
        pageStart,
        pageEnd,
        items: raw.items ?? [],
        ...correctionField,
      });
    case "equation":
      return reviewContentBlockSchema.parse({
        id,
        kind: "equation",
        order,
        pageStart,
        pageEnd,
        latex: raw.latex ?? "",
        ...(typeof raw.text === "string" ? { text: raw.text } : {}),
        ...correctionField,
      });
    case "caption":
      return reviewContentBlockSchema.parse({
        id,
        kind: "caption",
        order,
        pageStart,
        pageEnd,
        text: raw.text ?? "",
        ...correctionField,
      });
    case "unsupported":
      return reviewContentBlockSchema.parse({
        id,
        kind: "unsupported",
        order,
        pageStart,
        pageEnd,
        parserKind:
          typeof raw.parserKind === "string" ? raw.parserKind : "unknown",
      });
    default:
      return reviewContentBlockSchema.parse({
        id,
        kind: "unsupported",
        order,
        pageStart,
        pageEnd,
        parserKind: kind,
      });
  }
}
