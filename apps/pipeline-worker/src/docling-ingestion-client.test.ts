import { createId } from "@avlp/config";
import { describe, expect, it, vi } from "vitest";
import {
  DoclingIngestionError,
  HttpDoclingIngestionClient,
} from "./docling-ingestion-client.js";

const identifier = createId(new Date("2026-08-14T11:00:00.000Z"));
const request = {
  schemaVersion: 1 as const,
  jobId: identifier,
  sourceDocumentId: identifier,
  sourceDownloadUrl: "https://storage.example.test/source.pdf?signature=opaque",
  mediaType: "application/pdf" as const,
  parserVersion: "docling-v1",
  correlationId: identifier,
};

describe("Docling ingestion HTTP contract", () => {
  it("uses the versioned camel-case request and validates the Python result", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            parserVersion: "docling-v1",
            configurationHash: "a".repeat(64),
            processingTimeMs: 12,
            canonicalJson: { body: { name: "document" } },
            markdown: "# Water cycle\n",
            warnings: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const client = new HttpDoclingIngestionClient(
      "https://ingestion.example.test",
      "test-token",
      fetcher,
    );

    await expect(client.ingest(request)).resolves.toMatchObject({
      parserVersion: "docling-v1",
      markdown: "# Water cycle\n",
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://ingestion.example.test/v1/ingestion-jobs"),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer test-token",
        }),
        body: JSON.stringify(request),
      }),
    );
  });

  it("retains the Python failure classification without exposing parser detail", async () => {
    const client = new HttpDoclingIngestionClient(
      "https://ingestion.example.test",
      undefined,
      async () =>
        new Response(
          JSON.stringify({
            detail: { code: "PARSER_UNSUPPORTED", classification: "terminal" },
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
    );

    await expect(client.ingest(request)).rejects.toEqual(
      new DoclingIngestionError("terminal", "PARSER_UNSUPPORTED"),
    );
  });

  it("treats a malformed successful response as a terminal contract failure", async () => {
    const client = new HttpDoclingIngestionClient(
      "https://ingestion.example.test",
      undefined,
      async () =>
        new Response(JSON.stringify({ schemaVersion: 1 }), { status: 200 }),
    );

    await expect(client.ingest(request)).rejects.toEqual(
      new DoclingIngestionError("terminal", "PARSER_FAILED"),
    );
  });
});
