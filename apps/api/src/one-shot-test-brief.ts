/**
 * ST-107 test support: a brief generator that records its call like the real
 * one (a model-call row and a usage record under the run's correlation id)
 * without a provider. Used by the Postgres integration tests; never imported
 * by production code.
 */
import { createId, PublicError, type Identifier } from "@avlp/config";
import { modelCalls, usageRecords, type DatabaseClient } from "@avlp/database";
import type { OneShotBriefGenerator, PreparedBrief } from "./one-shot-brief.js";

export const fakeBriefSectionIds = [
  "019ffc50-5ec1-7000-8000-000000000001",
  "019ffc50-5ec1-7000-8000-000000000002",
] as Identifier[];

export class FakeBriefGenerator implements OneShotBriefGenerator {
  public calls: Parameters<OneShotBriefGenerator["prepare"]>[0][] = [];
  public plannedSceneCount = 6;
  public costUsd = 0.05;
  /** Fail the next call, as a provider or validation failure would. */
  public failNext: Error | null = null;

  public constructor(
    private readonly database: () => DatabaseClient,
    private readonly now: () => Date,
  ) {}

  /** When false, the document is "still being read". */
  public ready = true;

  public async assertReady(): Promise<void> {
    if (!this.ready)
      throw new PublicError(
        "bad_request",
        "Your document is still being read. Try preparing the brief again in a moment.",
        409,
        true,
      );
  }

  public async prepare(
    input: Parameters<OneShotBriefGenerator["prepare"]>[0],
  ): Promise<PreparedBrief> {
    this.calls.push(input);
    const timestamp = this.now();
    const modelCallId = createId(timestamp);
    await this.database().insert(modelCalls).values({
      id: modelCallId,
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      operationType: "ai.one-shot-brief",
      idempotencyKey: `one-shot-brief:${input.idempotencyKey}`,
      promptId: "one-shot-brief",
      promptVersion: "v1",
      provider: "fake",
      model: "mock-model-1",
      inputVersion: "test",
      inputHash: "test",
      inputUnits: 100,
      outputUnits: 100,
      estimatedCostUsd: this.costUsd.toFixed(6),
      latencyMs: 10,
      validationStatus: this.failNext === null ? "validated" : "invalid",
      status: this.failNext === null ? "succeeded" : "failed",
      correlationId: input.correlationId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.database().insert(usageRecords).values({
      id: createId(timestamp),
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      operationType: "ai.one-shot-brief",
      idempotencyKey: `one-shot-brief:${input.idempotencyKey}`,
      provider: "fake",
      model: "mock-model-1",
      unit: "token",
      quantity: "200",
      estimatedCostUsd: this.costUsd.toFixed(6),
      status: this.failNext === null ? "succeeded" : "failed",
      correlationId: input.correlationId,
      occurredAt: timestamp,
    });
    if (this.failNext !== null) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    return {
      output: {
        schemaVersion: "one-shot-brief-v1",
        subject: "Structural engineering",
        lessonTitle: "How trusses carry load",
        coverage: [
          { point: "How trusses spread load", sectionIds: [fakeBriefSectionIds[0]!] },
          { point: "Why triangles are rigid", sectionIds: [fakeBriefSectionIds[1]!] },
        ],
        notCovered: ["Bridge history"],
        plannedSceneCount: this.plannedSceneCount,
        stylePackId: "systems",
        stylePackReason: "Precise diagrams suit load paths.",
        soundBed: "none",
        soundBedReason: "No track is needed for a technical walkthrough.",
      },
      sections: [
        { sectionId: fakeBriefSectionIds[0]!, heading: "Load paths" },
        { sectionId: fakeBriefSectionIds[1]!, heading: "Triangles" },
      ],
      modelCallId: modelCallId as Identifier,
      costUsd: this.costUsd,
      model: "mock-model-1",
      promptVersion: "one-shot-brief/v1",
    };
  }
}
