import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createId, type Identifier } from "@avlp/config";
import {
  creativeDesignDrafts,
  migrateDatabase,
  usageRecords,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import type { JobMetadata, RegisteredJobHandler } from "@avlp/jobs";
import {
  InMemoryQuotaGuard,
  MockLanguageModelProvider,
  repositoryPrompts,
  StaticPromptRegistry,
} from "@avlp/provider-adapters";
import { creativeDesignHash, validateCreativeDesignManifestV2 } from "@avlp/schemas";
import { and, eq } from "drizzle-orm";
import {
  authoredDesign,
  draftId,
  now,
  otherOwnerId,
  otherProjectId,
  ownerUserId,
  projectId,
  readDraft,
  sceneA,
  sceneB,
  sceneSpecs,
  seed,
  seedDatabase,
  snapshot,
  snapshotId,
} from "./cinema-lesson.fixture.js";
import { createVisualPlanJobHandler } from "./visual-plan-job.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;


/** A plan with one grounded and one ungrounded headline. */
const modelPlan = {
  artDirection: { treatment: "ink-sketch" },
  scenes: [
    {
      sceneId: sceneA,
      compositions: ["illustrated-headline"],
      headline: "Water evaporates when heated",
      illustration: {
        concept: "warm puddle",
        description: "Sunlight warming a puddle while vapour drifts upward.",
        subject: "place",
      },
      beats: [
        { target: "headline", motion: "sequential-reveal", sentence: 0 },
        { target: "image", motion: "emphasis", sentence: 0 },
      ],
    },
    {
      sceneId: sceneB,
      compositions: ["sequence"],
      headline: "Water becomes clouds forever",
      beats: [
        { target: "item-1", motion: "path-build", sentence: 0 },
        { target: "item-2", motion: "path-build", sentence: 1 },
        { target: "item-3", motion: "path-build", sentence: 2 },
      ],
    },
  ],
};

type Harness = {
  handler: RegisteredJobHandler;
  provider: MockLanguageModelProvider;
};

function harness(
  client: DatabaseClient,
  options: {
    completion?: () => string;
    fail?: { code: string; retryable?: boolean };
    quota?: InMemoryQuotaGuard;
  } = {},
): Harness {
  const provider = new MockLanguageModelProvider({
    completion: options.completion ?? (() => JSON.stringify(modelPlan)),
    ...(options.fail === undefined ? {} : { fail: options.fail }),
  });
  const handler = createVisualPlanJobHandler({
    database: client,
    provider,
    promptRegistry: new StaticPromptRegistry(repositoryPrompts),
    quotaGuard:
      options.quota ??
      new InMemoryQuotaGuard([{ operationType: "ai.creative_design", maxCalls: 20, windowMs: 3_600_000 }]),
    now: () => now,
    modelCallOverrides: {
      sourceSnapshotLoader: async () => ({ status: "ok", snapshot }),
    },
  });
  return { handler, provider };
}

async function run(
  handler: RegisteredJobHandler,
  options: {
    attempt?: number;
    draftRevision?: number;
    ownerUserId?: Identifier;
    projectId?: Identifier;
    idempotencyKey?: string;
  } = {},
): Promise<JobMetadata> {
  const jobId = createId();
  return handler.handler(
    {
      schemaVersion: 2,
      operationType: "ai.creative_design",
      sourceSnapshotId: snapshotId,
      promptId: "visual-plan",
      promptVersion: "v1",
      model: "mock-model-1",
      providerApproval: {
        approvalReference: jobId,
        providerId: "mock",
        model: "mock-model-1",
        estimatedCostUsd: 0.01,
        selectionReason: "explicit_job_request",
      },
      params: { draftId, draftRevision: options.draftRevision ?? 1 },
    },
    {
      jobId,
      projectId: options.projectId ?? projectId,
      ownerUserId: options.ownerUserId ?? ownerUserId,
      correlationId: createId(),
      idempotencyKey: options.idempotencyKey ?? "visual-plan:job:1",
      attempt: options.attempt ?? 1,
      heartbeat: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
    },
  );
}


async function usage(client: DatabaseClient) {
  return client
    .select({ status: usageRecords.status })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.projectId, projectId),
        eq(usageRecords.operationType, "ai.creative_design"),
      ),
    );
}

describeWithPostgres("creative-design.visual-plan job (ST-110, Postgres)", () => {
  let database: TestDatabase | undefined;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await seedDatabase(database!.client);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("applies only the grounded plan as the next draft revision and meters one call", async () => {
    const client = database!.client;
    const { handler, provider } = harness(client);
    const result = await run(handler);

    expect(result).toMatchObject({ visualPlan: "model", draftId, draftRevision: 2 });
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "VISUAL_PLAN_FIELD_DROPPED" }),
    ]);
    const draft = await readDraft(client);
    expect(draft.revision).toBe(2);
    expect(draft.manifestHash).toBe(creativeDesignHash(draft.manifest));
    expect(draft.manifest.plan).toEqual({
      source: "model",
      planVersion: "visual-plan-v1",
      modelCallId: result.modelCallId,
    });
    // Same identity and seed; the proposed treatment is the one art direction.
    expect(draft.manifest.pack.id).toBe("everyday");
    expect(draft.manifest.variationSeed).toBe(seed);
    expect(draft.manifest.artDirection.treatment).toBe("ink-sketch");
    const definition = draft.manifest.scenes[sceneA]!;
    expect(definition.display.headline).toBe("Water evaporates when heated");
    expect(definition.imagery.brief?.concept).toBe("warm puddle");
    // The ungrounded headline was dropped for the authored one (AC2).
    expect(draft.manifest.scenes[sceneB]!.display.headline).toBe(
      authoredDesign().scenes[sceneB]!.display.headline,
    );
    expect(validateCreativeDesignManifestV2(draft.manifest, sceneSpecs)).toEqual([]);

    // The planner saw approved scene content, never source text.
    const sent = provider.requests[0]!.messages.map((message) => message.content).join("\n");
    expect(sent).toContain("Water evaporates when heated");
    expect(sent).not.toContain("SOURCE-ONLY");
    expect(await usage(client)).toEqual([{ status: "succeeded" }]);
  });

  it("is idempotent: a redelivered job neither calls the provider nor writes again", async () => {
    const client = database!.client;
    const { handler, provider } = harness(client);
    const first = await run(handler);
    const again = await run(handler, { attempt: 2 });

    expect(again).toMatchObject({
      visualPlan: "model",
      alreadyApplied: true,
      draftRevision: 2,
      modelCallId: first.modelCallId,
    });
    expect(provider.requests).toHaveLength(1);
    expect((await readDraft(client)).revision).toBe(2);
    expect(await usage(client)).toHaveLength(1);
  });

  it.each([
    ["a provider failure", { fail: { code: "PROVIDER_BAD_REQUEST", retryable: false } }, "PROVIDER_BAD_REQUEST", 1],
    ["an unusable plan", { completion: (): string => JSON.stringify({ scenes: [{ sceneId: createId(), compositions: ["statement"] }] }) }, "MODEL_OUTPUT_DETERMINISTIC_FAILURE", 2],
    ["malformed output", { completion: (): string => "not json" }, "STRUCTURED_OUTPUT_INVALID", undefined],
  ] as const)(
    "keeps the valid authored design after %s, without user intervention (AC3)",
    async (_, options, reason, calls) => {
      const client = database!.client;
      const before = await readDraft(client);
      const { handler, provider } = harness(client, options);
      const result = await run(handler);

      expect(result).toEqual({
        visualPlan: "authored",
        fallbackReason: reason,
        draftId,
        draftRevision: 1,
        replanned: false,
      });
      if (calls !== undefined) expect(provider.requests).toHaveLength(calls);
      const after = await readDraft(client);
      expect(after.revision).toBe(1);
      expect(after.manifestHash).toBe(before.manifestHash);
      expect(after.manifest.plan.source).toBe("authored");
      // The failed call is still metered, once.
      expect(await usage(client)).toEqual([{ status: "failed" }]);
    },
  );

  it("falls back when the quota is exhausted, before any provider call (AC3)", async () => {
    const client = database!.client;
    const { handler, provider } = harness(client, {
      quota: new InMemoryQuotaGuard([{ operationType: "ai.creative_design", maxCalls: 0, windowMs: 3_600_000 }]),
    });
    await expect(run(handler)).resolves.toMatchObject({
      visualPlan: "authored",
      fallbackReason: "AI_QUOTA_EXCEEDED",
    });
    expect(provider.requests).toHaveLength(0);
    expect(await usage(client)).toEqual([]);
  });

  it("retries a retryable provider failure and falls back only on the final attempt", async () => {
    const client = database!.client;
    const { handler } = harness(client, {
      fail: { code: "PROVIDER_UNAVAILABLE", retryable: true },
    });
    await expect(run(handler, { attempt: 1 })).rejects.toMatchObject({
      classification: "retryable",
      code: "PROVIDER_UNAVAILABLE",
    });
    await expect(run(handler, { attempt: 3 })).resolves.toMatchObject({
      visualPlan: "authored",
      fallbackReason: "PROVIDER_UNAVAILABLE",
    });
  });

  it("re-plans an authored design when the kept draft no longer validates", async () => {
    const client = database!.client;
    const broken = authoredDesign();
    delete (broken.scenes as Record<string, unknown>)[sceneB];
    await client
      .update(creativeDesignDrafts)
      .set({ manifest: broken, manifestHash: creativeDesignHash(broken) })
      .where(eq(creativeDesignDrafts.id, draftId));
    const { handler } = harness(client, { fail: { code: "PROVIDER_BAD_REQUEST" } });

    await expect(run(handler)).resolves.toMatchObject({
      visualPlan: "authored",
      replanned: true,
      draftRevision: 2,
    });
    const draft = await readDraft(client);
    expect(draft.manifest.plan.source).toBe("authored");
    expect(Object.keys(draft.manifest.scenes).sort()).toEqual([sceneA, sceneB].sort());
    expect(validateCreativeDesignManifestV2(draft.manifest, sceneSpecs)).toEqual([]);
  });

  it("never overwrites a draft the teacher changed after the plan was queued", async () => {
    const client = database!.client;
    await client
      .update(creativeDesignDrafts)
      .set({ revision: 5 })
      .where(eq(creativeDesignDrafts.id, draftId));
    const { handler, provider } = harness(client);

    await expect(run(handler)).resolves.toEqual({
      visualPlan: "superseded",
      draftId,
      draftRevision: 5,
    });
    expect(provider.requests).toHaveLength(0);
    expect((await readDraft(client)).revision).toBe(5);
  });

  it("cannot read or write another tenant's draft", async () => {
    const client = database!.client;
    const before = await readDraft(client);
    const { handler, provider } = harness(client);

    await expect(
      run(handler, { ownerUserId: otherOwnerId, projectId: otherProjectId }),
    ).rejects.toMatchObject({ code: "VISUAL_PLAN_DRAFT_NOT_FOUND", classification: "terminal" });
    expect(provider.requests).toHaveLength(0);
    const after = await readDraft(client);
    expect(after.revision).toBe(before.revision);
    expect(after.manifestHash).toBe(before.manifestHash);
  });
});
