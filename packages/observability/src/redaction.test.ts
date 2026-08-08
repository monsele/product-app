import { describe, expect, it } from "vitest";
import { createId } from "@avlp/config";
import { withCorrelationContext } from "./correlation.js";
import { createStructuredLogger, type StructuredLogRecord } from "./logging.js";
import { redactSensitiveData, redactedValue } from "./redaction.js";

describe("sensitive-data redaction", () => {
  it("redacts secrets, source content, provider payloads, and signed URLs recursively", () => {
    const value = redactSensitiveData({
      password: "teacher-password",
      nested: {
        authorization: "Bearer secret-token",
        sourceText: "private chapter text",
        providerPayload: { raw: "private provider response" },
        prompt: "private prompt content",
        promptVersion: "narration-v3",
        promptTemplateId: "narration",
        safeIdentifier: "document-123",
        download:
          "https://storage.example/file?X-Amz-Signature=secret&X-Amz-Date=now",
      },
    });

    expect(value).toEqual({
      password: redactedValue,
      nested: {
        authorization: redactedValue,
        sourceText: redactedValue,
        providerPayload: redactedValue,
        prompt: redactedValue,
        promptVersion: "narration-v3",
        promptTemplateId: "narration",
        safeIdentifier: "document-123",
        download: redactedValue,
      },
    });
    expect(JSON.stringify(value)).not.toContain("teacher-password");
    expect(JSON.stringify(value)).not.toContain("private chapter text");
    expect(JSON.stringify(value)).not.toContain("secret&");
  });

  it("writes stable structured records only after redaction", () => {
    const records: StructuredLogRecord[] = [];
    const logger = createStructuredLogger({
      service: "test-service",
      sink: (record) => records.push(record),
      clock: () => new Date("2026-08-08T12:00:00.000Z"),
    });
    logger.info("provider.completed", {
      correlationId: "018f3f91-4ed2-7abc-8def-1234567890ab",
      token: "do-not-log",
    });

    expect(records).toEqual([
      {
        timestamp: "2026-08-08T12:00:00.000Z",
        level: "info",
        event: "provider.completed",
        fields: {
          service: "test-service",
          correlationId: "018f3f91-4ed2-7abc-8def-1234567890ab",
          token: redactedValue,
        },
      },
    ]);
  });

  it("does not let a failing diagnostic sink interrupt product code", () => {
    const logger = createStructuredLogger({
      service: "test-service",
      sink: () => {
        throw new Error("collector unavailable");
      },
    });

    expect(() =>
      logger.info("request.received", { documentId: "doc-1" }),
    ).not.toThrow();
  });

  it("isolates redaction failures and preserves authoritative context fields", () => {
    const records: StructuredLogRecord[] = [];
    const logger = createStructuredLogger({
      service: "test-service",
      sink: (record) => records.push(record),
    });
    const hostileFields = Object.defineProperty({}, "secret", {
      enumerable: true,
      get: () => {
        throw new Error("hostile getter");
      },
    });

    expect(() => logger.info("request.received", hostileFields)).not.toThrow();
    const correlationId = createId();
    withCorrelationContext({ correlationId }, () =>
      logger.info("request.received", {
        service: "spoofed-service",
        correlationId: createId(),
      }),
    );
    expect(records).toEqual([
      expect.objectContaining({
        fields: { service: "test-service", correlationId },
      }),
    ]);
  });
});
