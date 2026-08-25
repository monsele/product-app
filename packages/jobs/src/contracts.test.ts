import { createId } from "@avlp/config";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createIdempotencyKey,
  createJobEnvelope,
  hashJobOptions,
  jobEnvelopeSchema,
} from "./index.js";

describe("versioned job contracts", () => {
  it("validates envelope payloads at the queue boundary", () => {
    const envelope = createJobEnvelope(
      z.object({ sourceVersion: z.string() }),
      {
        payloadVersion: 1,
        jobId: createId(),
        jobType: "document.ingest",
        projectId: createId(),
        ownerUserId: createId(),
        inputVersion: "source-v1",
        idempotencyKey: "document.ingest:key",
        correlationId: createId(),
        payload: { sourceVersion: "source-v1" },
      },
    );

    expect(
      jobEnvelopeSchema(z.object({ sourceVersion: z.string() })).parse(
        envelope,
      ),
    ).toMatchObject({ schemaVersion: 1, payloadVersion: 1 });
    expect(() =>
      jobEnvelopeSchema(z.object({ sourceVersion: z.string() })).parse({
        ...envelope,
        payload: { sourceVersion: 1 },
      }),
    ).toThrow();
  });

  it("creates stable idempotency keys independent of option key order", () => {
    const projectId = createId();
    const first = createIdempotencyKey({
      jobType: "lesson.generate",
      projectId,
      inputVersion: "outline-v2",
      options: { duration: 180, tone: "clear" },
    });
    const second = createIdempotencyKey({
      jobType: "lesson.generate",
      projectId,
      inputVersion: "outline-v2",
      options: { tone: "clear", duration: 180 },
    });

    expect(first).toBe(second);
    expect(first).toContain(hashJobOptions({ tone: "clear", duration: 180 }));
  });
});
