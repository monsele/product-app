import { describe, expect, it } from "vitest";
import {
  groundingStatusSchema,
  groundingClaimSchema,
  groundingClaimResultSchema,
  groundingCheckSchema,
  citationHistorySnapshotSchema,
  groundingCheckRequestSchema,
  groundingCheckResponseSchema,
  groundingCheckResultResponseSchema,
  groundingCheckParamsSchema,
  groundingClaimOutputSchema,
  groundingOutputSchema,
  groundingCompatibilitySchema,
  currentGroundingCompatibility,
  type GroundingStatus,
  type GroundingClaim,
  type GroundingClaimResult,
  type GroundingCheck,
  type CitationHistorySnapshot,
  type GroundingCheckRequest,
  type GroundingCheckResponse,
  type GroundingCheckResultResponse,
  type GroundingClaimOutput,
  type GroundingOutput,
} from "./index.js";
import { createId } from "@avlp/config";
import { z } from "zod";

const now = new Date().toISOString();
const testId = createId(new Date());

describe("ST-053 Grounding Check Schemas", () => {
  describe("groundingStatusSchema", () => {
    it("accepts valid grounding statuses", () => {
      const validStatuses: GroundingStatus[] = [
        "supported",
        "unsupported",
        "generated_addition",
        "needs_review",
      ];
      for (const status of validStatuses) {
        expect(groundingStatusSchema.parse(status)).toBe(status);
      }
    });

    it("rejects invalid grounding status", () => {
      expect(() => groundingStatusSchema.parse("invalid")).toThrow(z.ZodError);
    });
  });

  describe("groundingClaimSchema", () => {
    it("accepts a valid narration claim", () => {
      const claim: GroundingClaim = {
        id: testId,
        text: "Photosynthesis converts carbon dioxide and water into glucose using sunlight.",
        sourceRefs: [
          {
            documentId: testId,
            parsedDocumentVersion: 1,
            pageStart: 5,
            pageEnd: 5,
            blockIds: [testId],
          },
        ],
        location: {
          type: "narration",
          blockId: testId,
          sentenceIndex: 0,
        },
      };
      expect(groundingClaimSchema.parse(claim)).toEqual(claim);
    });

    it("accepts a valid on-screen text claim with generated addition", () => {
      const claim: GroundingClaim = {
        id: testId,
        text: "Think of photosynthesis like a kitchen where sunlight is the chef.",
        sourceRefs: [],
        generatedAddition: {
          kind: "analogy",
          content: "Think of photosynthesis like a kitchen where sunlight is the chef.",
          rationale: "Helps students visualize the process.",
        },
        location: {
          type: "on_screen_text",
          sceneId: testId,
        },
      };
      expect(groundingClaimSchema.parse(claim)).toEqual(claim);
    });

    it("rejects claim without sourceRefs or generatedAddition", () => {
      const claim = {
        id: testId,
        text: "Unsupported claim.",
        sourceRefs: [],
        location: { type: "narration" as const },
      };
      expect(() => groundingClaimSchema.parse(claim)).toThrow(z.ZodError);
    });

    it("rejects claim with both sourceRefs and generatedAddition", () => {
      const claim = {
        id: testId,
        text: "Claim with both.",
        sourceRefs: [
          {
            documentId: testId,
            parsedDocumentVersion: 1,
            pageStart: 1,
            blockIds: [testId],
          },
        ],
        generatedAddition: {
          kind: "analogy" as const,
          content: "Analogy",
          rationale: "Rationale",
        },
        location: { type: "narration" as const },
      };
      expect(() => groundingClaimSchema.parse(claim)).toThrow(z.ZodError);
    });
  });

  describe("groundingClaimResultSchema", () => {
    it("accepts a supported claim result", () => {
      const result: GroundingClaimResult = {
        claimId: testId,
        status: "supported",
        supportedSpans: [
          { start: 0, end: 50, sourceBlockId: testId },
        ],
        unsupportedSpans: [],
        modelAssisted: true,
        modelCallId: testId,
        checkedAt: now,
      };
      expect(groundingClaimResultSchema.parse(result)).toEqual(result);
    });

    it("accepts an unsupported claim result", () => {
      const result: GroundingClaimResult = {
        claimId: testId,
        status: "unsupported",
        supportedSpans: [],
        unsupportedSpans: [
          { start: 0, end: 50, reason: "No source mentions glucose production." },
        ],
        modelAssisted: true,
        modelCallId: testId,
        checkedAt: now,
      };
      expect(groundingClaimResultSchema.parse(result)).toEqual(result);
    });

    it("accepts a generated_addition result", () => {
      const result: GroundingClaimResult = {
        claimId: testId,
        status: "generated_addition",
        supportedSpans: [],
        unsupportedSpans: [],
        modelAssisted: false,
        modelCallId: null,
        checkedAt: now,
      };
      expect(groundingClaimResultSchema.parse(result)).toEqual(result);
    });

    it("accepts a needs_review result", () => {
      const result: GroundingClaimResult = {
        claimId: testId,
        status: "needs_review",
        supportedSpans: [{ start: 0, end: 20, sourceBlockId: testId }],
        unsupportedSpans: [{ start: 20, end: 50, reason: "Partial support only." }],
        modelAssisted: true,
        modelCallId: testId,
        checkedAt: now,
      };
      expect(groundingClaimResultSchema.parse(result)).toEqual(result);
    });

    it("rejects a supported span whose start is not before its end", () => {
      const result = {
        claimId: testId,
        status: "supported",
        supportedSpans: [{ start: 20, end: 10, sourceBlockId: testId }],
        unsupportedSpans: [],
        modelAssisted: true,
        modelCallId: testId,
        checkedAt: now,
      };
      expect(() => groundingClaimResultSchema.parse(result)).toThrow(z.ZodError);
    });

    it("rejects an unsupported span whose start is not before its end", () => {
      const result = {
        claimId: testId,
        status: "unsupported",
        supportedSpans: [],
        unsupportedSpans: [{ start: 50, end: 50, reason: "Flat span." }],
        modelAssisted: true,
        modelCallId: testId,
        checkedAt: now,
      };
      expect(() => groundingClaimResultSchema.parse(result)).toThrow(z.ZodError);
    });
  });

  describe("groundingCheckSchema", () => {
    it("accepts a valid grounding check", () => {
      const check: GroundingCheck = {
        schemaVersion: "grounding-check-v1",
        id: testId,
        projectId: testId,
        lessonSpecId: testId,
        lessonSpecRevision: 5,
        lessonSpecContentHash: "a".repeat(64),
        sourceSnapshotId: testId,
        sourceSnapshotContentHash: "b".repeat(64),
        claims: [
          {
            id: testId,
            text: "Test claim.",
            sourceRefs: [
              {
                documentId: testId,
                parsedDocumentVersion: 1,
                pageStart: 1,
                blockIds: [testId],
              },
            ],
            location: { type: "narration" },
          },
        ],
        results: [
          {
            claimId: testId,
            status: "supported",
            supportedSpans: [{ start: 0, end: 10, sourceBlockId: testId }],
            unsupportedSpans: [],
            modelAssisted: true,
            modelCallId: testId,
            checkedAt: now,
          },
        ],
        summary: {
          total: 1,
          supported: 1,
          unsupported: 0,
          generatedAddition: 0,
          needsReview: 0,
        },
        modelCalls: [testId],
        createdAt: now,
      };
      expect(groundingCheckSchema.parse(check)).toEqual(check);
    });

    it("rejects invalid content hash format", () => {
      const check = {
        schemaVersion: "grounding-check-v1",
        id: testId,
        projectId: testId,
        lessonSpecId: testId,
        lessonSpecRevision: 5,
        lessonSpecContentHash: "invalid-hash",
        sourceSnapshotId: testId,
        sourceSnapshotContentHash: "b".repeat(64),
        claims: [],
        results: [],
        summary: { total: 0, supported: 0, unsupported: 0, generatedAddition: 0, needsReview: 0 },
        modelCalls: [],
        createdAt: now,
      };
      expect(() => groundingCheckSchema.parse(check)).toThrow(z.ZodError);
    });
  });

  describe("citationHistorySnapshotSchema", () => {
    it("accepts a valid citation history snapshot", () => {
      const snapshot: CitationHistorySnapshot = {
        schemaVersion: "citation-history-v1",
        lessonVersionId: testId,
        lessonSpecId: testId,
        lessonSpecRevision: 5,
        sourceSnapshotId: testId,
        sourceSnapshotContentHash: "a".repeat(64),
        sceneCitations: [],
        groundingCheckId: testId,
        createdAt: now,
      };
      expect(citationHistorySnapshotSchema.parse(snapshot)).toEqual(snapshot);
    });

    it("accepts snapshot without grounding check", () => {
      const snapshot: CitationHistorySnapshot = {
        schemaVersion: "citation-history-v1",
        lessonVersionId: testId,
        lessonSpecId: testId,
        lessonSpecRevision: 5,
        sourceSnapshotId: testId,
        sourceSnapshotContentHash: "a".repeat(64),
        sceneCitations: [],
        groundingCheckId: null,
        createdAt: now,
      };
      expect(citationHistorySnapshotSchema.parse(snapshot)).toEqual(snapshot);
    });
  });

  describe("groundingCheckRequestSchema", () => {
    it("accepts a lesson-scoped request", () => {
      const request: GroundingCheckRequest = {
        scope: "lesson",
        lessonSpecId: testId,
        lessonSpecRevision: 5,
      };
      expect(groundingCheckRequestSchema.parse(request)).toEqual(request);
    });

    it("accepts a scene-scoped request with sceneId", () => {
      const request: GroundingCheckRequest = {
        scope: "scene",
        sceneId: testId,
        lessonSpecId: testId,
        lessonSpecRevision: 5,
      };
      expect(groundingCheckRequestSchema.parse(request)).toEqual(request);
    });

    it("rejects scene-scoped request without sceneId", () => {
      const request = {
        scope: "scene",
        lessonSpecId: testId,
        lessonSpecRevision: 5,
      };
      expect(() => groundingCheckRequestSchema.parse(request)).toThrow(z.ZodError);
    });
  });

  describe("groundingCheckResponseSchema", () => {
    it("accepts a valid response", () => {
      const response: GroundingCheckResponse = {
        jobId: testId,
        status: "queued",
        cached: false,
      };
      expect(groundingCheckResponseSchema.parse(response)).toEqual(response);
    });

    it("defaults cached to false when omitted", () => {
      const parsed = groundingCheckResponseSchema.parse({
        jobId: testId,
        status: "queued",
      });
      expect(parsed.cached).toBe(false);
    });

    it("accepts a cached recheck response", () => {
      const response: GroundingCheckResponse = {
        jobId: testId,
        status: "queued",
        cached: true,
      };
      expect(groundingCheckResponseSchema.parse(response)).toEqual(response);
    });
  });

  describe("groundingCheckResultResponseSchema", () => {
    it("accepts a response with check and job", () => {
      const response: GroundingCheckResultResponse = {
        check: {
          schemaVersion: "grounding-check-v1",
          id: testId,
          projectId: testId,
          lessonSpecId: testId,
          lessonSpecRevision: 5,
          lessonSpecContentHash: "a".repeat(64),
          sourceSnapshotId: testId,
          sourceSnapshotContentHash: "b".repeat(64),
          claims: [],
          results: [],
          summary: { total: 0, supported: 0, unsupported: 0, generatedAddition: 0, needsReview: 0 },
          modelCalls: [],
          createdAt: now,
        },
        latestJob: {
          id: testId,
          state: "succeeded",
          errorCode: null,
          updatedAt: now,
        },
      };
      expect(groundingCheckResultResponseSchema.parse(response)).toEqual(response);
    });

    it("accepts a response with null check and job", () => {
      const response: GroundingCheckResultResponse = {
        check: null,
        latestJob: null,
      };
      expect(groundingCheckResultResponseSchema.parse(response)).toEqual(response);
    });
  });

  describe("groundingCheckParamsSchema", () => {
    it("accepts a valid lesson-scoped params", () => {
      const params = {
        lessonSpecId: testId,
        lessonSpecRevision: 5,
        lessonSpecContentHash: "a".repeat(64),
        sourceSnapshotId: testId,
        sourceSnapshotContentHash: "b".repeat(64),
        scope: "lesson",
      };
      expect(groundingCheckParamsSchema.parse(params)).toEqual(params);
    });

    it("accepts a valid scene-scoped params", () => {
      const params = {
        lessonSpecId: testId,
        lessonSpecRevision: 5,
        lessonSpecContentHash: "a".repeat(64),
        sourceSnapshotId: testId,
        sourceSnapshotContentHash: "b".repeat(64),
        scope: "scene",
        sceneId: testId,
      };
      expect(groundingCheckParamsSchema.parse(params)).toEqual(params);
    });

    it("rejects scene-scoped params without sceneId", () => {
      const params = {
        lessonSpecId: testId,
        lessonSpecRevision: 5,
        lessonSpecContentHash: "a".repeat(64),
        sourceSnapshotId: testId,
        sourceSnapshotContentHash: "b".repeat(64),
        scope: "scene",
      };
      expect(() => groundingCheckParamsSchema.parse(params)).toThrow(z.ZodError);
    });

    it("rejects invalid content hash format", () => {
      const params = {
        lessonSpecId: testId,
        lessonSpecRevision: 5,
        lessonSpecContentHash: "invalid-hash",
        sourceSnapshotId: testId,
        sourceSnapshotContentHash: "b".repeat(64),
        scope: "lesson",
      };
      expect(() => groundingCheckParamsSchema.parse(params)).toThrow(z.ZodError);
    });
  });

  describe("groundingClaimOutputSchema", () => {
    it("accepts a valid claim output", () => {
      const output: GroundingClaimOutput = {
        schemaVersion: "grounding-claim-v1",
        claimId: testId,
        status: "supported",
        supportedSpans: [{ start: 0, end: 10, sourceBlockId: testId }],
        unsupportedSpans: [],
      };
      expect(groundingClaimOutputSchema.parse(output)).toEqual(output);
    });
  });

  describe("groundingOutputSchema", () => {
    it("accepts a valid grounding output", () => {
      const output: GroundingOutput = {
        schemaVersion: "grounding-v1",
        results: [
          {
            schemaVersion: "grounding-claim-v1",
            claimId: testId,
            status: "supported",
            supportedSpans: [{ start: 0, end: 10, sourceBlockId: testId }],
            unsupportedSpans: [],
          },
        ],
      };
      expect(groundingOutputSchema.parse(output)).toEqual(output);
    });
  });

  describe("groundingCompatibilitySchema", () => {
    it("accepts the current grounding compatibility", () => {
      expect(groundingCompatibilitySchema.parse(currentGroundingCompatibility)).toEqual(
        currentGroundingCompatibility
      );
    });

    it("has correct current values", () => {
      expect(currentGroundingCompatibility.promptId).toBe("grounding");
      expect(currentGroundingCompatibility.promptVersion).toBe("v2");
      expect(currentGroundingCompatibility.model).toBe("Qwen/Qwen3.8-Flash");
    });
  });
});
