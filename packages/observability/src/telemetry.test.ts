import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { describe, expect, it } from "vitest";
import { SanitizingSpanExporter } from "./telemetry.js";

class CapturingSpanExporter implements SpanExporter {
  public spans: ReadableSpan[] = [];

  public export(
    spans: ReadableSpan[],
    resultCallback: Parameters<SpanExporter["export"]>[1],
  ): void {
    this.spans.push(...spans);
    resultCallback({ code: 0 });
  }

  public shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

describe("trace export redaction", () => {
  it("sanitizes sensitive attributes at the final exporter boundary", () => {
    const delegate = new CapturingSpanExporter();
    const exporter = new SanitizingSpanExporter(delegate);
    const span = {
      name: "GET https://storage.example/file?token=secret",
      attributes: {
        "http.request.header.authorization": "Bearer trace-secret",
        "url.full":
          "https://storage.example/file?X-Amz-Signature=secret&X-Amz-Date=now",
        sourceText: "private chapter",
        documentId: "document-123",
      },
      events: [
        {
          name: "exception",
          time: [0, 0],
          attributes: { "exception.message": "provider secret" },
        },
      ],
      links: [
        {
          context: {},
          attributes: { sourceText: "private linked chapter" },
        },
      ],
      resource: {
        attributes: { apiKey: "resource-secret", service: "api" },
      },
      status: { code: 2, message: "provider secret" },
    } as unknown as ReadableSpan;

    exporter.export([span], () => undefined);

    expect(delegate.spans[0]?.attributes).toEqual({
      "http.request.header.authorization": "[REDACTED]",
      "url.full": "[REDACTED]",
      sourceText: "[REDACTED]",
      documentId: "document-123",
    });
    expect(delegate.spans[0]?.name).toBe("GET [REDACTED]");
    expect(delegate.spans[0]?.events[0]?.attributes).toEqual({
      "exception.message": "[REDACTED]",
    });
    expect(delegate.spans[0]?.links[0]?.attributes).toEqual({
      sourceText: "[REDACTED]",
    });
    expect(delegate.spans[0]?.resource.attributes).toEqual({
      apiKey: "[REDACTED]",
      service: "api",
    });
    expect(delegate.spans[0]?.status.message).toBe("[REDACTED]");
  });
});
