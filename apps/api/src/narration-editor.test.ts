import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createId } from "@avlp/config";
import {
  auditEvents,
  jobs,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  narrationBlockCandidates,
  narrationBlockRevisions,
  narrationBlocks,
  narrationSets,
  sourceSnapshots,
  type DatabaseClient,
} from "@avlp/database";
import type { SourceApprovalStatus } from "@avlp/schemas";
import { PostgresNarrationService } from "./narration.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const outlineSetId = "019ffbf1-eeee-7000-8000-000000000002";
const setA = "019ffbf1-eeee-7000-8000-000000000020";
const blockA = "019ffbf1-eeee-7000-8000-000000000021";
const outlineItemA = "019ffbf1-eeee-7000-8000-000000000003";
const sectionId = "019ffbf1-1111-7000-8000-000000000001";
const sourceBlockA = "019ffbf1-2222-7000-8000-000000000001";
const sourceBlockB = "019ffbf1-2223-7000-8000-000000000001";
const candidateA = "019ffbf1-eeee-7000-8000-000000000040";
const contentHash = "a".repeat(64);

const approvedStatus: SourceApprovalStatus = {
  approved: true,
  parsedDocumentVersion: 1,
  snapshotId,
  snapshotVersion: 1,
  contentHash,
  approvedAt: "2026-08-16T10:00:00.000Z",
  stale: false,
};

const snapshotPayload = {
  schemaVersion: "1.0",
  id: snapshotId,
  projectId,
  sourceDocumentId: "019ffbf1-4444-7000-8000-000000000001",
  parsedDocumentId: "019ffbf1-3333-7000-8000-000000000001",
  parsedDocumentVersion: 1,
  contentHash,
  approvedBy: ownerUserId,
  approvedAt: "2026-08-16T10:00:00.000Z",
  sections: [
    {
      sectionId,
      order: 1,
      level: 1,
      heading: "Water cycle",
      pageStart: 1,
      pageEnd: 2,
      reviewOrder: null,
      blockIds: [sourceBlockA, sourceBlockB],
      figureIds: [],
      tableIds: [],
    },
  ],
  blocks: [
    {
      blockId: sourceBlockA,
      sectionId,
      kind: "paragraph",
      order: 1,
      pageStart: 1,
      pageEnd: 1,
      text: "Water evaporates when heated.",
      corrected: false,
      revision: 0,
    },
    {
      blockId: sourceBlockB,
      sectionId,
      kind: "paragraph",
      order: 2,
      pageStart: 2,
      pageEnd: 2,
      text: "Condensation forms clouds.",
      corrected: false,
      revision: 0,
    },
  ],
  figures: [],
  tables: [],
};

function outlineItemsHash(
  items: readonly {
    id: string;
    order: number;
    kind: string;
    title: string;
    description: string;
    estimatedSeconds: number;
  }[],
): string {
  const canonical = JSON.stringify(
    [...items]
      .sort((left, right) => left.order - right.order)
      .map((item) => ({
        id: item.id,
        order: item.order,
        kind: item.kind,
        title: item.title,
        description: item.description,
        estimatedSeconds: item.estimatedSeconds,
      })),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

function configRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "019ffbf1-eeee-7000-8000-000000000010",
    projectId,
    ownerUserId,
    version: 3,
    ageBand: "11-13",
    difficulty: "introductory",
    subject: "Science",
    lessonTitle: "The water cycle",
    targetDurationSeconds: 180,
    tone: "friendly",
    visualTheme: "mvp-default",
    includeRecallQuestions: true,
    sourceParsedDocumentVersion: 1,
    createdAt: new Date("2026-08-16T10:00:00.000Z"),
    updatedAt: new Date("2026-08-16T10:00:00.000Z"),
    ...overrides,
  };
}

function outlineItemRows() {
  return [
    {
      id: outlineItemA,
      projectId,
      ownerUserId,
      setId: outlineSetId,
      order: 1,
      kind: "hook",
      title: "Where does the water go?",
      description: "Open with a question.",
      estimatedSeconds: 20,
      sourceRefs: [
        {
          documentId: "019ffbf1-3333-7000-8000-000000000001",
          parsedDocumentVersion: 1,
          pageStart: 1,
          pageEnd: 1,
          sectionId,
          blockIds: [sourceBlockA],
        },
      ],
      framingNote: "Generated framing question.",
      generated: true,
      revision: 0,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    },
  ];
}

function approvedOutlineSetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: outlineSetId,
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: contentHash,
    objectiveSetId: "019ffbf1-eeee-7000-8000-000000000004",
    objectiveSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "outline",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
    status: "approved",
    revision: 0,
    idempotencyKey: "outline:key-1",
    totalEstimatedSeconds: 20,
    generatedAt: new Date("2026-08-17T10:00:00.000Z"),
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    ...overrides,
  };
}

function narrationSetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: setA,
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: contentHash,
    outlineSetId,
    outlineSetContentHash: outlineItemsHash(outlineItemRows()),
    configurationVersion: 3,
    promptId: "narration",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
    status: "draft",
    revision: 0,
    idempotencyKey: "narration:key-1",
    totalEstimatedSeconds: 180,
    generatedAt: new Date("2026-08-17T10:00:00.000Z"),
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    ...overrides,
  };
}

function narrationBlockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: blockA,
    projectId,
    ownerUserId,
    setId: setA,
    outlineItemId: outlineItemA,
    order: 1,
    text: "Where does the water go when a puddle dries?",
    estimatedWords: 38,
    targetSeconds: 20,
    sourceRefs: [
      {
        documentId: "019ffbf1-3333-7000-8000-000000000001",
        parsedDocumentVersion: 1,
        pageStart: 1,
        pageEnd: 1,
        sectionId,
        blockIds: [sourceBlockA],
      },
    ],
    generatedAdditions: [],
    generated: true,
    revision: 0,
    origin: "generated",
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    ...overrides,
  };
}

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: candidateA,
    projectId,
    ownerUserId,
    setId: setA,
    blockId: blockA,
    mode: "shorten",
    text: "Where does a drying puddle go?",
    estimatedWords: 6,
    sourceRefs: [],
    generatedAdditions: [],
    generated: true,
    status: "pending",
    blockRevision: 0,
    modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
    idempotencyKey: "narration-transform:key-1",
    createdAt: new Date("2026-08-17T11:00:00.000Z"),
    updatedAt: new Date("2026-08-17T11:00:00.000Z"),
    ...overrides,
  };
}

function revisionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "019ffbf1-eeee-7000-8000-000000000050",
    projectId,
    ownerUserId,
    setId: setA,
    blockId: blockA,
    revision: 0,
    text: "Where does the water go when a puddle dries?",
    estimatedWords: 38,
    sourceRefs: [],
    generatedAdditions: [],
    generated: true,
    origin: "generated",
    modelCallId: null,
    createdAt: new Date("2026-08-17T11:00:00.000Z"),
    ...overrides,
  };
}

type Comparison = { column: string; op: "=" | "<>"; value: unknown };

function extractComparisons(node: unknown, out: Comparison[] = []): Comparison[] {
  if (node === null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) extractComparisons(item, out);
    return out;
  }
  const record = node as Record<string, unknown>;
  const chunks = record.queryChunks;
  if (!Array.isArray(chunks)) return out;
  const textAt = (index: number): string | undefined => {
    const chunk = chunks[index] as { value?: string[] } | undefined;
    if (chunk === undefined || !Array.isArray(chunk.value)) return undefined;
    return chunk.value.join("");
  };
  const column = chunks[1] as { name?: string } | undefined;
  const operatorText = textAt(2);
  if (
    chunks.length === 5 &&
    column !== undefined &&
    typeof column.name === "string" &&
    (operatorText === " = " || operatorText === " <> ")
  ) {
    const rawValue = chunks[3] as
      | { value?: unknown }
      | string
      | number
      | boolean
      | null;
    const value =
      rawValue !== null &&
      typeof rawValue === "object" &&
      "value" in rawValue
        ? rawValue.value
        : rawValue;
    out.push({
      column: column.name,
      op: operatorText === " <> " ? "<>" : "=",
      value,
    });
    return out;
  }
  for (const chunk of chunks) extractComparisons(chunk, out);
  return out;
}

function resolveSetValues(
  target: Record<string, unknown>,
  value: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    const node = raw as { queryChunks?: unknown[] } | null | undefined;
    if (
      node !== null &&
      typeof node === "object" &&
      Array.isArray(node.queryChunks)
    ) {
      const chunks = node.queryChunks;
      const textAt = (index: number): string | undefined => {
        const chunk = chunks[index] as { value?: string[] } | undefined;
        if (chunk === undefined || !Array.isArray(chunk.value)) return undefined;
        return chunk.value.join("");
      };
      const prefix = textAt(0) ?? "";
      const incrementText = textAt(2) ?? "";
      const incrementMatch = incrementText.match(/^\s*\+\s*(\d+)\s*$/);
      if (prefix === "-" && chunks.length === 3) {
        resolved[key] = -Number(target[key] ?? 0);
        continue;
      }
      if (incrementMatch !== null) {
        resolved[key] = Number(target[key] ?? 0) + Number(incrementMatch[1]);
        continue;
      }
    }
    resolved[key] = raw;
  }
  return resolved;
}

function fakeDatabase(input: {
  configRows?: Record<string, unknown>[];
  outlineSetRows?: Record<string, unknown>[];
  outlineItemRows?: Record<string, unknown>[];
  narrationSetRows?: Record<string, unknown>[];
  narrationBlockRows?: Record<string, unknown>[];
  candidateRows?: Record<string, unknown>[];
  revisionRows?: Record<string, unknown>[];
  jobRows?: Record<string, unknown>[];
  sourceSnapshotRows?: Record<string, unknown>[];
}) {
  const sets = [...(input.narrationSetRows ?? [])];
  const blocks = [...(input.narrationBlockRows ?? [])];
  const candidates = [...(input.candidateRows ?? [])];
  const revisions = [...(input.revisionRows ?? [])];
  const configs = [...(input.configRows ?? [])];
  const outlineSets = [...(input.outlineSetRows ?? [])];
  const outlineItems = [...(input.outlineItemRows ?? [])];
  const jobRows = [...(input.jobRows ?? [])];
  const jobIdsByKey = new Map<string, string>();
  const audits: unknown[] = [];

  const camelCase = (value: string): string =>
    value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

  const matches = (
    row: Record<string, unknown>,
    comparisons: Comparison[],
  ): boolean =>
    comparisons.every(({ column, op, value }) => {
      const actual = row[column] ?? row[camelCase(column)];
      if (op === "<>") return actual !== value;
      return actual === value;
    });

  const sortByColumn = (
    rows: Record<string, unknown>[],
    orderByArg: unknown,
  ): Record<string, unknown>[] => {
    const columns: Array<{ name?: string }> = Array.isArray(orderByArg)
      ? (orderByArg as Array<{ name?: string }>)
      : [orderByArg as { name?: string }];
    const sortable = columns
      .map((column) => column?.name)
      .filter((name): name is string => name !== undefined);
    if (sortable.length === 0) return rows;
    return [...rows].sort((left, right) => {
      for (const name of sortable) {
        const a = left[name] ?? left[camelCase(name)];
        const b = right[name] ?? right[camelCase(name)];
        if (typeof a === "number" && typeof b === "number" && a !== b)
          return a - b;
        if (String(a) !== String(b)) return String(a) < String(b) ? -1 : 1;
      }
      return 0;
    });
  };

  const collectionFor = (table: unknown): Record<string, unknown>[] => {
    if (table === narrationSets) return sets;
    if (table === narrationBlocks) return blocks;
    if (table === narrationBlockCandidates) return candidates;
    if (table === narrationBlockRevisions) return revisions;
    if (table === lessonConfigurations) return configs;
    if (table === lessonOutlineSets) return outlineSets;
    if (table === lessonOutlineItems) return outlineItems;
    if (table === jobs) return jobRows;
    return [];
  };

  const select = (projection?: Record<string, unknown>) => ({
    from: (table: unknown) => ({
      where: (where: unknown) => {
        const comparisons = extractComparisons(where);
        const source =
          table === sourceSnapshots
            ? (input.sourceSnapshotRows ?? []).map((row) => ({
                ...row,
                payload: snapshotPayload,
              }))
            : collectionFor(table);
        const filtered = source.filter((row) => matches(row, comparisons));
        if (projection !== undefined && "count" in projection)
          return {
            then: (resolve: (value: unknown[]) => void) =>
              Promise.resolve([{ count: filtered.length }]).then(resolve),
          };
        const query = {
          limit: () => ({
            for: () => query,
            then: (resolve: (value: unknown[]) => void) =>
              Promise.resolve(filtered.slice(0, 1)).then(resolve),
          }),
          orderBy: (orderByArg: unknown) => {
            const sorted = sortByColumn(filtered, orderByArg);
            return {
              limit: () => ({
                for: () => query,
                then: (resolve: (value: unknown[]) => void) =>
                  Promise.resolve(sorted).then(resolve),
              }),
              then: (resolve: (value: unknown[]) => void) =>
                Promise.resolve(sorted).then(resolve),
            };
          },
          for: () => query,
          then: (resolve: (value: unknown[]) => void) =>
            Promise.resolve(filtered).then(resolve),
        };
        return query;
      },
    }),
  });

  const insert = (table: unknown) => ({
    values: (value: unknown) => {
      const chain = {
        onConflictDoNothing: () => chain,
        returning: async () => {
          const batch = Array.isArray(value) ? value : [value];
          for (const item of batch) {
            if (table === jobs) {
              const key = (item as { idempotencyKey: string }).idempotencyKey;
              if (jobIdsByKey.has(key)) return [];
              jobIdsByKey.set(key, (item as { id: string }).id);
              jobRows.push(item);
              return [{ id: (item as { id: string }).id }];
            }
            const target = collectionFor(table);
            if (target !== undefined) target.push(item);
            if (table === auditEvents) audits.push(item);
          }
          return batch;
        },
        then: (resolve: (value: unknown[]) => void) => {
          const batch = Array.isArray(value) ? value : [value];
          for (const item of batch) {
            if (table === jobs) {
              const key = (item as { idempotencyKey: string }).idempotencyKey;
              if (jobIdsByKey.has(key)) continue;
              jobIdsByKey.set(key, (item as { id: string }).id);
              jobRows.push(item);
              continue;
            }
            const target = collectionFor(table);
            if (target !== undefined) target.push(item);
            if (table === auditEvents) audits.push(item);
          }
          return Promise.resolve([]).then(resolve);
        },
      };
      return chain;
    },
  });

  const update = (table: unknown) => ({
    set: (value: unknown) => ({
      where: (where: unknown) => {
        const comparisons = extractComparisons(where);
        const targets = collectionFor(table).filter((row) =>
          matches(row, comparisons),
        );
        for (const target of targets)
          Object.assign(
            target,
            resolveSetValues(target, value as Record<string, unknown>),
          );
        return {
          returning: async () => targets,
          then: (resolve: (value: unknown[]) => void) =>
            Promise.resolve(targets).then(resolve),
        };
      },
    }),
  });

  let transactionQueue = Promise.resolve();
  const database = {
    client: {},
    select,
    insert,
    update,
    transaction: (cb: (inner: unknown) => Promise<unknown>) => {
      const run = transactionQueue.then(() =>
        cb({ select, insert, update }),
      );
      transactionQueue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  } as unknown as DatabaseClient;
  return {
    database,
    sets,
    blocks,
    candidates,
    revisions,
    audits,
    jobRows,
  };
}

function createService(
  database: DatabaseClient,
  approval: SourceApprovalStatus = approvedStatus,
) {
  const sourceApprovalStatus = vi.fn(async () => approval);
  const service = new PostgresNarrationService(
    database,
    sourceApprovalStatus,
    () => new Date("2026-08-17T12:00:00.000Z"),
  );
  return { service, sourceApprovalStatus };
}

function editorDatabase(overrides: Record<string, unknown> = {}) {
  return fakeDatabase({
    configRows: [configRow()],
    outlineSetRows: [approvedOutlineSetRow()],
    outlineItemRows: outlineItemRows(),
    narrationSetRows: [narrationSetRow()],
    narrationBlockRows: [narrationBlockRow()],
    ...overrides,
  });
}

describe("PostgresNarrationService.updateBlock", () => {
  it("edits one block, archives the previous revision, and bumps the set revision", async () => {
    const fake = editorDatabase();
    const { service } = createService(fake.database);
    const result = await service.updateBlock({
      ownerUserId,
      projectId,
      blockId: blockA,
      body: {
        text: "Where does a drying puddle go?",
        expectedRevision: 0,
      },
      correlationId: createId(),
    });
    const block = fake.blocks.find((row) => row.id === blockA)!;
    expect(block.text).toBe("Where does a drying puddle go?");
    expect(block.origin).toBe("teacher_edit");
    expect(block.revision).toBe(1);
    expect(block.estimatedWords).toBe(6);
    expect((block.sourceRefs as unknown[]).length).toBeGreaterThan(0);
    const set = fake.sets.find((row) => row.id === setA)!;
    expect(set.revision).toBe(1);
    expect(fake.revisions).toHaveLength(1);
    expect(fake.revisions[0]).toMatchObject({
      blockId: blockA,
      revision: 0,
      origin: "generated",
    });
    expect(fake.audits.some((row) => (row as { eventType: string }).eventType === "narration.edited")).toBe(true);
    expect(result.set?.blocks[0]?.revision).toBe(1);
  });

  it("retains existing citations when the teacher omits source blocks", async () => {
    const fake = editorDatabase();
    const { service } = createService(fake.database);
    await service.updateBlock({
      ownerUserId,
      projectId,
      blockId: blockA,
      body: { text: "A shorter rewrite.", expectedRevision: 0 },
      correlationId: createId(),
    });
    const block = fake.blocks.find((row) => row.id === blockA)!;
    expect((block.sourceRefs as unknown[]).length).toBeGreaterThan(0);
  });

  it("re-resolves citations when the teacher supplies source blocks", async () => {
    const fake = editorDatabase({
      sourceSnapshotRows: [{ id: snapshotId, ownerUserId, projectId }],
    });
    const { service } = createService(fake.database);
    await service.updateBlock({
      ownerUserId,
      projectId,
      blockId: blockA,
      body: {
        text: "A grounded rewrite.",
        sourceBlockIds: [sourceBlockB],
        expectedRevision: 0,
      },
      correlationId: createId(),
    });
    const block = fake.blocks.find((row) => row.id === blockA)!;
    const refs = block.sourceRefs as { blockIds: string[] }[];
    expect(refs.flatMap((ref) => ref.blockIds)).toEqual([sourceBlockB]);
  });

  it("rejects a stale expected revision with a conflict", async () => {
    const fake = editorDatabase();
    const { service } = createService(fake.database);
    await expect(
      service.updateBlock({
        ownerUserId,
        projectId,
        blockId: blockA,
        body: { text: "Stale edit.", expectedRevision: 3 },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("returns 404 for a block outside the working set", async () => {
    const fake = editorDatabase();
    const { service } = createService(fake.database);
    await expect(
      service.updateBlock({
        ownerUserId,
        projectId,
        blockId: "019ffbf1-eeee-7000-8000-00000000ffff",
        body: { text: "Missing.", expectedRevision: 0 },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });

  it("rejects editing when no draft narration exists", async () => {
    const fake = editorDatabase({ narrationSetRows: [] });
    const { service } = createService(fake.database);
    await expect(
      service.updateBlock({
        ownerUserId,
        projectId,
        blockId: blockA,
        body: { text: "No draft.", expectedRevision: 0 },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });
});

describe("PostgresNarrationService.regenerateBlock", () => {
  it("rejects a missing idempotency key", async () => {
    const fake = editorDatabase();
    const { service } = createService(fake.database);
    await expect(
      service.regenerateBlock({
        ownerUserId,
        projectId,
        blockId: blockA,
        body: { mode: "shorten", expectedRevision: 0 },
        idempotencyKey: undefined,
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });

  it("queues a transform job with the mode and bounded params", async () => {
    const fake = editorDatabase();
    const { service } = createService(fake.database);
    const result = await service.regenerateBlock({
      ownerUserId,
      projectId,
      blockId: blockA,
      body: { mode: "shorten", instruction: "Tighten the opening.", expectedRevision: 0 },
      idempotencyKey: "transform-1",
      correlationId: createId(),
    });
    expect(result.status).toBe("queued");
    expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/);
    const job = fake.jobRows[0] as {
      jobType: string;
      payload: {
        operationType: string;
        promptId: string;
        params: { mode: string; narrationSetId: string; blockId: string };
      };
    };
    expect(job.jobType).toBe("narration.transform");
    expect(job.payload.operationType).toBe("ai.narration");
    expect(job.payload.promptId).toBe("narration-block");
    expect(job.payload.params).toMatchObject({
      mode: "shorten",
      narrationSetId: setA,
      blockId: blockA,
    });
  });

  it("rejects regeneration when the source is not approved", async () => {
    const fake = editorDatabase();
    const { service } = createService(fake.database, {
      ...approvedStatus,
      approved: false,
    });
    await expect(
      service.regenerateBlock({
        ownerUserId,
        projectId,
        blockId: blockA,
        body: { mode: "shorten", expectedRevision: 0 },
        idempotencyKey: "transform-1",
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects regeneration beyond the pending-candidate cap", async () => {
    const pending = Array.from({ length: 5 }, (_, index) =>
      candidateRow({ id: `019ffbf1-eeee-7000-8000-0000000000${40 + index}` }),
    );
    const fake = editorDatabase({ candidateRows: pending });
    const { service } = createService(fake.database);
    await expect(
      service.regenerateBlock({
        ownerUserId,
        projectId,
        blockId: blockA,
        body: { mode: "shorten", expectedRevision: 0 },
        idempotencyKey: "transform-1",
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("is idempotent for the same idempotency key", async () => {
    const fake = editorDatabase();
    const { service } = createService(fake.database);
    const first = await service.regenerateBlock({
      ownerUserId,
      projectId,
      blockId: blockA,
      body: { mode: "regenerate", expectedRevision: 0 },
      idempotencyKey: "transform-dup",
      correlationId: createId(),
    });
    const second = await service.regenerateBlock({
      ownerUserId,
      projectId,
      blockId: blockA,
      body: { mode: "regenerate", expectedRevision: 0 },
      idempotencyKey: "transform-dup",
      correlationId: createId(),
    });
    expect(second.jobId).toBe(first.jobId);
    expect(fake.jobRows).toHaveLength(1);
  });
});

describe("PostgresNarrationService.acceptCandidate", () => {
  it("applies a pending candidate as a new block revision", async () => {
    const fake = editorDatabase({ candidateRows: [candidateRow()] });
    const { service } = createService(fake.database);
    const result = await service.acceptCandidate({
      ownerUserId,
      projectId,
      blockId: blockA,
      candidateId: candidateA,
      body: { expectedRevision: 0 },
      correlationId: createId(),
    });
    const block = fake.blocks.find((row) => row.id === blockA)!;
    expect(block.text).toBe("Where does a drying puddle go?");
    expect(block.revision).toBe(1);
    expect(block.origin).toBe("transform");
    const candidate = fake.candidates.find((row) => row.id === candidateA)!;
    expect(candidate.status).toBe("accepted");
    const set = fake.sets.find((row) => row.id === setA)!;
    expect(set.revision).toBe(1);
    expect(fake.revisions).toHaveLength(1);
    expect(
      fake.audits.some(
        (row) =>
          (row as { eventType: string }).eventType ===
          "narration.block_candidate_accepted",
      ),
    ).toBe(true);
    expect(result.set?.blocks[0]?.text).toBe("Where does a drying puddle go?");
  });

  it("rejects a stale candidate whose block revision changed", async () => {
    const fake = editorDatabase({
      candidateRows: [candidateRow()],
      narrationBlockRows: [narrationBlockRow({ revision: 2 })],
    });
    const { service } = createService(fake.database);
    await expect(
      service.acceptCandidate({
        ownerUserId,
        projectId,
        blockId: blockA,
        candidateId: candidateA,
        body: { expectedRevision: 0 },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects a candidate that is no longer pending", async () => {
    const fake = editorDatabase({
      candidateRows: [candidateRow({ status: "rejected" })],
    });
    const { service } = createService(fake.database);
    await expect(
      service.acceptCandidate({
        ownerUserId,
        projectId,
        blockId: blockA,
        candidateId: candidateA,
        body: { expectedRevision: 0 },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });
});

describe("PostgresNarrationService.rejectCandidate", () => {
  it("marks a pending candidate rejected without changing the block", async () => {
    const fake = editorDatabase({ candidateRows: [candidateRow()] });
    const { service } = createService(fake.database);
    const result = await service.rejectCandidate({
      ownerUserId,
      projectId,
      blockId: blockA,
      candidateId: candidateA,
      body: { expectedRevision: 0 },
      correlationId: createId(),
    });
    const candidate = fake.candidates.find((row) => row.id === candidateA)!;
    expect(candidate.status).toBe("rejected");
    const block = fake.blocks.find((row) => row.id === blockA)!;
    expect(block.revision).toBe(0);
    expect(
      fake.audits.some(
        (row) =>
          (row as { eventType: string }).eventType ===
          "narration.block_candidate_rejected",
      ),
    ).toBe(true);
    expect(result.set?.blocks[0]?.revision).toBe(0);
  });
});

describe("PostgresNarrationService.restoreBlockRevision", () => {
  it("restores an archived revision as a new current revision", async () => {
    const fake = editorDatabase({
      narrationBlockRows: [
        narrationBlockRow({ text: "Current text.", revision: 1, origin: "teacher_edit" }),
      ],
      revisionRows: [revisionRow()],
    });
    const { service } = createService(fake.database);
    const result = await service.restoreBlockRevision({
      ownerUserId,
      projectId,
      blockId: blockA,
      body: { revision: 0, expectedRevision: 0 },
      correlationId: createId(),
    });
    const block = fake.blocks.find((row) => row.id === blockA)!;
    expect(block.text).toBe(revisionRow().text);
    expect(block.revision).toBe(2);
    expect(block.origin).toBe("restore");
    expect(fake.revisions).toHaveLength(2);
    expect(
      fake.audits.some(
        (row) =>
          (row as { eventType: string }).eventType === "narration.block_restored",
      ),
    ).toBe(true);
    expect(result.set?.blocks[0]?.revision).toBe(2);
  });

  it("returns 404 for a missing archived revision", async () => {
    const fake = editorDatabase();
    const { service } = createService(fake.database);
    await expect(
      service.restoreBlockRevision({
        ownerUserId,
        projectId,
        blockId: blockA,
        body: { revision: 9, expectedRevision: 0 },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });
});

describe("PostgresNarrationService.listBlockRevisions", () => {
  it("returns the archived revisions for a block", async () => {
    const fake = editorDatabase({ revisionRows: [revisionRow()] });
    const { service } = createService(fake.database);
    const result = await service.listBlockRevisions({
      ownerUserId,
      projectId,
      blockId: blockA,
    });
    expect(result.revisions).toHaveLength(1);
    expect(result.revisions[0]).toMatchObject({
      blockId: blockA,
      revision: 0,
      origin: "generated",
    });
  });

  it("returns 404 for a block outside the tenant", async () => {
    const fake = editorDatabase();
    const { service } = createService(fake.database);
    await expect(
      service.listBlockRevisions({
        ownerUserId,
        projectId,
        blockId: "019ffbf1-eeee-7000-8000-00000000ffff",
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });
});

describe("PostgresNarrationService.current staleness", () => {
  it("reports a draft as current when nothing upstream changed", async () => {
    const fake = editorDatabase();
    const { service } = createService(fake.database);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.stale).toBe(false);
    expect(result.staleReason).toBeNull();
    expect(result.canEdit).toBe(true);
    expect(result.set?.blocks[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("flags the draft stale when the approved outline content changed", async () => {
    const fake = editorDatabase({
      narrationSetRows: [narrationSetRow({ outlineSetContentHash: "b".repeat(64) })],
    });
    const { service } = createService(fake.database);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.stale).toBe(true);
    expect(result.staleReason).toContain("outline");
  });

  it("flags the draft stale when the lesson configuration changed", async () => {
    const fake = editorDatabase({ configRows: [configRow({ version: 4 })] });
    const { service } = createService(fake.database);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.stale).toBe(true);
    expect(result.staleReason).toContain("configuration");
  });

  it("flags the draft stale when the source snapshot changed", async () => {
    const fake = editorDatabase();
    const { service } = createService(fake.database, {
      ...approvedStatus,
      contentHash: "c".repeat(64),
    });
    const result = await service.current({ ownerUserId, projectId });
    expect(result.stale).toBe(true);
    expect(result.staleReason).toContain("source");
  });

  it("surfaces pending block candidates", async () => {
    const fake = editorDatabase({ candidateRows: [candidateRow()] });
    const { service } = createService(fake.database);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      blockId: blockA,
      mode: "shorten",
      status: "pending",
    });
  });
});

describe("PostgresNarrationService.approve", () => {
  it("approves the working draft, supersedes other sets, and records an audit event", async () => {
    const { database, sets, audits } = editorDatabase({
      narrationSetRows: [
        narrationSetRow(),
        narrationSetRow({
          id: "019ffbf1-eeee-7000-8000-000000000029",
          status: "approved",
          revision: 4,
          idempotencyKey: "narration:key-old-approved",
        }),
      ],
    });
    const { service } = createService(database);
    const result = await service.approve({
      ownerUserId,
      projectId,
      body: { expectedRevision: 0 },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    expect(sets.find((row) => row.id === setA)?.status).toBe("approved");
    expect(
      sets.find((row) => row.id === "019ffbf1-eeee-7000-8000-000000000029")
        ?.status,
    ).toBe("superseded");
    expect(result.state).toBe("approved");
    expect(result.canApprove).toBe(false);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ eventType: "narration.approved" });
  });

  it("reports canApprove for a complete, current draft", async () => {
    const { database } = editorDatabase();
    const { service } = createService(database);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.canApprove).toBe(true);
  });

  it("rejects a stale expected revision", async () => {
    const { database } = editorDatabase();
    const { service } = createService(database);
    await expect(
      service.approve({
        ownerUserId,
        projectId,
        body: { expectedRevision: 3 },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects approval when there is no draft to approve", async () => {
    const { database } = editorDatabase({
      narrationSetRows: [narrationSetRow({ status: "approved" })],
    });
    const { service } = createService(database);
    await expect(
      service.approve({
        ownerUserId,
        projectId,
        body: { expectedRevision: 0 },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects approval when an approved outline section has no narration", async () => {
    const { database } = editorDatabase({
      narrationBlockRows: [
        narrationBlockRow({ outlineItemId: "019ffbf1-eeee-7000-8000-0000000000ff" }),
      ],
    });
    const { service } = createService(database);
    await expect(
      service.approve({
        ownerUserId,
        projectId,
        body: { expectedRevision: 0 },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects approval when a block cites neither the source nor a generated addition", async () => {
    const { database } = editorDatabase({
      narrationBlockRows: [
        narrationBlockRow({ sourceRefs: [], generatedAdditions: [] }),
      ],
    });
    const { service } = createService(database);
    await expect(
      service.approve({
        ownerUserId,
        projectId,
        body: { expectedRevision: 0 },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects approval of a draft that is stale against the approved outline", async () => {
    const { database } = editorDatabase({
      narrationSetRows: [
        narrationSetRow({ outlineSetContentHash: "c".repeat(64) }),
      ],
    });
    const { service } = createService(database);
    await expect(
      service.approve({
        ownerUserId,
        projectId,
        body: { expectedRevision: 0 },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects approval while narration generation is still running", async () => {
    const { database } = editorDatabase({
      jobRows: [
        {
          id: "019ffbf1-eeee-7000-8000-000000000060",
          projectId,
          ownerUserId,
          jobType: "narration.generate",
          state: "running",
          errorMetadata: null,
          createdAt: new Date("2026-08-17T11:00:00.000Z"),
          updatedAt: new Date("2026-08-17T11:00:00.000Z"),
        },
      ],
    });
    const { service } = createService(database);
    await expect(
      service.approve({
        ownerUserId,
        projectId,
        body: { expectedRevision: 0 },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });
});
