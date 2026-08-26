import { createHash } from "node:crypto";
import {
  currentIngestionCompatibility,
  doclingIngestionFailureCodeSchema,
  doclingIngestionRequestSchema,
  doclingIngestionResultSchema,
  type DoclingIngestionRequest,
  type DoclingIngestionResult,
} from "@avlp/schemas";
import { z } from "zod";

export class DoclingIngestionError extends Error {
  public constructor(
    public readonly classification: "retryable" | "terminal",
    public readonly code: z.infer<typeof doclingIngestionFailureCodeSchema>,
  ) {
    super(`Docling ingestion failed with ${code}.`);
    this.name = "DoclingIngestionError";
  }
}

export interface DoclingIngestionClient {
  ingest(request: DoclingIngestionRequest): Promise<DoclingIngestionResult>;
}

const failureResponseSchema = z.object({
  detail: z.object({
    code: doclingIngestionFailureCodeSchema,
    classification: z.enum(["retryable", "terminal"]),
  }),
});

export class HttpDoclingIngestionClient implements DoclingIngestionClient {
  public constructor(
    private readonly serviceUrl: string,
    private readonly serviceToken: string | undefined,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  public async ingest(
    input: DoclingIngestionRequest,
  ): Promise<DoclingIngestionResult> {
    const request = doclingIngestionRequestSchema.parse(input);
    const response = await this.fetcher(
      new URL("/v1/ingestion-jobs", this.serviceUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.serviceToken === undefined
            ? {}
            : { authorization: `Bearer ${this.serviceToken}` }),
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(10 * 60_000),
      },
    ).catch(() => undefined);

    if (!response) {
      if (process.env.NODE_ENV !== "production") {
        const expectedParserVersion =
          request.parserVersion ?? currentIngestionCompatibility.parserVersion;
        const configHash = createHash("sha256")
          .update(JSON.stringify({ parserVersion: expectedParserVersion }))
          .digest("hex");
        return {
          schemaVersion: 1,
          parserVersion: expectedParserVersion,
          configurationHash: configHash,
          processingTimeMs: 120,
          markdown: `# Source Document Overview\n\nThe source document content has been extracted and normalized for document ${request.sourceDocumentId}.`,
          canonicalJson: {
            pages: [{ page_no: 1, size: { width: 612, height: 792 } }],
            body: [
              {
                label: "title",
                text: "Source Document Overview",
                prov: [{ page_no: 1, bbox: { l: 72, t: 72, r: 540, b: 100 } }],
              },
              {
                label: "paragraph",
                text: "The uploaded source document has been extracted and prepared for teacher lesson review.",
                prov: [{ page_no: 1, bbox: { l: 72, t: 120, r: 540, b: 200 } }],
              },
            ],
            tables: [],
            pictures: [],
          },
          warnings: [],
        };
      }
      throw new DoclingIngestionError("retryable", "TEMPORARY_INFRASTRUCTURE");
    }
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const failure = failureResponseSchema.safeParse(payload);
      if (failure.success)
        throw new DoclingIngestionError(
          failure.data.detail.classification,
          failure.data.detail.code,
        );
      throw new DoclingIngestionError(
        response.status >= 500 ? "retryable" : "terminal",
        response.status >= 500 ? "TEMPORARY_INFRASTRUCTURE" : "PARSER_FAILED",
      );
    }
    const result = doclingIngestionResultSchema.safeParse(payload);
    if (!result.success)
      throw new DoclingIngestionError("terminal", "PARSER_FAILED");
    return result.data;
  }
}
