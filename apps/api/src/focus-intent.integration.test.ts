import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  auditEvents,
  jobs,
  learningObjectives,
  learningObjectiveSets,
  lessonConfigurations,
  migrateDatabase,
  modelCalls,
  outboxEvents,
  parsedDocuments,
  parsedSections,
  projects,
  sourceDocumentIngestionArtifacts,
  sourceDocuments,
  sourceSnapshots,
  usageRecords,
  users,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import {
  PostgresGenerationQuotaGuard,
  PostgresModelCallRepository,
} from "@avlp/observability";
import { DynamicMockLanguageModelProvider } from "@avlp/provider-adapters";
import { and, eq } from "drizzle-orm";
import type { SourceApprovalStatus } from "@avlp/schemas";
import { ProviderLessonIntentService } from "./lesson-intent.js";
import { PostgresObjectivesService } from "./objectives.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-0000000001a4";
const otherOwnerUserId: Identifier = "019ffbf1-bbbb-7000-8000-0000000001a4";
const projectId: Identifier = "019ffbf1-cccc-7000-8000-0000000001a4";
const otherProjectId: Identifier = "019ffbf1-cccc-7000-8000-0000000001a5";
const sourceDocumentId: Identifier = "019ffbf1-dddd-7000-8000-0000000001a4";
const artifactId: Identifier = "019ffbf1-eeee-7000-8000-0000000001a4";
const parsedDocumentId: Identifier = "019ffbf1-ffff-7000-8000-0000000001a4";
const snapshotId: Identifier = "019ffbf1-1111-7000-8000-0000000001a4";
const modelCallId: Identifier = "019ffbf1-2222-7000-8000-0000000001a4";
const configurationId: Identifier = "019ffbf1-3333-7000-8000-0000000001a4";
const correlationId: Identifier = "019ffbf1-5555-7000-8000-0000000001a4";
const contentHash = "b".repeat(64);
const bodyText = "Hidden body text: gusset plates are bolted at every node.";

const approvalStatus: SourceApprovalStatus = {
  approved: true,
  parsedDocumentVersion: 1,
  snapshotId,
  snapshotVersion: 1,
  contentHash,
  approvedAt: "2026-09-27T10:00:00.000Z",
  stale: false,
};

describeWithPostgres("ST-104 focus and lesson intent (Postgres)", () => {
  let database: TestDatabase | undefined;
  const now = () => new Date("2026-09-27T10:00:00.000Z");

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    const client = database!.client;
    await client.delete(outboxEvents);
    await client.delete(jobs);
    await client.delete(learningObjectives);
    await client.delete(learningObjectiveSets);
    await client.delete(usageRecords);
    await client.delete(modelCalls);
    await client.delete(lessonConfigurations);
    await client.delete(sourceSnapshots);
    await client.delete(parsedSections);
    await client.delete(parsedDocuments);
    await client.delete(sourceDocumentIngestionArtifacts);
    await client.delete(sourceDocuments);
    await client.delete(projects);
    await client.delete(users);
    await seed(client);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  function objectivesService(): PostgresObjectivesService {
    return new PostgresObjectivesService(
      database!.client,
      async () => approvalStatus,
      now,
    );
  }

  async function setFocus(focusPrompt: string | null): Promise<void> {
    await database!.client
      .update(lessonConfigurations)
      .set({ focusPrompt })
      .where(eq(lessonConfigurations.id, configurationId));
  }

  async function generate(requestKey: string) {
    const { jobId } = await objectivesService().generate({
      ownerUserId,
      projectId,
      idempotencyKey: requestKey,
      correlationId,
    });
    const [job] = await database!.client
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId));
    return job!;
  }

  it("ST-107: queues objectives/v4 with the confirmed brief coverage as a valid job payload", async () => {
    await setFocus("How do gusset plates transfer load?");
    const { jobId } = await objectivesService().generate({
      ownerUserId,
      projectId,
      idempotencyKey: "brief-request-1",
      correlationId,
      briefCoverage: ["How gusset plates spread load", "Why  joints   stay rigid"],
    });
    const [job] = await database!.client.select().from(jobs).where(eq(jobs.id, jobId));
    const payload = job!.payload as { promptVersion: string; params: Record<string, unknown> };
    expect(payload.promptVersion).toBe("v4");
    // Job params hold scalars only: one point per line, whitespace folded.
    expect(payload.params.briefCoverage).toBe(
      "How gusset plates spread load\nWhy joints stay rigid",
    );
    // Without a brief the wizard's v3 job is unchanged.
    const plain = await generate("plain-request-1");
    expect((plain.payload as { promptVersion: string }).promptVersion).toBe("v3");
    expect((plain.payload as { params: Record<string, unknown> }).params).not.toHaveProperty("briefCoverage");
  });

  it("carries the focus into the objectives params hash and idempotency key", async () => {
    const unfocused = await generate("request-1");
    const unfocusedParams = (unfocused.payload as { params: Record<string, unknown> })
      .params;
    expect(unfocusedParams).not.toHaveProperty("focusPrompt");
    expect((unfocused.payload as { promptVersion: string }).promptVersion).toBe("v3");

    await setFocus("How do gusset plates transfer load?");
    const focused = await generate("request-1");
    expect(
      (focused.payload as { params: Record<string, unknown> }).params.focusPrompt,
    ).toBe("How do gusset plates transfer load?");
    expect(focused.id).not.toBe(unfocused.id);
    expect(focused.inputVersion).not.toBe(unfocused.inputVersion);
    expect(focused.idempotencyKey).not.toBe(unfocused.idempotencyKey);

    // Same focus and request key: the existing job is reused, not re-billed.
    const repeated = await generate("request-1");
    expect(repeated.id).toBe(focused.id);

    await setFocus("How do welded joints fail?");
    const changed = await generate("request-1");
    expect(changed.id).not.toBe(focused.id);
    expect(changed.inputVersion).not.toBe(focused.inputVersion);

    // The focus is user content: it never reaches audit metadata.
    const audits = await database!.client
      .select({ metadata: auditEvents.metadata })
      .from(auditEvents)
      .where(eq(auditEvents.projectId, projectId));
    expect(JSON.stringify(audits)).not.toMatch(/gusset|welded/);
  });

  it("queues objectives under a prompt-to-video run's authorisation (ST-105)", async () => {
    const runId: Identifier = "019ffbf1-7777-7000-8000-0000000001a5";
    const { jobId } = await objectivesService().generate({
      ownerUserId,
      projectId,
      idempotencyKey: `oneshot:${runId}:objectives:r0`,
      correlationId,
      oneShotRunId: runId,
    });
    const [job] = await database!.client.select().from(jobs).where(eq(jobs.id, jobId));
    expect((job!.payload as { providerApproval: unknown }).providerApproval).toMatchObject({
      approvalReference: jobId,
      selectionReason: "one_shot_run",
      oneShotRunId: runId,
    });
    // The wizard's own request stays an explicit job request.
    const wizard = await generate("request-wizard");
    const approval = (wizard.payload as { providerApproval: Record<string, unknown> })
      .providerApproval;
    expect(approval.selectionReason).toBe("explicit_job_request");
    expect(approval).not.toHaveProperty("oneShotRunId");
  });

  it("attributes a run's automatic approval and generation to the run, never to the teacher (ST-105)", async () => {
    const runId: Identifier = "019ffbf1-7777-7000-8000-0000000001a6";
    const setId: Identifier = "019ffbf1-6666-7000-8000-0000000001a6";
    await seedSet(database!.client, setId, { status: "covered" });
    await database!.client.insert(learningObjectives).values({
      id: "019ffbf1-6666-7000-8000-0000000001a7",
      ownerUserId,
      projectId,
      setId,
      order: 1,
      statement: "Explain how gusset plates transfer load.",
      verb: "Explain",
      confidence: 0.9,
      sourceRefs: [],
    });
    await objectivesService().approve({
      ownerUserId,
      projectId,
      body: { expectedRevision: 0 },
      correlationId,
      oneShotRunId: runId,
    });
    await objectivesService().generate({
      ownerUserId,
      projectId,
      idempotencyKey: `oneshot:${runId}:objectives:r1`,
      correlationId,
      oneShotRunId: runId,
    });
    // This file does not clear audit events between tests, so look only at
    // what these two calls wrote.
    const events = (
      await database!.client
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.projectId, projectId))
    ).filter(
      (event) =>
        event.eventType === "objectives.approved" ||
        (event.metadata as { oneShotRunId?: string }).oneShotRunId === runId,
    );
    expect(events.map((event) => event.eventType).sort()).toEqual([
      "ai.generated",
      "objectives.approved",
    ]);
    for (const event of events) {
      expect(event.actorType).toBe("one_shot_run");
      expect(event.actorUserId).toBe(ownerUserId);
      expect(event.metadata).toMatchObject({ oneShotRunId: runId });
    }

    // The teacher's own request is still attributed to the teacher.
    const before = await database!.client
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.projectId, projectId));
    await generate("request-teacher");
    const [teacher] = (
      await database!.client
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.projectId, projectId), eq(auditEvents.eventType, "ai.generated")))
    ).filter((event) => !before.some((row) => row.id === event.id));
    expect(teacher).toMatchObject({ actorType: "user", actorUserId: ownerUserId });
    expect(teacher!.metadata).not.toHaveProperty("oneShotRunId");
  });

  it("surfaces a not_covered focus report on GET objectives, and none for pre-v3 sets", async () => {
    const setId: Identifier = "019ffbf1-6666-7000-8000-0000000001a4";
    await seedSet(database!.client, setId, {
      status: "not_covered",
      reason: "The approved source does not discuss photosynthesis.",
    });
    const response = await objectivesService().current({
      ownerUserId,
      projectId,
    });
    expect(response.set?.focusCoverage).toEqual({
      status: "not_covered",
      reason: "The approved source does not discuss photosynthesis.",
    });

    await database!.client
      .update(learningObjectiveSets)
      .set({ focusCoverage: null })
      .where(eq(learningObjectiveSets.id, setId));
    const legacy = await objectivesService().current({ ownerUserId, projectId });
    expect(legacy.set).not.toBeNull();
    expect(legacy.set).not.toHaveProperty("focusCoverage");
  });

  describe("LessonIntentService", () => {
    function intentService(maxCallsPerHour = 5) {
      const provider = new DynamicMockLanguageModelProvider({
        providerId: "together",
      });
      const service = new ProviderLessonIntentService({
        database: database!.client,
        provider,
        quotaGuard: new PostgresGenerationQuotaGuard(
          database!.client,
          { "ai.lesson-intent": { maxCallsPerHour } },
          now,
        ),
        now,
      });
      return { provider, service };
    }

    it("returns a subject and title, records the model call and usage, and never sends body text", async () => {
      const { provider, service } = intentService();
      const intent = await service.infer({
        ownerUserId,
        projectId,
        focusPrompt: "how trusses carry load?",
        idempotencyKey: "intent-1",
        correlationId,
      });
      expect(intent).toMatchObject({
        subject: "Bridge engineering",
        lessonTitle: "How trusses carry load",
      });

      const sent = provider.requests
        .flatMap((request) => request.messages.map((message) => message.content))
        .join("\n");
      expect(sent).toContain("Truss geometry");
      expect(sent).toContain("Joints and connections");
      expect(sent).not.toContain("gusset plates are bolted");

      const [call] = await database!.client
        .select()
        .from(modelCalls)
        .where(
          and(
            eq(modelCalls.projectId, projectId),
            eq(modelCalls.operationType, "ai.lesson-intent"),
          ),
        );
      expect(call).toMatchObject({
        id: intent.modelCallId,
        promptId: "lesson-intent",
        promptVersion: "v1",
        provider: "together",
        status: "succeeded",
      });
      const usage = await database!.client
        .select()
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.projectId, projectId),
            eq(usageRecords.operationType, "ai.lesson-intent"),
          ),
        );
      expect(usage).toHaveLength(1);
      expect(usage[0]).toMatchObject({ status: "succeeded", unit: "token" });
      expect(Number(usage[0]!.estimatedCostUsd)).toBeGreaterThan(0);

      const audits = await database!.client
        .select({ metadata: auditEvents.metadata })
        .from(auditEvents)
        .where(eq(auditEvents.projectId, projectId));
      expect(JSON.stringify(audits)).not.toContain("trusses carry load");
    });

    it("enforces the per-project quota before calling the provider", async () => {
      const { provider, service } = intentService(1);
      await service.infer({
        ownerUserId,
        projectId,
        focusPrompt: "Truss geometry",
        idempotencyKey: "intent-q1",
        correlationId,
      });
      await expect(
        service.infer({
          ownerUserId,
          projectId,
          focusPrompt: "Joints",
          idempotencyKey: "intent-q2",
          correlationId,
        }),
      ).rejects.toMatchObject({ code: "rate_limited", statusCode: 429 });
      expect(provider.requests).toHaveLength(1);
      expect(
        await database!.client
          .select()
          .from(usageRecords)
          .where(eq(usageRecords.operationType, "ai.lesson-intent")),
      ).toHaveLength(1);
    });

    it("refuses to re-bill a reused idempotency key", async () => {
      const { provider, service } = intentService();
      const input = {
        ownerUserId,
        projectId,
        focusPrompt: "Truss geometry",
        idempotencyKey: "intent-dup",
        correlationId,
      };
      await service.infer(input);
      await expect(service.infer(input)).rejects.toMatchObject({
        code: "edit_conflict",
        statusCode: 409,
      });
      expect(provider.requests).toHaveLength(1);
    });

    it("meters a provider call that lost a same-key race under its own records", async () => {
      const repository = new PostgresModelCallRepository(database!.client);
      let simulatedWinner = true;
      const provider = new DynamicMockLanguageModelProvider({
        providerId: "together",
      });
      const service = new ProviderLessonIntentService({
        database: database!.client,
        provider,
        quotaGuard: new PostgresGenerationQuotaGuard(
          database!.client,
          { "ai.lesson-intent": { maxCallsPerHour: 5 } },
          now,
        ),
        // The first insert behaves as if a concurrent request with the same
        // key had already recorded its call.
        modelCalls: {
          create: async (input) => {
            if (simulatedWinner) {
              simulatedWinner = false;
              await repository.create({
                ...input,
                record: {
                  ...input.record,
                  id: "019ffbf1-9999-7000-8000-0000000001a4",
                },
              });
            }
            return repository.create(input);
          },
        },
        now,
      });
      const intent = await service.infer({
        ownerUserId,
        projectId,
        focusPrompt: "Truss geometry",
        idempotencyKey: "intent-race",
        correlationId,
      });
      const calls = await database!.client
        .select()
        .from(modelCalls)
        .where(eq(modelCalls.operationType, "ai.lesson-intent"));
      expect(calls).toHaveLength(2);
      expect(calls.map((call) => call.id)).toContain(intent.modelCallId);
      const usage = await database!.client
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.operationType, "ai.lesson-intent"));
      expect(usage).toHaveLength(1);
      expect(usage[0]!.idempotencyKey).toContain(":concurrent:");
      expect(provider.requests).toHaveLength(1);
    });

    it("is tenant-scoped: another owner's project has no document for this user", async () => {
      const { provider, service } = intentService();
      await expect(
        service.infer({
          ownerUserId: otherOwnerUserId,
          projectId,
          focusPrompt: "Truss geometry",
          idempotencyKey: "intent-other",
          correlationId,
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
      await expect(
        service.infer({
          ownerUserId,
          projectId: otherProjectId,
          focusPrompt: "Truss geometry",
          idempotencyKey: "intent-other-2",
          correlationId,
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(provider.requests).toHaveLength(0);
    });

    it("rejects a blank focus before any provider call", async () => {
      const { provider, service } = intentService();
      await expect(
        service.infer({
          ownerUserId,
          projectId,
          focusPrompt: "   ",
          idempotencyKey: "intent-blank",
          correlationId,
        }),
      ).rejects.toMatchObject({ code: "validation_failed" });
      expect(provider.requests).toHaveLength(0);
    });
  });
});

async function seed(database: DatabaseClient): Promise<void> {
  const timestamp = new Date("2026-09-27T09:00:00.000Z");
  await database.insert(users).values([
    {
      id: ownerUserId,
      emailNormalized: "focus-owner@example.test",
      displayName: "Focus owner",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: otherOwnerUserId,
      emailNormalized: "focus-other@example.test",
      displayName: "Other owner",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  await database.insert(projects).values([
    {
      id: projectId,
      ownerUserId,
      title: "Truss bridges",
      stage: "lesson_configuration",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: otherProjectId,
      ownerUserId: otherOwnerUserId,
      title: "Other project",
      stage: "lesson_configuration",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  await database.insert(sourceDocuments).values({
    id: sourceDocumentId,
    ownerUserId,
    projectId,
    originalName: "bridges.pdf",
    mediaType: "application/pdf",
    sizeBytes: 1_000,
    sha256: "b".repeat(64),
    storageKey: "users/tenant/bridges.pdf",
    pageCount: 2,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(sourceDocumentIngestionArtifacts).values({
    id: artifactId,
    ownerUserId,
    projectId,
    sourceDocumentId,
    parserVersion: "docling-v1",
    normalizedSchemaVersion: "1.0",
    canonicalStorageKey: "users/tenant/bridges-canonical.json",
    state: "ready",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(parsedDocuments).values({
    id: parsedDocumentId,
    ownerUserId,
    projectId,
    ingestionArtifactId: artifactId,
    sourceDocumentId,
    version: 1,
    schemaVersion: "1.0",
    parserVersion: "docling-v1",
    adapterVersion: "1.0",
    normalizedStorageKey: "users/tenant/bridges-normalized.json",
    title: "Bridge engineering",
    language: "en",
    pageCount: 2,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(parsedSections).values([
    {
      id: "019ffbf1-7777-7000-8000-0000000001a4",
      parsedDocumentId,
      order: 1,
      level: 1,
      heading: "Truss geometry",
      pageStart: 1,
      pageEnd: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "019ffbf1-7777-7000-8000-0000000001a5",
      parsedDocumentId,
      order: 2,
      level: 1,
      heading: "Joints and connections",
      pageStart: 2,
      pageEnd: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  await database.insert(sourceSnapshots).values({
    id: snapshotId,
    ownerUserId,
    projectId,
    parsedDocumentId,
    parsedDocumentVersion: 1,
    snapshotVersion: 1,
    schemaVersion: "1.0",
    contentHash,
    approvedBy: ownerUserId,
    approvedAt: timestamp,
    // The snapshot exists so objectives can be requested; its body text must
    // never reach the lesson-intent call.
    payload: {
      schemaVersion: "1.0",
      id: snapshotId,
      projectId,
      sourceDocumentId,
      parsedDocumentId,
      parsedDocumentVersion: 1,
      contentHash,
      approvedBy: ownerUserId,
      approvedAt: timestamp.toISOString(),
      sections: [],
      blocks: [],
      figures: [],
      tables: [],
      note: bodyText,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(lessonConfigurations).values({
    id: configurationId,
    ownerUserId,
    projectId,
    version: 1,
    ageBand: "adult-professional",
    difficulty: "advanced",
    subject: "Structural engineering",
    lessonTitle: "Truss bridges",
    targetDurationSeconds: 180,
    tone: "academic",
    visualTheme: "mvp-default",
    includeRecallQuestions: false,
    sourceParsedDocumentVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(modelCalls).values({
    id: modelCallId,
    ownerUserId,
    projectId,
    operationType: "ai.objectives",
    idempotencyKey: "modelcall:objectives:focus-seed",
    promptId: "objectives",
    promptVersion: "v3",
    provider: "together",
    model: "mock-model-1",
    inputVersion: "objectives:input-focus",
    inputHash: "d".repeat(64),
    inputUnits: 100,
    outputUnits: 100,
    estimatedCostUsd: "0.001",
    latencyMs: 100,
    validationStatus: "valid",
    status: "succeeded",
    correlationId,
    // Outside the quota window of the lesson-intent tests.
    createdAt: new Date("2026-09-26T00:00:00.000Z"),
    updatedAt: timestamp,
  });
}

async function seedSet(
  database: DatabaseClient,
  setId: Identifier,
  focusCoverage: unknown,
): Promise<void> {
  const timestamp = new Date("2026-09-27T09:30:00.000Z");
  await database.insert(learningObjectiveSets).values({
    id: setId,
    ownerUserId,
    projectId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: contentHash,
    configurationVersion: 1,
    promptId: "objectives",
    promptVersion: "v3",
    model: "mock-model-1",
    modelCallId,
    status: "draft",
    revision: 0,
    idempotencyKey: `objectives:seed:${projectId}:focus`,
    keyConcepts: [],
    prerequisiteKnowledge: [],
    vocabulary: [],
    misconceptions: [],
    assessmentQuestions: [],
    focusCoverage,
    generatedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
