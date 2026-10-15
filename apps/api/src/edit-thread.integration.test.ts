/**
 * ST-115 (Postgres): conversational editing end to end at the service level.
 * A message queues one planning job; the plan (written here exactly as the
 * `storyboard.edit-plan` job stores it — that job has its own integration
 * test in the pipeline worker) is applied only through the existing
 * storyboard services, generated changes go through the before/after
 * candidate review, stale plans are refused with a re-plan action, and undo
 * restores the exact pre-turn storyboard only while nothing changed since.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createId, PublicError, type Identifier } from "@avlp/config";
import {
  auditEvents,
  jobs,
  lessonEditMessages,
  lessonEditThreads,
  lessonSpecs,
  migrateDatabase,
  outboxEvents,
  sceneCandidates,
  scenes,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import {
  editThreadPlanSchema,
  lessonStoryboardSchema,
  type EditPlanOperation,
  type EditThreadResponse,
  type EditThreadScope,
} from "@avlp/schemas";
import { and, eq } from "drizzle-orm";
import {
  definitionScene,
  lessonSpecId,
  modelCallId,
  now,
  ownerUserId,
  processScene,
  projectId,
  sceneA,
  sceneB,
  scope,
  seed,
  snapshotId,
  storyboardPayload,
} from "./cinema-lesson.fixture.js";
import { PostgresEditThreadService } from "./edit-thread.js";
import { PostgresStoryboardService } from "./storyboard.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const otherScope = {
  ownerUserId: "019ffbf1-aaab-7000-8000-000000000108" as Identifier,
  projectId,
};
const correlationId = "019ffbf1-0000-7000-8000-000000000115" as Identifier;
const rationale = "Keeps the lesson clear.";

async function reset(client: DatabaseClient): Promise<void> {
  for (const table of [lessonEditMessages, lessonEditThreads, sceneCandidates, auditEvents])
    await client.delete(table);
  await seed(client);
  await client.insert(scenes).values(
    [definitionScene, processScene].map((scene) => ({
      id: scene.id,
      projectId,
      ownerUserId,
      lessonSpecId,
      stableSceneId: scene.id,
      order: scene.order,
      template: scene.template,
      durationSeconds: scene.durationSeconds,
      narrationBlockIds: [],
      assetRequirements: [],
      sceneJson: scene,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

async function storyboardRow(client: DatabaseClient) {
  const [row] = await client
    .select()
    .from(lessonSpecs)
    .where(and(eq(lessonSpecs.id, lessonSpecId), eq(lessonSpecs.ownerUserId, ownerUserId)));
  return { revision: row!.revision, storyboard: lessonStoryboardSchema.parse(row!.payload) };
}

describeWithPostgres("ST-115 conversational editing (Postgres)", () => {
  let database: TestDatabase | undefined;
  let storyboard: PostgresStoryboardService;
  let service: PostgresEditThreadService;
  const regenerateBlock = vi.fn();

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await reset(database!.client);
    storyboard = new PostgresStoryboardService(
      database!.client,
      async () => ({
        approved: true,
        parsedDocumentVersion: 1,
        snapshotId,
        snapshotVersion: 1,
        contentHash: "b".repeat(64),
        approvedAt: now.toISOString(),
        stale: false,
      }),
      undefined,
      () => now,
    );
    service = new PostgresEditThreadService({
      database: database!.client,
      storyboard,
      narration: { regenerateBlock },
      maxTurnsPerHour: 4,
      now: () => now,
    });
  });

  afterAll(async () => {
    await database?.destroy();
  });

  /** Sends a request, then stores its plan as the planning job does. */
  async function planTurn(
    text: string,
    turnScope: EditThreadScope,
    operations: EditPlanOperation[],
    key = createId(),
  ): Promise<{ planId: Identifier; thread: EditThreadResponse }> {
    const { revision } = await storyboardRow(database!.client);
    const posted = await service.postMessage({
      ...scope,
      body: { text, scope: turnScope, expectedRevision: revision },
      idempotencyKey: key,
      correlationId,
    });
    const pending = posted.messages.at(-1)!;
    expect(pending).toMatchObject({ role: "assistant", status: "planning" });
    const plan = editThreadPlanSchema.parse({
      schemaVersion: "edit-plan-v1",
      summary: "Planned.",
      remainingSceneIds: [],
      expectedRevision: revision,
      narrationSetRevision: null,
      modelCallId,
      operations: operations.map((operation, index) => ({
        id: `op-${index + 1}`,
        operation,
        display: { sceneOrder: null, fieldLabel: null, before: null },
      })),
    });
    await database!.client
      .update(lessonEditMessages)
      .set({
        plan,
        status: "proposed",
        modelCallId,
        operationStates: plan.operations.map(({ id }) => ({
          operationId: id,
          state: "proposed",
          jobId: null,
          candidateId: null,
          errorCode: null,
        })),
      })
      .where(eq(lessonEditMessages.id, pending.id));
    return { planId: pending.id as Identifier, thread: await service.list(scope) };
  }

  it("queues one planning job per message; never logs the message (AC8)", async () => {
    const text = "Make scene 2 simpler for my class";
    const posted = await service.postMessage({
      ...scope,
      body: { text, scope: { kind: "scene", sceneIds: [sceneB] }, expectedRevision: 0 },
      idempotencyKey: "request-1",
      correlationId,
    });
    expect(posted.messages.map((message) => [message.role, message.status])).toEqual([
      ["teacher", "sent"],
      ["assistant", "planning"],
    ]);
    expect(posted.turnLimit).toEqual({ limit: 4, used: 1, remaining: 3 });
    const queued = await database!.client
      .select()
      .from(jobs)
      .where(and(eq(jobs.ownerUserId, ownerUserId), eq(jobs.jobType, "storyboard.edit-plan")));
    expect(queued).toHaveLength(1);
    expect(JSON.stringify(queued[0]!.payload)).not.toContain(text);
    expect(queued[0]!.payload).toMatchObject({
      operationType: "ai.edit-plan",
      promptId: "edit-plan",
      promptVersion: "v1",
    });
    const outbox = await database!.client
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.jobId, queued[0]!.id));
    expect(outbox).toHaveLength(1);
    const audits = await database!.client
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.ownerUserId, ownerUserId), eq(auditEvents.eventType, "edit_thread.message_posted")));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.metadata).toMatchObject({ messageLength: text.length, scope: "scene", sceneCount: 1 });
    expect(JSON.stringify(audits[0]!.metadata)).not.toContain("simpler");
  });

  it("replays a message idempotently and refuses the key for a different request", async () => {
    const body = { text: "Shorter titles", scope: { kind: "lesson", sceneIds: [] }, expectedRevision: 0 };
    await service.postMessage({ ...scope, body, idempotencyKey: "same-key", correlationId });
    const replay = await service.postMessage({ ...scope, body, idempotencyKey: "same-key", correlationId });
    expect(replay.messages).toHaveLength(2);
    const planned = await database!.client
      .select()
      .from(jobs)
      .where(and(eq(jobs.ownerUserId, ownerUserId), eq(jobs.jobType, "storyboard.edit-plan")));
    expect(planned).toHaveLength(1);
    const reused = await service
      .postMessage({ ...scope, body: { ...body, text: "Something else" }, idempotencyKey: "same-key", correlationId })
      .catch((error: unknown) => error);
    expect(reused).toBeInstanceOf(PublicError);
    expect((reused as PublicError).statusCode).toBe(409);
  });

  it("plans a request once when the same delivery arrives twice concurrently", async () => {
    const body = { text: "Shorter titles", scope: { kind: "lesson", sceneIds: [] }, expectedRevision: 0 };
    const [first, second] = await Promise.all([
      service.postMessage({ ...scope, body, idempotencyKey: "concurrent-key", correlationId }),
      service.postMessage({ ...scope, body, idempotencyKey: "concurrent-key", correlationId }),
    ]);
    expect(first.messages).toHaveLength(2);
    expect(second.messages).toHaveLength(2);
    const planned = await database!.client
      .select()
      .from(jobs)
      .where(and(eq(jobs.ownerUserId, ownerUserId), eq(jobs.jobType, "storyboard.edit-plan")));
    expect(planned).toHaveLength(1);
  });

  it("enforces the per-thread turn limit", async () => {
    for (let turn = 0; turn < 4; turn += 1)
      await service.postMessage({
        ...scope,
        body: { text: `Request ${turn}`, scope: { kind: "lesson", sceneIds: [] }, expectedRevision: 0 },
        idempotencyKey: `turn-${turn}`,
        correlationId,
      });
    const limited = await service
      .postMessage({
        ...scope,
        body: { text: "One more", scope: { kind: "lesson", sceneIds: [] }, expectedRevision: 0 },
        idempotencyKey: "turn-5",
        correlationId,
      })
      .catch((error: unknown) => error);
    expect((limited as PublicError).code).toBe("rate_limited");
    expect((limited as PublicError).statusCode).toBe(429);
  });

  it("applies a regeneration through the existing candidate review; rejecting leaves the storyboard unchanged (AC1)", async () => {
    const { planId } = await planTurn("Make scene 2 simpler", { kind: "scene", sceneIds: [sceneB] }, [
      { type: "regenerate-scene", sceneId: sceneB, mode: "simplify", instruction: "Use shorter words.", rationale },
    ]);
    const applied = await service.applyPlan({ ...scope, planId, body: { expectedRevision: 0 }, correlationId });
    const message = applied.messages.find((entry) => entry.id === planId)!;
    expect(message.status).toBe("applied");
    expect(message.operations[0]).toMatchObject({ operationId: "op-1", state: "queued" });
    const regenerationJobId = message.operations[0]!.jobId!;
    const [regeneration] = await database!.client.select().from(jobs).where(eq(jobs.id, regenerationJobId));
    expect(regeneration).toMatchObject({ jobType: "storyboard.scene-regenerate" });
    expect(regeneration!.payload).toMatchObject({ params: { mode: "simplify", instruction: "Use shorter words." } });
    // Nothing generated is applied by the plan itself.
    expect((await storyboardRow(database!.client)).revision).toBe(0);
    expect(message.canUndo).toBe(false);

    // The scene-regeneration job produces its candidate as usual.
    const candidateId = createId(now);
    const before = storyboardPayload().scenes[1]!;
    await database!.client.insert(sceneCandidates).values({
      id: candidateId,
      projectId,
      ownerUserId,
      lessonSpecId,
      sceneId: sceneB,
      mode: "simplify",
      beforeScene: before,
      afterScene: { ...before, scene: { ...before.scene, title: "Water rises" } },
      status: "pending",
      sceneRevision: 0,
      modelCallId,
      idempotencyKey: `regen:${regenerationJobId}`,
      createdAt: now,
      updatedAt: now,
    });
    await database!.client
      .update(jobs)
      .set({ state: "succeeded", resultMetadata: { candidateId } })
      .where(eq(jobs.id, regenerationJobId));
    const ready = (await service.list(scope)).messages.find((entry) => entry.id === planId)!;
    expect(ready.operations[0]).toMatchObject({ state: "ready", candidateId });

    await storyboard.rejectSceneCandidate({
      ...scope,
      sceneId: sceneB,
      candidateId,
      body: { expectedRevision: 0, expectedSceneRevision: 0 },
      correlationId,
    });
    const after = await storyboardRow(database!.client);
    expect(after.revision).toBe(0);
    expect(after.storyboard.scenes).toEqual(storyboardPayload().scenes);

    // Accepting a candidate from the same review applies it as usual.
    const acceptedId = createId(now);
    await database!.client.insert(sceneCandidates).values({
      id: acceptedId,
      projectId,
      ownerUserId,
      lessonSpecId,
      sceneId: sceneB,
      mode: "simplify",
      beforeScene: before,
      afterScene: { ...before, scene: { ...before.scene, title: "Water rises" } },
      status: "pending",
      sceneRevision: 0,
      modelCallId,
      idempotencyKey: `regen:${regenerationJobId}:second`,
      createdAt: now,
      updatedAt: now,
    });
    await storyboard.applySceneCandidate({
      ...scope,
      sceneId: sceneB,
      candidateId: acceptedId,
      body: { expectedRevision: 0, expectedSceneRevision: 0 },
      correlationId,
    });
    const accepted = await storyboardRow(database!.client);
    expect(accepted.revision).toBe(1);
    expect(accepted.storyboard.scenes[1]!.scene.title).toBe("Water rises");
  });

  it("applies field edits and a reorder, then undo restores the exact pre-turn storyboard (AC6)", async () => {
    const original = await storyboardRow(database!.client);
    const { planId } = await planTurn("Tidy the titles and swap the scenes", { kind: "lesson", sceneIds: [] }, [
      { type: "edit-scene-field", sceneId: sceneA, path: "title", value: "Vapour", rationale },
      { type: "edit-scene-field", sceneId: sceneA, path: "onScreenText", value: ["Heat makes vapour"], rationale },
      { type: "edit-scene-field", sceneId: sceneB, path: "transition", value: "slide", rationale },
      { type: "reorder-scenes", sceneIds: [sceneB, sceneA], rationale },
    ]);
    const applied = await service.applyPlan({ ...scope, planId, body: { expectedRevision: 0 }, correlationId });
    const message = applied.messages.find((entry) => entry.id === planId)!;
    expect(message.status).toBe("applied");
    expect(message.appliedOperationIds).toEqual(["op-1", "op-2", "op-3", "op-4"]);
    // One ST-056 edit per scene, then the reorder.
    expect(message).toMatchObject({ beforeRevision: 0, afterRevision: 3, canUndo: true });
    const changed = await storyboardRow(database!.client);
    expect(changed.storyboard.scenes.map((scene) => scene.stableSceneId)).toEqual([sceneB, sceneA]);
    expect(changed.storyboard.scenes[1]!.scene).toMatchObject({ title: "Vapour", onScreenText: ["Heat makes vapour"] });

    // A replayed apply is a no-op.
    await service.applyPlan({ ...scope, planId, body: { expectedRevision: 3 }, correlationId });
    expect((await storyboardRow(database!.client)).revision).toBe(3);

    const undone = await service.undoPlan({ ...scope, planId, body: { expectedRevision: 3 }, correlationId });
    expect(undone.messages.find((entry) => entry.id === planId)).toMatchObject({ status: "undone", canUndo: false });
    const restored = await storyboardRow(database!.client);
    expect(restored.revision).toBe(4);
    expect(restored.storyboard.scenes).toEqual(original.storyboard.scenes);
    expect(restored.storyboard.totalDurationSeconds).toBe(original.storyboard.totalDurationSeconds);
    const sceneRows = await database!.client
      .select({ id: scenes.id, order: scenes.order, sceneJson: scenes.sceneJson })
      .from(scenes)
      .where(and(eq(scenes.lessonSpecId, lessonSpecId), eq(scenes.ownerUserId, ownerUserId)));
    expect(
      sceneRows.sort((left, right) => left.order - right.order).map((row) => row.sceneJson),
    ).toEqual(original.storyboard.scenes.map((scene) => scene.scene));
  });

  it("refuses undo after any later edit", async () => {
    const { planId } = await planTurn("Rename scene 1", { kind: "scene", sceneIds: [sceneA] }, [
      { type: "edit-scene-field", sceneId: sceneA, path: "title", value: "Vapour", rationale },
    ]);
    await service.applyPlan({ ...scope, planId, body: { expectedRevision: 0 }, correlationId });
    const { storyboard: current } = await storyboardRow(database!.client);
    await storyboard.updateScene({
      ...scope,
      sceneId: sceneB,
      body: { expectedRevision: 1, scene: { ...current.scenes[1]!.scene, title: "Edited elsewhere" } },
      correlationId,
    });
    expect((await service.list(scope)).messages.find((entry) => entry.id === planId)?.canUndo).toBe(false);
    const refused = await service
      .undoPlan({ ...scope, planId, body: { expectedRevision: 2 }, correlationId })
      .catch((error: unknown) => error);
    expect((refused as PublicError).statusCode).toBe(409);
    expect((await storyboardRow(database!.client)).revision).toBe(2);
  });

  it("refuses a stale plan with a re-plan action and runs nothing (AC5)", async () => {
    const { planId } = await planTurn("Simplify scene 1", { kind: "scene", sceneIds: [sceneA] }, [
      { type: "regenerate-scene", sceneId: sceneA, mode: "simplify", rationale },
      { type: "edit-scene-field", sceneId: sceneB, path: "transition", value: "slide", rationale },
    ]);
    const { storyboard: current } = await storyboardRow(database!.client);
    await storyboard.updateScene({
      ...scope,
      sceneId: sceneB,
      body: { expectedRevision: 0, scene: { ...current.scenes[1]!.scene, title: "Edited elsewhere" } },
      correlationId,
    });
    const stale = await service
      .applyPlan({ ...scope, planId, body: { expectedRevision: 1 }, correlationId })
      .catch((error: unknown) => error);
    expect(stale).toBeInstanceOf(PublicError);
    expect((stale as PublicError).statusCode).toBe(409);
    expect((stale as PublicError).details).toEqual({ action: "re-plan", currentRevision: 1 });
    expect((await storyboardRow(database!.client)).revision).toBe(1);
    const regenerations = await database!.client
      .select()
      .from(jobs)
      .where(and(eq(jobs.ownerUserId, ownerUserId), eq(jobs.jobType, "storyboard.scene-regenerate")));
    expect(regenerations).toHaveLength(0);
    expect((await service.list(scope)).messages.find((entry) => entry.id === planId)?.status).toBe("proposed");
  });

  it("rejects an invalid plan server-side without a partial apply (AC3)", async () => {
    const { planId } = await planTurn("Move the title", { kind: "scene", sceneIds: [sceneA] }, [
      { type: "edit-scene-field", sceneId: sceneA, path: "title", value: "Fine", rationale },
      { type: "edit-scene-field", sceneId: sceneA, path: "visual.term", value: "x".repeat(200), rationale },
    ]);
    const refused = await service
      .applyPlan({ ...scope, planId, body: { expectedRevision: 0 }, correlationId })
      .catch((error: unknown) => error);
    expect((refused as PublicError).message).toMatch(/couldn't plan that change/u);
    expect((await storyboardRow(database!.client)).revision).toBe(0);
    expect((await service.list(scope)).messages.find((entry) => entry.id === planId)?.status).toBe("proposed");
  });

  it("reloads the full thread with applied, partly applied, dismissed and undone plans (AC7)", async () => {
    const partial = await planTurn("Two changes", { kind: "lesson", sceneIds: [] }, [
      { type: "edit-scene-field", sceneId: sceneA, path: "title", value: "Vapour", rationale },
      { type: "edit-scene-field", sceneId: sceneB, path: "transition", value: "slide", rationale },
    ]);
    await service.applyPlan({
      ...scope,
      planId: partial.planId,
      body: { expectedRevision: 0, operationIds: ["op-2"] },
      correlationId,
    });
    const dismissed = await planTurn("A change I don't want", { kind: "scene", sceneIds: [sceneA] }, [
      { type: "regenerate-scene", sceneId: sceneA, mode: "regenerate", rationale },
    ]);
    await service.dismissPlan({ ...scope, planId: dismissed.planId, body: {}, correlationId });
    const undone = await planTurn("Rename", { kind: "scene", sceneIds: [sceneA] }, [
      { type: "edit-scene-field", sceneId: sceneA, path: "title", value: "Steam", rationale },
    ]);
    await service.applyPlan({ ...scope, planId: undone.planId, body: { expectedRevision: 1 }, correlationId });
    await service.undoPlan({ ...scope, planId: undone.planId, body: { expectedRevision: 2 }, correlationId });

    const reloaded = await service.list(scope);
    expect(
      reloaded.messages.filter((message) => message.role === "assistant").map((message) => message.status),
    ).toEqual(["partly_applied", "dismissed", "undone"]);
    expect(reloaded.messages.filter((message) => message.role === "teacher").map((message) => message.text)).toEqual([
      "Two changes",
      "A change I don't want",
      "Rename",
    ]);
    const partlyApplied = reloaded.messages.find((message) => message.id === partial.planId)!;
    expect(partlyApplied.appliedOperationIds).toEqual(["op-2"]);
    expect(partlyApplied.operations.map((state) => state.state)).toEqual(["skipped", "applied"]);
  });

  it("pages a long thread by whole turns and keeps undo eligibility thread-wide (AC7)", async () => {
    const client = database!.client;
    const threadId = createId(now);
    await client.insert(lessonEditThreads).values({
      id: threadId,
      projectId,
      ownerUserId,
      messageSequence: 130,
      createdAt: now,
      updatedAt: now,
    });
    const turnScope = { kind: "lesson", sceneIds: [] };
    const undoable = createId(now);
    await client.insert(lessonEditMessages).values(
      Array.from({ length: 65 }, (_, turn) => [
        {
          id: createId(now),
          projectId,
          ownerUserId,
          threadId,
          seq: turn * 2 + 1,
          role: "teacher" as const,
          text: `Request ${turn + 1}`,
          scope: turnScope,
          status: "sent" as const,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: turn === 5 ? undoable : createId(now),
          projectId,
          ownerUserId,
          threadId,
          seq: turn * 2 + 2,
          role: "assistant" as const,
          scope: turnScope,
          // Turn 6 is the only applied turn, far outside the latest page.
          status: turn === 5 ? ("applied" as const) : ("dismissed" as const),
          ...(turn === 5
            ? {
                beforeRevision: 0,
                afterRevision: 1,
                undoSnapshot: { revision: 0, sceneOrder: [sceneA, sceneB], scenes: [] },
              }
            : {}),
          createdAt: now,
          updatedAt: now,
        },
      ]).flat(),
    );
    await client
      .update(lessonSpecs)
      .set({ revision: 1 })
      .where(and(eq(lessonSpecs.id, lessonSpecId), eq(lessonSpecs.ownerUserId, ownerUserId)));

    const latest = await service.list(scope);
    expect(latest.messages).toHaveLength(100);
    expect(latest.messages[0]).toMatchObject({ seq: 31, role: "teacher", text: "Request 16" });
    expect(latest.messages.at(-1)).toMatchObject({ seq: 130, role: "assistant" });
    expect(latest.earlierCursor).toBe(31);

    const earlier = await service.list({ ...scope, before: String(latest.earlierCursor) });
    expect(earlier.messages.map((message) => message.seq)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1),
    );
    expect(earlier.earlierCursor).toBeNull();
    expect(earlier.messages.find((message) => message.id === undoable)?.canUndo).toBe(true);

    const invalid = await service.list({ ...scope, before: "soon" }).catch((error: unknown) => error);
    expect((invalid as PublicError).statusCode).toBe(400);
  });

  it("never shows or changes another tenant's thread (AC9)", async () => {
    const { planId } = await planTurn("Rename scene 1", { kind: "scene", sceneIds: [sceneA] }, [
      { type: "edit-scene-field", sceneId: sceneA, path: "title", value: "Vapour", rationale },
    ]);
    const foreign = await service.list(otherScope);
    expect(foreign).toMatchObject({ threadId: null, messages: [] });
    for (const action of [
      () => service.applyPlan({ ...otherScope, planId, body: { expectedRevision: 0 }, correlationId }),
      () => service.dismissPlan({ ...otherScope, planId, body: {}, correlationId }),
      () => service.undoPlan({ ...otherScope, planId, body: { expectedRevision: 0 }, correlationId }),
    ]) {
      const error = await action().catch((caught: unknown) => caught);
      expect((error as PublicError).statusCode).toBe(404);
    }
    expect((await storyboardRow(database!.client)).revision).toBe(0);
  });
});
