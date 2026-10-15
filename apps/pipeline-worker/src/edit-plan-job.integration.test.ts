/**
 * ST-115 (Postgres): a teacher message becomes a stored change plan through
 * the real `storyboard.edit-plan` job — one metered `ai.edit-plan` call,
 * validated and stored as a proposal. A replayed job never calls the
 * provider again, an invalid plan fails without a repair round (AC3), and a
 * storyboard that moved on is refused before any provider call.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createId, type Identifier } from "@avlp/config";
import {
  lessonEditMessages,
  lessonEditThreads,
  lessonSpecs,
  migrateDatabase,
  modelCalls,
  usageRecords,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import type { JobMetadata } from "@avlp/jobs";
import {
  InMemoryQuotaGuard,
  MockLanguageModelProvider,
  repositoryPrompts,
  StaticPromptRegistry,
} from "@avlp/provider-adapters";
import { editThreadPlanSchema, lessonStoryboardSchema } from "@avlp/schemas";
import { and, eq } from "drizzle-orm";
import {
  definitionScene,
  lessonSpecId,
  storyboardPayload,
  now,
  ownerUserId,
  projectId,
  sceneA,
  seedDatabase,
  snapshot,
  snapshotId,
} from "./cinema-lesson.fixture.js";
import { createEditPlanJobHandler } from "./edit-plan-job.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const threadId = "019ffbf1-1515-7000-8000-000000000115" as Identifier;
const teacherId = "019ffbf1-1516-7000-8000-000000000115" as Identifier;
const assistantId = "019ffbf1-1517-7000-8000-000000000115" as Identifier;
const request = "Shorten the title of this scene";

const validPlan = {
  schemaVersion: "edit-plan-v1",
  summary: "Shorten scene 1's title.",
  operations: [
    {
      type: "edit-scene-field",
      sceneId: sceneA,
      path: "title",
      value: "Vapour",
      rationale: "A one-word title is easier to read.",
    },
  ],
};

async function seedThread(client: DatabaseClient): Promise<void> {
  await client.delete(lessonEditMessages);
  await client.delete(lessonEditThreads);
  await seedDatabase(client);
  await client.insert(lessonEditThreads).values({
    id: threadId,
    projectId,
    ownerUserId,
    messageSequence: 2,
    createdAt: now,
    updatedAt: now,
  });
  const scope = { kind: "scene", sceneIds: [sceneA] };
  await client.insert(lessonEditMessages).values([
    {
      id: teacherId,
      projectId,
      ownerUserId,
      threadId,
      seq: 1,
      role: "teacher",
      replyToId: assistantId,
      text: request,
      scope,
      status: "sent",
      idempotencyKey: "edit-request-1",
      requestHash: "a".repeat(64),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: assistantId,
      projectId,
      ownerUserId,
      threadId,
      seq: 2,
      role: "assistant",
      replyToId: teacherId,
      scope,
      status: "planning",
      createdAt: now,
      updatedAt: now,
    },
  ]);
}

function harness(client: DatabaseClient, completion: unknown) {
  const provider = new MockLanguageModelProvider({
    completion: () => JSON.stringify(completion),
  });
  const complete = vi.spyOn(provider, "complete");
  const handler = createEditPlanJobHandler({
    database: client,
    provider,
    promptRegistry: new StaticPromptRegistry(repositoryPrompts),
    quotaGuard: new InMemoryQuotaGuard([
      { operationType: "ai.edit-plan", maxCalls: 20, windowMs: 3_600_000 },
    ]),
    now: () => now,
    modelCallOverrides: {
      sourceSnapshotLoader: async () => ({ status: "ok", snapshot }),
    },
  });
  return { handler, complete };
}

function run(
  handler: ReturnType<typeof createEditPlanJobHandler>,
  lessonSpecRevision = 0,
  attempt = 1,
): Promise<JobMetadata> {
  const jobId = "019ffbf1-1518-7000-8000-000000000115" as Identifier;
  return handler.handler(
    {
      schemaVersion: 2,
      operationType: "ai.edit-plan",
      sourceSnapshotId: snapshotId,
      promptId: "edit-plan",
      promptVersion: "v1",
      model: "mock-model-1",
      providerApproval: {
        approvalReference: jobId,
        providerId: "mock",
        model: "mock-model-1",
        estimatedCostUsd: 0.01,
        selectionReason: "explicit_job_request",
      },
      params: { threadId, messageId: assistantId, lessonSpecId, lessonSpecRevision },
    },
    {
      jobId,
      projectId,
      ownerUserId,
      correlationId: createId(),
      idempotencyKey: `edit-plan:${assistantId}`,
      attempt,
      heartbeat: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
    },
  );
}

async function assistant(client: DatabaseClient) {
  const [row] = await client
    .select()
    .from(lessonEditMessages)
    .where(
      and(
        eq(lessonEditMessages.id, assistantId),
        eq(lessonEditMessages.ownerUserId, ownerUserId),
      ),
    );
  return row!;
}

describeWithPostgres("ST-115 edit-plan job (Postgres)", () => {
  let database: TestDatabase | undefined;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await seedThread(database!.client);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("stores one metered call's plan as a proposal, then never re-plans a replay", async () => {
    const client = database!.client;
    const { handler, complete } = harness(client, validPlan);
    const result = await run(handler);
    expect(result).toMatchObject({ editPlan: "planned", messageId: assistantId });
    expect(complete).toHaveBeenCalledTimes(1);
    const [prompt] = complete.mock.calls[0]!;
    const sent = prompt.messages.map((message) => message.content).join("\n");
    expect(sent).toContain(request);
    // The planner never sees narration or source text.
    expect(sent).not.toContain(definitionScene.narration);

    const message = await assistant(client);
    expect(message.status).toBe("proposed");
    const plan = editThreadPlanSchema.parse(message.plan);
    expect(plan.expectedRevision).toBe(0);
    expect(plan.operations[0]).toMatchObject({
      id: "op-1",
      display: { sceneOrder: 1, fieldLabel: "Title", before: "Evaporation" },
    });
    expect(message.modelCallId).toBe(plan.modelCallId);

    const calls = await client
      .select()
      .from(modelCalls)
      .where(and(eq(modelCalls.ownerUserId, ownerUserId), eq(modelCalls.operationType, "ai.edit-plan")));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ promptId: "edit-plan", promptVersion: "v1" });
    const usage = await client
      .select()
      .from(usageRecords)
      .where(and(eq(usageRecords.ownerUserId, ownerUserId), eq(usageRecords.operationType, "ai.edit-plan")));
    expect(usage).toHaveLength(1);

    // A redelivered job finds the message planned and makes no second call.
    await expect(run(handler)).resolves.toMatchObject({ editPlan: "already_resolved" });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("trims a response over the plan limits in code, with one provider call (AC2)", async () => {
    const client = database!.client;
    // A ten-scene storyboard; the model edits every scene.
    const base = storyboardPayload();
    const ids = Array.from(
      { length: 10 },
      (_, index) => `019ffbf1-7779-7000-8000-${String(index + 1).padStart(12, "0")}`,
    );
    const template = base.scenes[0]!;
    const storyboard = lessonStoryboardSchema.parse({
      ...base,
      totalDurationSeconds: 300,
      scenes: ids.map((id, index) => ({
        ...template,
        id,
        stableSceneId: id,
        order: index + 1,
        scene: { ...template.scene, id, order: index + 1 },
      })),
    });
    await client
      .update(lessonSpecs)
      .set({ payload: storyboard, totalDurationSeconds: 300 })
      .where(and(eq(lessonSpecs.id, lessonSpecId), eq(lessonSpecs.ownerUserId, ownerUserId)));
    await client
      .update(lessonEditMessages)
      .set({ scope: { kind: "lesson", sceneIds: [] } })
      .where(eq(lessonEditMessages.threadId, threadId));
    const { handler, complete } = harness(client, {
      ...validPlan,
      operations: ids.map((sceneId) => ({ ...validPlan.operations[0], sceneId })),
    });
    await expect(run(handler)).resolves.toMatchObject({ editPlan: "planned" });
    expect(complete).toHaveBeenCalledTimes(1);
    const plan = editThreadPlanSchema.parse((await assistant(client)).plan);
    expect(plan.operations).toHaveLength(8);
    expect(plan.remainingSceneIds).toEqual(ids.slice(8));
  });

  it("makes exactly one provider call when the response is not valid JSON", async () => {
    const client = database!.client;
    const provider = new MockLanguageModelProvider({ completion: () => "not json" });
    const complete = vi.spyOn(provider, "complete");
    const handler = createEditPlanJobHandler({
      database: client,
      provider,
      promptRegistry: new StaticPromptRegistry(repositoryPrompts),
      quotaGuard: new InMemoryQuotaGuard([
        { operationType: "ai.edit-plan", maxCalls: 20, windowMs: 3_600_000 },
      ]),
      now: () => now,
      modelCallOverrides: { sourceSnapshotLoader: async () => ({ status: "ok", snapshot }) },
    });
    await expect(run(handler)).rejects.toMatchObject({ code: "STRUCTURED_OUTPUT_INVALID" });
    expect(complete).toHaveBeenCalledTimes(1);
    expect((await assistant(client)).status).toBe("failed");
  });

  it("fails a plan that does not fit the storyboard without a repair round (AC3)", async () => {
    const client = database!.client;
    const { handler, complete } = harness(client, {
      ...validPlan,
      operations: [{ ...validPlan.operations[0], path: "visual.position.x", value: "40" }],
    });
    const failure = await run(handler).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "MODEL_OUTPUT_DETERMINISTIC_FAILURE" });
    // The stored job error names the rule, never the model's text.
    const details = JSON.stringify((failure as { details?: unknown }).details);
    expect(details).toContain("EDIT_PLAN_INVALID");
    expect(details).not.toContain("visual.position");
    expect(complete).toHaveBeenCalledTimes(1);
    const message = await assistant(client);
    expect(message.status).toBe("failed");
    expect(message.errorCode).toBe("MODEL_OUTPUT_DETERMINISTIC_FAILURE");
    expect(message.plan).toBeNull();
  });

  it("refuses a storyboard that changed after the request, before any provider call", async () => {
    const client = database!.client;
    await client
      .update(lessonSpecs)
      .set({ revision: 1 })
      .where(and(eq(lessonSpecs.id, lessonSpecId), eq(lessonSpecs.ownerUserId, ownerUserId)));
    const { handler, complete } = harness(client, validPlan);
    await expect(run(handler, 0)).rejects.toMatchObject({ code: "EDIT_PLAN_STALE" });
    expect(complete).not.toHaveBeenCalled();
    expect((await assistant(client)).status).toBe("failed");
  });

  it("leaves a retryable failure planning until the last attempt", async () => {
    const client = database!.client;
    const provider = new MockLanguageModelProvider({ completion: () => JSON.stringify(validPlan) });
    vi.spyOn(provider, "complete").mockRejectedValue(new Error("socket hang up"));
    const handler = createEditPlanJobHandler({
      database: client,
      provider,
      promptRegistry: new StaticPromptRegistry(repositoryPrompts),
      quotaGuard: new InMemoryQuotaGuard([
        { operationType: "ai.edit-plan", maxCalls: 20, windowMs: 3_600_000 },
      ]),
      now: () => now,
      modelCallOverrides: { sourceSnapshotLoader: async () => ({ status: "ok", snapshot }) },
    });
    await expect(run(handler, 0, 1)).rejects.toThrow();
    expect((await assistant(client)).status).toBe("planning");
    await expect(run(handler, 0, 3)).rejects.toThrow();
    expect((await assistant(client)).status).toBe("failed");
  });
});
