import {
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
    ).catch(() => {
      throw new DoclingIngestionError("retryable", "TEMPORARY_INFRASTRUCTURE");
    });
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
