import { describe, expect, it, vi } from "vitest";
import { createId } from "@avlp/config";
import {
  createJobEnvelope,
  JobExecutionError,
  type JobMetadata,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import {
  InMemoryQuotaGuard,
  jsonCompletion,
  MockLanguageModelProvider,
  StaticPromptRegistry,
  sequenceCompletion,
  type LanguageModelProvider,
} from "@avlp/provider-adapters";
import {
  modelCallRecordSchema,
  sourceSnapshotSchema,
  type ModelCallRecord,
  type SourceSnapshot,
} from "@avlp/schemas";
import { z } from "zod";
import {
  createModelCallGenerationHandler,
  loadApprovedSourceSnapshot,
  type ModelCallHandlerOptions,
  type ModelCallRepository,
} from "./model-call.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const sectionId = "019ffbf1-1111-7000-8000-000000000001";
const blockId = "019ffbf1-2222-7000-8000-000000000001";

function sampleSnapshot(): SourceSnapshot {
  return sourceSnapshotSchema.parse({
    schemaVersion: "1.0",
    id: snapshotId,
    projectId,
    sourceDocumentId: "019ffbf1-4444-7000-8000-000000000001",
    parsedDocumentId: "019ffbf1-3333-7000-8000-000000000001",
    parsedDocumentVersion: 1,
    contentHash: "a".repeat(64),
    approvedBy: ownerUserId,
    approvedAt: "2026-08-16T10:00:00.000Z",
    sections: [
      {
        sectionId,
        order: 1,
        level: 1,
        heading: "Water cycle",
        pageStart: 1,
        pageEnd: 1,
        reviewOrder: null,
        blockIds: [blockId],
        figureIds: [],
        tableIds: [],
      },
    ],
    blocks: [
      {
        blockId,
        sectionId,
        kind: "paragraph",
        order: 1,
        pageStart: 1,
        pageEnd: 1,
        text: "Water evaporates when heated.",
        corrected: false,
        revision: 0,
      },
    ],
    figures: [],
    tables: [],
  });
}

const objectivesOutputSchema = z
  .object({
    objectives: z
      .array(
        z
          .object({
            statement: z.string().min(1).max(500),
            sourceBlockIds: z.array(z.string()).min(1),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();

type ObjectivesOutput = {
  objectives: { statement: string; sourceBlockIds: string[] }[];
};
type PersistCandidateInput = NonNullable<
  ModelCallHandlerOptions<ObjectivesOutput>["persistCandidate"]
>;

function handlerOptions(
  overrides: {
    provider?: LanguageModelProvider;
    jobType?: string;
    quota?: InMemoryQuotaGuard;
    database?: { client: unknown };
    modelCalls?: ModelCallRepository;
    maxRepairs?: number;
    deterministicChecks?: ModelCallHandlerOptions<ObjectivesOutput>["deterministicChecks"];
    deterministicRepairInstruction?: ModelCallHandlerOptions<ObjectivesOutput>["deterministicRepairInstruction"];
    deterministicRepair?: ModelCallHandlerOptions<ObjectivesOutput>["deterministicRepair"];
    maxDeterministicRepairs?: number;
    warningRepairInstruction?: ModelCallHandlerOptions<ObjectivesOutput>["warningRepairInstruction"];
    persistCandidate?: ModelCallHandlerOptions<{
      objectives: { statement: string; sourceBlockIds: string[] }[];
    }>["persistCandidate"];
    sourceSnapshotLoader?: () => Promise<{
      status: "ok";
      snapshot: SourceSnapshot;
    }>;
  } = {},
) {
  const prompts = new StaticPromptRegistry([
    {
      kind: "objectives",
      promptId: "objectives",
      version: "v1",
      purpose: "Test objectives prompt.",
      inputSchema: "SourcePackage",
      outputSchema: "ObjectivesOutputV1",
      allowedSourceContext: "Approved snapshot.",
      templateCatalogVersion: null,
      examples: [],
      knownFailureModes: [],
      evaluationCases: ["objectives-v1-basic"],
      changelog: "v1: test",
      system: "Return JSON only.",
      userTemplate: "Source:\n{{sourcePackage}}\nConfig:\n{{configuration}}",
    },
  ]);
  const recorded: ModelCallRecord[] = [];
  const modelCalls: ModelCallRepository = overrides.modelCalls ?? {
    create: async (input) => {
      const record = modelCallRecordSchema.parse(input.record);
      recorded.push(record);
      return { id: record.id };
    },
  };
  const provider =
    overrides.provider ??
    new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion({
        objectives: [
          { statement: "Explain evaporation.", sourceBlockIds: [blockId] },
        ],
      }),
    });
  const quota = overrides.quota ?? new InMemoryQuotaGuard([]);
  const sourceSnapshotLoader =
    overrides.sourceSnapshotLoader ??
    (async () => ({
      status: "ok",
      snapshot: sampleSnapshot(),
    }));
  const auditWriter = {
    write: vi.fn(async () => ({ id: createId() })),
  };
  const usageMeter = {
    record: vi.fn<(measurement: unknown) => Promise<{ id: string }>>(
      async () => ({ id: createId() }),
    ),
  };
  const handler = createModelCallGenerationHandler<{
    objectives: { statement: string; sourceBlockIds: string[] }[];
  }>({
    jobType: overrides.jobType ?? "ai.objectives",
    payloadVersion: 1,
    operationType: "ai.objectives",
    outputSchema: objectivesOutputSchema,
    provider,
    promptRegistry: prompts,
    quotaGuard: quota,
    database: {
      client: overrides.database?.client ?? {},
    } as never,
    sourceSnapshotLoader,
    modelCalls,
    usageMeter,
    auditWriter,
    pricing: {
      "mock-model-1": {
        inputUsdPerMillionTokens: 0.5,
        outputUsdPerMillionTokens: 1.5,
      },
    },
    ...(overrides.maxRepairs === undefined
      ? {}
      : { maxRepairs: overrides.maxRepairs }),
    ...(overrides.deterministicChecks === undefined
      ? {}
      : { deterministicChecks: overrides.deterministicChecks }),
    ...(overrides.deterministicRepairInstruction === undefined
      ? {}
      : {
          deterministicRepairInstruction:
            overrides.deterministicRepairInstruction,
        }),
    ...(overrides.maxDeterministicRepairs === undefined
      ? {}
      : { maxDeterministicRepairs: overrides.maxDeterministicRepairs }),
    ...(overrides.deterministicRepair === undefined
      ? {}
      : { deterministicRepair: overrides.deterministicRepair }),
    ...(overrides.warningRepairInstruction === undefined
      ? {}
      : { warningRepairInstruction: overrides.warningRepairInstruction }),
    ...(overrides.persistCandidate === undefined
      ? {}
      : { persistCandidate: overrides.persistCandidate }),
  });
  return {
    recorded,
    modelCalls,
    provider,
    handler,
    quota,
    auditWriter,
    usageMeter,
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    operationType: "ai.objectives",
    sourceSnapshotId: snapshotId,
    promptId: "objectives",
    promptVersion: "v1",
    model: "mock-model-1",
    providerApproval: {
      approvalReference: createId(),
      providerId: "mock",
      model: "mock-model-1",
      estimatedCostUsd: 0.01,
      selectionReason: "explicit_job_request",
    },
    ...overrides,
  };
}

async function execute(
  handler: RegisteredJobHandler,
  jobPayload: unknown,
): Promise<{ outcome: string; error?: unknown; metadata?: JobMetadata }> {
  const jobId = createId();
  const preparedPayload = {
    ...(jobPayload as Record<string, unknown>),
    schemaVersion: 2 as const,
    providerApproval: {
      ...((jobPayload as { providerApproval?: Record<string, unknown> })
        .providerApproval ?? {}),
      approvalReference: jobId,
    },
  };
  const envelope = createJobEnvelope(
    z.object({ schemaVersion: z.literal(2) }).passthrough(),
    {
      jobId,
      jobType: handler.jobType,
      projectId,
      ownerUserId,
      inputVersion: "objectives:v1",
      idempotencyKey: `objectives:${createId()}`,
      correlationId: createId(),
      payloadVersion: handler.payloadVersion,
      payload: preparedPayload,
    },
  );
  const handlerInner = (
    handler as unknown as {
      handler: (payload: unknown, context: unknown) => Promise<JobMetadata>;
    }
  ).handler;
  try {
    const metadata = await handlerInner(
      (envelope as unknown as { payload: unknown }).payload,
      {
        jobId: envelope.jobId,
        projectId,
        ownerUserId,
        correlationId: envelope.correlationId,
        idempotencyKey: envelope.idempotencyKey,
        attempt: 1,
        heartbeat: vi.fn(async () => true),
        reportProgress: vi.fn(async () => true),
      },
    );
    return { outcome: "succeeded", metadata };
  } catch (error) {
    return { outcome: "failed", error };
  }
}

describe("model-call lifecycle", () => {
  it("records which authorisation paid for the call on the usage record (ST-105)", async () => {
    const runId = createId();
    const oneShot = handlerOptions();
    await expect(
      execute(
        oneShot.handler,
        payload({
          providerApproval: {
            approvalReference: createId(),
            providerId: "mock",
            model: "mock-model-1",
            estimatedCostUsd: 0.01,
            selectionReason: "one_shot_run",
            oneShotRunId: runId,
          },
        }),
      ),
    ).resolves.toMatchObject({ outcome: "succeeded" });
    expect(oneShot.usageMeter.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          providerSelection: expect.objectContaining({
            selectionReason: "one_shot_run",
            oneShotRunId: runId,
          }),
        }),
      }),
    );

    const explicit = handlerOptions();
    await execute(explicit.handler, payload());
    const [measurement] = explicit.usageMeter.record.mock.calls[0]!;
    const selection = (
      measurement as {
        metadata: { providerSelection: Record<string, unknown> };
      }
    ).metadata.providerSelection;
    expect(selection.selectionReason).toBe("explicit_job_request");
    expect(selection).not.toHaveProperty("oneShotRunId");
  });

  it("runs the full lifecycle with a mock provider and records metadata", async () => {
    const { handler, recorded } = handlerOptions();
    const result = await execute(handler, payload());
    expect(result.outcome).toBe("succeeded");
    expect(result.metadata).toMatchObject({
      operationType: "ai.objectives",
      promptId: "objectives",
      promptVersion: "v1",
      validationStatus: "validated",
    });
    expect(recorded).toHaveLength(1);
    const record = recorded[0]!;
    expect(record.status).toBe("succeeded");
    expect(record.operationType).toBe("ai.objectives");
    expect(record.provider).toBe("mock");
    expect(record.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.inputUnits).toBeGreaterThan(0);
    expect(record.outputUnits).toBeGreaterThan(0);
    expect(record.estimatedCostUsd).toBeGreaterThan(0);
    expect(record.correlationId).toBeTruthy();
  });

  it("records repaired output after bounded repair", async () => {
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: sequenceCompletion([
        JSON.stringify({ objectives: [{ statement: "x" }] }),
        JSON.stringify({
          objectives: [
            { statement: "Explain evaporation.", sourceBlockIds: [blockId] },
          ],
        }),
      ]),
    });
    const { handler, recorded } = handlerOptions({ provider });
    const result = await execute(handler, payload());
    expect(result.outcome).toBe("succeeded");
    expect(recorded[0]?.validationStatus).toBe("repaired");
  });

  it("classifies invalid structured output as a terminal failure and meters the failed call", async () => {
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion({ wrong: true }),
    });
    const { handler, recorded } = handlerOptions({ provider });
    const result = await execute(handler, payload());
    expect(result.outcome).toBe("failed");
    expect((result.error as Error).message).toContain("bounded repair");
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      status: "failed",
      validationStatus: "invalid",
      errorCode: "STRUCTURED_OUTPUT_INVALID",
    });
  });

  it("rejects a payload whose operation type does not match the handler", async () => {
    const { handler, recorded } = handlerOptions();
    const result = await execute(
      handler,
      payload({ operationType: "ai.outline" }),
    );
    expect(result.outcome).toBe("failed");
    expect((result.error as Error).message).toContain("different AI operation");
    expect(recorded).toHaveLength(0);
  });

  it("rejects a generation that exceeds the quota", async () => {
    const quota = new InMemoryQuotaGuard([
      { operationType: "ai.objectives", maxCalls: 1, windowMs: 60_000 },
    ]);
    const { handler } = handlerOptions({ quota });
    await execute(handler, payload());
    const second = await execute(handler, payload());
    expect(second.outcome).toBe("failed");
    expect((second.error as Error).message).toContain("quota");
  });

  it("classifies a quota rejection as a terminal AI_QUOTA_EXCEEDED failure", async () => {
    const quota = new InMemoryQuotaGuard([
      { operationType: "ai.objectives", maxCalls: 0, windowMs: 60_000 },
    ]);
    const { handler, recorded } = handlerOptions({ quota });
    const result = await execute(handler, payload());
    expect(result.outcome).toBe("failed");
    const error = result.error as Error;
    expect(error).toBeInstanceOf(JobExecutionError);
    expect((error as JobExecutionError).classification).toBe("terminal");
    expect((error as JobExecutionError).code).toBe("AI_QUOTA_EXCEEDED");
    expect(recorded).toHaveLength(0);
  });

  it("persists the candidate through the optional lifecycle hook", async () => {
    const persistCandidate = vi.fn<PersistCandidateInput>(async () => ({
      id: "019ffbf1-eeee-7000-8000-000000000099",
    }));
    const { handler } = handlerOptions({ persistCandidate });
    const result = await execute(handler, payload());
    expect(result.outcome).toBe("succeeded");
    expect(result.metadata).toMatchObject({
      candidateId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    expect(persistCandidate).toHaveBeenCalledTimes(1);
    const input = persistCandidate.mock.calls[0]![0]!;
    expect(input.modelCall.status).toBe("succeeded");
    expect(input.snapshot.id).toBe(snapshotId);
    expect(input.context.ownerUserId).toBe(ownerUserId);
    expect(input.context.projectId).toBe(projectId);
    expect(input.value.objectives).toHaveLength(1);
  });

  it("repairs one safe deterministic failure before persisting a candidate", async () => {
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: sequenceCompletion([
        JSON.stringify({
          objectives: [
            { statement: "Copy source wording.", sourceBlockIds: [blockId] },
          ],
        }),
        JSON.stringify({
          objectives: [
            { statement: "Explain evaporation.", sourceBlockIds: [blockId] },
          ],
        }),
      ]),
    });
    const deterministicChecks = (value: ObjectivesOutput): void => {
      if (value.objectives[0]?.statement === "Copy source wording.")
        throw Object.assign(new Error("Copied source wording."), {
          code: "LONG_COPIED_PASSAGE",
        });
    };
    const { handler, recorded } = handlerOptions({
      provider,
      deterministicChecks,
      deterministicRepairInstruction: ({ error }) =>
        (error as { code?: string }).code === "LONG_COPIED_PASSAGE"
          ? "Rewrite the copied text."
          : undefined,
    });
    const result = await execute(handler, payload());
    expect(result.outcome).toBe("succeeded");
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]?.messages.at(-1)?.content).toContain(
      "Rewrite the copied text.",
    );
    expect(recorded[0]).toMatchObject({
      status: "succeeded",
      validationStatus: "repaired",
    });
  });

  describe("bounded deterministic repair rounds", () => {
    it("validates patches, meters every call, and passes the merged draft to warning improvement", async () => {
      const original = {
        objectives: [{ statement: "Copied first.", sourceBlockIds: [blockId] }],
      };
      const provider = new MockLanguageModelProvider({
        model: "mock-model-1",
        completion: sequenceCompletion([
          JSON.stringify(original),
          JSON.stringify({ replacement: "Short draft." }),
          JSON.stringify({
            objectives: [
              {
                statement: "Explain evaporation fully.",
                sourceBlockIds: [blockId],
              },
            ],
          }),
        ]),
      });
      const { handler, recorded } = handlerOptions({
        provider,
        deterministicChecks: (value) => {
          if (value.objectives[0]!.statement.startsWith("Copied"))
            throw new Error("Copied wording.");
          return value.objectives[0]!.statement.startsWith("Short")
            ? [{ code: "SHORT", message: "Expand." }]
            : [];
        },
        deterministicRepair: ({ value }) => ({
          instruction: "Return replacement only.",
          schema: z
            .object({ replacement: z.string() })
            .strict()
            .transform((patch) => ({
              objectives: [
                { ...value.objectives[0]!, statement: patch.replacement },
              ],
            })),
        }),
        warningRepairInstruction: () => "Expand the draft.",
      });
      expect((await execute(handler, payload())).outcome).toBe("succeeded");
      expect(provider.requests).toHaveLength(3);
      expect(provider.requests[1]!.messages.at(-1)!.content).toBe(
        "Return replacement only.",
      );
      const previous = provider.requests[2]!.messages.at(-1)!.content.split(
        "Previous JSON response:\n",
      )[1]!;
      expect(JSON.parse(previous)).toEqual({
        objectives: [{ statement: "Short draft.", sourceBlockIds: [blockId] }],
      });
      expect(recorded[0]).toMatchObject({ status: "succeeded", retryCount: 2 });
    });

    it("rejects an invalid patch without persisting and meters the failed correction", async () => {
      const provider = new MockLanguageModelProvider({
        model: "mock-model-1",
        completion: sequenceCompletion([
          JSON.stringify({
            objectives: [
              { statement: "Copied first.", sourceBlockIds: [blockId] },
            ],
          }),
          JSON.stringify({ unexpected: "Unvalidated replacement" }),
        ]),
      });
      const persistCandidate = vi.fn<PersistCandidateInput>(async () => ({
        id: createId(),
      }));
      const { handler, recorded } = handlerOptions({
        provider,
        persistCandidate,
        deterministicChecks: () => {
          throw new Error("Copied wording.");
        },
        deterministicRepair: ({ value }) => ({
          instruction: "Return a validated patch.",
          schema: z
            .object({ replacement: z.string() })
            .strict()
            .transform(() => value),
        }),
      });
      expect((await execute(handler, payload())).outcome).toBe("failed");
      expect(persistCandidate).not.toHaveBeenCalled();
      expect(provider.requests).toHaveLength(2);
      expect(recorded[0]).toMatchObject({
        status: "failed",
        retryCount: 1,
        errorCode: "DETERMINISTIC_CHECK_FAILED",
      });
    });

    it("sends complete parsed JSON for a draft longer than the old 20,000-character cut-off", async () => {
      const original = {
        objectives: [
          {
            statement: "Copied first.",
            sourceBlockIds: Array.from({ length: 600 }, () => blockId),
          },
        ],
      };
      expect(JSON.stringify(original).length).toBeGreaterThan(20_000);
      const provider = new MockLanguageModelProvider({
        model: "mock-model-1",
        completion: sequenceCompletion([
          JSON.stringify(original),
          JSON.stringify({
            objectives: [
              { statement: "Explain evaporation.", sourceBlockIds: [blockId] },
            ],
          }),
        ]),
      });
      const { handler } = handlerOptions({
        provider,
        deterministicChecks: (value) => {
          if (value.objectives[0]!.statement.startsWith("Copied"))
            throw new Error("Paraphrase the sentence.");
        },
      });
      expect((await execute(handler, payload())).outcome).toBe("succeeded");
      const previous = provider.requests[1]!.messages.at(-1)!.content.split(
        "Previous JSON response:\n",
      )[1]!;
      expect(JSON.parse(previous)).toEqual(original);
    });

    const statement = (text: string) =>
      JSON.stringify({
        objectives: [{ statement: text, sourceBlockIds: [blockId] }],
      });
    // Each rejected draft names what the next correction must fix.
    const deterministicChecks = (value: ObjectivesOutput): void => {
      const text = value.objectives[0]?.statement ?? "";
      if (text.startsWith("Copied"))
        throw Object.assign(new Error(`Rejected: ${text}`), {
          code: "LONG_COPIED_PASSAGE",
        });
    };
    const deterministicRepairInstruction: ModelCallHandlerOptions<ObjectivesOutput>["deterministicRepairInstruction"] =
      ({ error }) => `Fix: ${(error as Error).message}`;

    it("re-checks each correction and succeeds on a later round", async () => {
      const provider = new MockLanguageModelProvider({
        model: "mock-model-1",
        completion: sequenceCompletion([
          statement("Copied first."),
          statement("Copied second."),
          statement("Explain evaporation."),
        ]),
      });
      const { handler, recorded } = handlerOptions({
        provider,
        deterministicChecks,
        deterministicRepairInstruction,
        maxDeterministicRepairs: 2,
      });
      const result = await execute(handler, payload());
      expect(result.outcome).toBe("succeeded");
      expect(provider.requests).toHaveLength(3);
      // The second round is built from the second draft's violation.
      expect(provider.requests[2]?.messages.at(-1)?.content).toContain(
        "Fix: Rejected: Copied second.",
      );
      expect(recorded[0]).toMatchObject({ status: "succeeded", retryCount: 2 });
    });

    it("stops after the allowed rounds and reports the latest violation", async () => {
      const provider = new MockLanguageModelProvider({
        model: "mock-model-1",
        completion: sequenceCompletion([
          statement("Copied first."),
          statement("Copied second."),
          statement("Copied third."),
          statement("Explain evaporation."),
        ]),
      });
      const { handler, recorded } = handlerOptions({
        provider,
        deterministicChecks,
        deterministicRepairInstruction,
        maxDeterministicRepairs: 2,
      });
      const result = await execute(handler, payload());
      expect(result.outcome).toBe("failed");
      expect(provider.requests).toHaveLength(3);
      expect(result.error).toMatchObject({
        code: "MODEL_OUTPUT_DETERMINISTIC_FAILURE",
        details: expect.objectContaining({
          message: "Rejected: Copied third.",
        }),
      });
      expect(recorded[0]).toMatchObject({
        status: "failed",
        errorCode: "DETERMINISTIC_CHECK_FAILED",
      });
    });

    it("allows two corrective rounds by default", async () => {
      const provider = new MockLanguageModelProvider({
        model: "mock-model-1",
        completion: sequenceCompletion([
          statement("Copied first."),
          statement("Copied second."),
          statement("Explain evaporation."),
        ]),
      });
      const { handler } = handlerOptions({
        provider,
        deterministicChecks,
        deterministicRepairInstruction,
      });
      const result = await execute(handler, payload());
      expect(result.outcome).toBe("succeeded");
      expect(provider.requests).toHaveLength(3);
    });

    it("corrects a job without its own instruction using the failed rule's message", async () => {
      const provider = new MockLanguageModelProvider({
        model: "mock-model-1",
        completion: sequenceCompletion([
          statement("Copied first."),
          statement("Explain evaporation."),
        ]),
      });
      const { handler, recorded } = handlerOptions({
        provider,
        deterministicChecks,
      });
      const result = await execute(handler, payload());
      expect(result.outcome).toBe("succeeded");
      expect(provider.requests).toHaveLength(2);
      expect(provider.requests[1]?.messages.at(-1)?.content).toContain(
        "It failed this automatic check: Rejected: Copied first.",
      );
      expect(recorded[0]).toMatchObject({ validationStatus: "repaired" });
    });
  });

  describe("one improvement round for a checked draft with warnings", () => {
    const statement = (text: string) =>
      JSON.stringify({
        objectives: [{ statement: text, sourceBlockIds: [blockId] }],
      });
    const deterministicChecks = (value: ObjectivesOutput) => {
      const text = value.objectives[0]?.statement ?? "";
      if (text.startsWith("Broken")) throw new Error("Broken draft.");
      return text.startsWith("Short")
        ? [{ code: "WORD_COUNT_OUT_OF_BUDGET", message: "Too short." }]
        : [];
    };
    const warningRepairInstruction = () => "Make it longer.";

    it("keeps an improvement that passes every check", async () => {
      const provider = new MockLanguageModelProvider({
        model: "mock-model-1",
        completion: sequenceCompletion([
          statement("Short draft."),
          statement("Explain evaporation fully."),
        ]),
      });
      const { handler, recorded } = handlerOptions({
        provider,
        deterministicChecks,
        warningRepairInstruction,
      });
      const result = await execute(handler, payload());
      expect(result.outcome).toBe("succeeded");
      expect(provider.requests).toHaveLength(2);
      expect(provider.requests[1]?.messages.at(-1)?.content).toContain(
        "Make it longer.",
      );
      expect(recorded[0]).toMatchObject({ status: "succeeded", retryCount: 1 });
    });

    it("keeps the checked draft when the improvement breaks a rule, and meters both calls", async () => {
      const provider = new MockLanguageModelProvider({
        model: "mock-model-1",
        completion: sequenceCompletion([
          statement("Short draft."),
          statement("Broken draft."),
        ]),
      });
      const persistCandidate = vi.fn<PersistCandidateInput>(async () => ({
        id: createId(),
      }));
      const { handler, recorded } = handlerOptions({
        provider,
        deterministicChecks,
        warningRepairInstruction,
        persistCandidate,
      });
      const result = await execute(handler, payload());
      expect(result.outcome).toBe("succeeded");
      expect(
        persistCandidate.mock.calls[0]?.[0].value.objectives[0]?.statement,
      ).toBe("Short draft.");
      expect(recorded[0]).toMatchObject({ status: "succeeded", retryCount: 1 });
    });

    it("asks nothing when the draft has no warnings", async () => {
      const provider = new MockLanguageModelProvider({
        model: "mock-model-1",
        completion: sequenceCompletion([statement("Explain evaporation.")]),
      });
      const { handler } = handlerOptions({
        provider,
        deterministicChecks,
        warningRepairInstruction,
      });
      await execute(handler, payload());
      expect(provider.requests).toHaveLength(1);
    });
  });

  it("classifies a candidate persistence failure as retryable", async () => {
    const persistCandidate = vi.fn<PersistCandidateInput>(async () => {
      throw new Error("disk full");
    });
    const { handler } = handlerOptions({ persistCandidate });
    const result = await execute(handler, payload());
    expect(result.outcome).toBe("failed");
    const error = result.error as JobExecutionError;
    expect(error).toBeInstanceOf(JobExecutionError);
    expect(error.classification).toBe("retryable");
    expect(error.code).toBe("CANDIDATE_PERSIST_FAILED");
  });

  it("meters a classified provider failure", async () => {
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      fail: { code: "PROVIDER_RATE_LIMITED", retryable: true },
    });
    const { handler, recorded } = handlerOptions({ provider });
    const result = await execute(handler, payload());
    expect(result.outcome).toBe("failed");
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      status: "failed",
      errorCode: "PROVIDER_RATE_LIMITED",
    });
  });

  it("fails closed before transport when the configured provider lacks the approved model", async () => {
    const provider = new MockLanguageModelProvider({
      model: "different-model",
      completion: jsonCompletion({
        objectives: [
          { statement: "Explain evaporation.", sourceBlockIds: [blockId] },
        ],
      }),
    });
    const { handler } = handlerOptions({ provider });
    const result = await execute(handler, payload());
    expect(result.outcome).toBe("failed");
    expect(result.error).toMatchObject({
      code: "APPROVED_PROVIDER_UNAVAILABLE",
      classification: "terminal",
    });
    expect(provider.requests).toHaveLength(0);
  });

  it("denies an unapproved configured provider before its transport runs", async () => {
    const provider = new MockLanguageModelProvider({ model: "mock-model-1" });
    const { handler, auditWriter } = handlerOptions({ provider });
    const result = await execute(
      handler,
      payload({
        providerApproval: {
          approvalReference: createId(),
          providerId: "together",
          model: "mock-model-1",
          estimatedCostUsd: 0.01,
          selectionReason: "explicit_job_request",
        },
      }),
    );
    expect(result.error).toMatchObject({
      code: "APPROVED_PROVIDER_UNAVAILABLE",
      classification: "terminal",
    });
    expect(provider.requests).toHaveLength(0);
    expect(auditWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          requestedAdapter: "language-model",
          code: "APPROVED_PROVIDER_UNAVAILABLE",
        }),
      }),
    );
  });

  it("records the immutable approval selection reason", async () => {
    const { handler, auditWriter } = handlerOptions();
    const result = await execute(handler, payload());
    expect(result.outcome).toBe("succeeded");
    expect(auditWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          providerSelection: expect.objectContaining({
            selectionReason: "explicit_job_request",
          }),
        }),
      }),
    );
  });

  it("audits a denied envelope before the provider transport can run", async () => {
    const provider = new MockLanguageModelProvider({ model: "mock-model-1" });
    const { handler, auditWriter } = handlerOptions({
      provider,
      jobType: "unregistered.provider.job",
    });
    const result = await execute(handler, payload());
    expect(result.error).toMatchObject({ code: "PROVIDER_ENVELOPE_VIOLATION" });
    expect(provider.requests).toHaveLength(0);
    expect(auditWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ type: "job" }),
        correlationId: expect.any(String),
        metadata: expect.objectContaining({
          requestedAdapter: "language-model",
          jobType: "unregistered.provider.job",
        }),
      }),
    );
  });

  it("reports missing source snapshots as terminal failures", async () => {
    const handler = createModelCallGenerationHandler({
      jobType: "ai.objectives",
      payloadVersion: 1,
      operationType: "ai.objectives",
      outputSchema: objectivesOutputSchema,
      provider: new MockLanguageModelProvider({ model: "mock-model-1" }),
      promptRegistry: new StaticPromptRegistry([]),
      quotaGuard: new InMemoryQuotaGuard([]),
      database: { client: {} } as never,
      sourceSnapshotLoader: async () => ({ status: "missing" }),
      modelCalls: {
        create: vi.fn(async () => ({ id: createId() })),
      },
      usageMeter: { record: vi.fn(async () => ({ id: createId() })) },
      now: () => new Date("2026-08-16T10:00:00.000Z"),
    });
    const result = await execute(handler, payload());
    expect(result.outcome).toBe("failed");
    expect((result.error as Error).message).toContain("does not exist");
  });
});

describe("loadApprovedSourceSnapshot", () => {
  function executorReturning(row: unknown, latestRow: unknown) {
    let latest = false;
    return {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              if (latest) return [latestRow];
              latest = true;
              return [row];
            },
            orderBy: () => ({
              limit: async () => [latestRow],
            }),
          }),
        }),
      }),
    };
  }

  it("rejects a snapshot that is not the latest approved version", async () => {
    const snapshot = sampleSnapshot();
    const executor = executorReturning(
      { payload: snapshot, snapshotVersion: 1 },
      { snapshotVersion: 2 },
    );
    const result = await loadApprovedSourceSnapshot({
      executor: executor as never,
      ownerUserId,
      projectId,
      snapshotId,
    });
    expect(result.status).toBe("stale");
  });

  it("returns ok when the referenced snapshot is the latest", async () => {
    const snapshot = sampleSnapshot();
    const executor = executorReturning(
      { payload: snapshot, snapshotVersion: 1 },
      { snapshotVersion: 1 },
    );
    const result = await loadApprovedSourceSnapshot({
      executor: executor as never,
      ownerUserId,
      projectId,
      snapshotId,
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.snapshot.id).toBe(snapshotId);
  });

  it("reports a missing snapshot", async () => {
    const executor = executorReturning(undefined, undefined);
    const result = await loadApprovedSourceSnapshot({
      executor: executor as never,
      ownerUserId,
      projectId,
      snapshotId,
    });
    expect(result.status).toBe("missing");
  });
});
