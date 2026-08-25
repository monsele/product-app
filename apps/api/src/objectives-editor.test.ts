import { describe, expect, it, vi } from "vitest";
import {
  auditEvents,
  learningObjectives,
  learningObjectiveSets,
  projects,
  sourceSnapshots,
  type DatabaseClient,
} from "@avlp/database";
import type { SourceApprovalStatus } from "@avlp/schemas";
import {
  PostgresObjectivesService,
  resolveSnapshotSourceRefs,
} from "./objectives.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const contentHash = "a".repeat(64);
const sectionId = "019ffbf1-1111-7000-8000-000000000001";
const blockA = "019ffbf1-2222-7000-8000-000000000001";
const blockB = "019ffbf1-2223-7000-8000-000000000001";
const setA = "019ffbf1-eeee-7000-8000-000000000020";
const objectiveA = "019ffbf1-eeee-7000-8000-000000000021";
const objectiveB = "019ffbf1-eeee-7000-8000-000000000022";

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
      blockIds: [blockA, blockB],
      figureIds: [],
      tableIds: [],
    },
  ],
  blocks: [
    {
      blockId: blockA,
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
      blockId: blockB,
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

function draftSetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: setA,
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: contentHash,
    configurationVersion: 3,
    promptId: "objectives",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000002",
    status: "draft",
    revision: 0,
    idempotencyKey: "objectives:key-1",
    keyConcepts: [],
    prerequisiteKnowledge: [],
    vocabulary: [],
    misconceptions: [],
    assessmentQuestions: [],
    generatedAt: new Date("2026-08-17T10:00:00.000Z"),
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    ...overrides,
  };
}

function objectiveRow(overrides: Record<string, unknown> = {}) {
  return {
    id: objectiveA,
    projectId,
    ownerUserId,
    setId: setA,
    order: 1,
    statement: "Describe how evaporation forms water vapour.",
    verb: "describe",
    confidence: 0.95,
    sourceRefs: [
      {
        documentId: "019ffbf1-3333-7000-8000-000000000001",
        parsedDocumentVersion: 1,
        pageStart: 1,
        pageEnd: 1,
        sectionId,
        blockIds: [blockA],
      },
    ],
    generated: true,
    revision: 0,
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    ...overrides,
  };
}

function secondObjectiveRow() {
  return {
    id: objectiveB,
    projectId,
    ownerUserId,
    setId: setA,
    order: 2,
    statement: "Explain how condensation forms clouds.",
    verb: "explain",
    confidence: 0.9,
    sourceRefs: [
      {
        documentId: "019ffbf1-3333-7000-8000-000000000001",
        parsedDocumentVersion: 1,
        pageStart: 2,
        pageEnd: 2,
        sectionId,
        blockIds: [blockB],
      },
    ],
    generated: true,
    revision: 0,
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
  };
}

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: projectId,
    ownerUserId,
    title: "Water cycle",
    stage: "objectives_review",
    revision: 1,
    deletedAt: null,
    ...overrides,
  };
}

type Comparison = { column: string; op: "=" | "<>"; value: unknown };

/**
 * Extracts equality/inequality comparisons from a Drizzle SQL node produced by
 * `eq(...)`, `and(...)`, or `sql\`col <> value\`` fragments. The node shape is
 * stable enough for the queries PostgresObjectivesService issues.
 */
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

/**
 * Resolves Drizzle SQL set-expressions (e.g. `revision + 1`) used by the
 * service against the current row value.
 */
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
  setRows?: Record<string, unknown>[];
  objectiveRows?: Record<string, unknown>[];
  projectRows?: Record<string, unknown>[];
  sourceSnapshotRows?: Record<string, unknown>[];
}) {
  const sets = [...(input.setRows ?? [])];
  const objectives = [...(input.objectiveRows ?? [])];
  const projectRows = [...(input.projectRows ?? [])];
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

  const select = (projection?: Record<string, unknown>) => ({
    from: (table: unknown) => ({
      where: (where: unknown) => {
        const comparisons = extractComparisons(where);
        const source =
          table === learningObjectiveSets
            ? sets
            : table === learningObjectives
              ? objectives
              : table === projects
                ? projectRows
                : table === sourceSnapshots
                  ? (input.sourceSnapshotRows ?? []).map((row) => ({
                      ...row,
                      payload: snapshotPayload,
                    }))
                  : [];
        const filtered = source.filter((row) => matches(row, comparisons));
        if (projection !== undefined && "count" in projection)
          return {
            then: (resolve: (value: unknown[]) => void) =>
              Promise.resolve([{ count: filtered.length }]).then(resolve),
          };
        if (projection !== undefined && "max" in projection) {
          const max = filtered.reduce((acc, row) => {
            const value = Number((row as Record<string, unknown>).order ?? 0);
            return Math.max(acc, value);
          }, 0);
          return {
            then: (resolve: (value: unknown[]) => void) =>
              Promise.resolve([{ max }]).then(resolve),
          };
        }
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
            if (table === learningObjectiveSets) sets.push(item);
            if (table === learningObjectives) objectives.push(item);
            if (table === auditEvents) audits.push(item);
          }
          return batch;
        },
        then: (resolve: (value: unknown[]) => void) => {
          const batch = Array.isArray(value) ? value : [value];
          for (const item of batch) {
            if (table === learningObjectiveSets) sets.push(item);
            if (table === learningObjectives) objectives.push(item);
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
        const collection =
          table === learningObjectiveSets
            ? sets
            : table === learningObjectives
              ? objectives
              : projectRows;
        const targets = collection.filter((row) => matches(row, comparisons));
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

  const deleteRow = (table: unknown) => ({
    where: (where: unknown) => {
      const comparisons = extractComparisons(where);
      const collection =
        table === learningObjectiveSets
          ? sets
          : table === learningObjectives
            ? objectives
            : [];
      const index = collection.findIndex((row) => matches(row, comparisons));
      const removed = index === -1 ? undefined : collection.splice(index, 1)[0];
      return {
        returning: async () => (removed === undefined ? [] : [{ id: removed.id }]),
      };
    },
  });

  let transactionQueue = Promise.resolve();
  const database = {
    client: {},
    select,
    insert,
    update,
    delete: deleteRow,
    transaction: (cb: (inner: unknown) => Promise<unknown>) => {
      const run = transactionQueue.then(() =>
        cb({ select, insert, update, delete: deleteRow }),
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
    objectives,
    projects: projectRows,
    audits,
  };
}

function createService(
  database: DatabaseClient,
  approval: SourceApprovalStatus = approvedStatus,
) {
  const sourceApprovalStatus = vi.fn(async () => approval);
  const service = new PostgresObjectivesService(
    database,
    sourceApprovalStatus,
    () => new Date("2026-08-17T10:00:00.000Z"),
  );
  return { service, sourceApprovalStatus };
}

describe("resolveSnapshotSourceRefs", () => {
  const snapshot = snapshotPayload as never;

  it("derives source refs from the approved snapshot", () => {
    const refs = resolveSnapshotSourceRefs(snapshot, [blockA, blockB]);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      documentId: "019ffbf1-4444-7000-8000-000000000001",
      parsedDocumentVersion: 1,
      pageStart: 1,
      pageEnd: 2,
      sectionId,
    });
    expect(refs[0]!.blockIds.sort()).toEqual([blockA, blockB].sort());
  });

  it("rejects unknown source blocks", () => {
    expect(() =>
      resolveSnapshotSourceRefs(
        snapshot,
        ["019ffbf1-9999-7000-8000-000000000001"],
      ),
    ).toThrow();
  });
});

describe("PostgresObjectivesService.add", () => {
  it("adds a teacher-authored objective to the draft set", async () => {
    const { database, objectives } = fakeDatabase({
      setRows: [draftSetRow()],
      objectiveRows: [objectiveRow()],
      projectRows: [projectRow()],
    });
    const { service } = createService(database);
    const result = await service.add({
      ownerUserId,
      projectId,
      body: {
        statement: "Label the water cycle stages.",
        verb: "label",
        expectedRevision: 0,
      },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    expect(result.set?.objectives).toHaveLength(2);
    const added = objectives.find(
      (row) => row.statement === "Label the water cycle stages.",
    );
    expect(added).toMatchObject({
      generated: false,
      revision: 0,
      order: 2,
      confidence: 1,
    });
    expect(objectives).toHaveLength(2);
  });

  it("adds a grounded objective when source block ids are provided", async () => {
    const { database, objectives } = fakeDatabase({
      setRows: [draftSetRow()],
      objectiveRows: [objectiveRow()],
      sourceSnapshotRows: [{ id: snapshotId, projectId, ownerUserId }],
    });
    const { service } = createService(database);
    await service.add({
      ownerUserId,
      projectId,
      body: {
        statement: "Label the water cycle stages.",
        verb: "label",
        sourceBlockIds: [blockB],
        expectedRevision: 0,
      },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    const added = objectives.find(
      (row) => row.statement === "Label the water cycle stages.",
    ) as { sourceRefs: Array<{ blockIds: string[] }> } | undefined;
    expect(added!.sourceRefs[0]!.blockIds).toEqual([blockB]);
  });

  it("rejects a stale expected revision", async () => {
    const { database } = fakeDatabase({
      setRows: [draftSetRow({ revision: 3 })],
      objectiveRows: [objectiveRow()],
    });
    const { service } = createService(database);
    await expect(
      service.add({
        ownerUserId,
        projectId,
        body: { statement: "x", verb: "label", expectedRevision: 0 },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects edits before any set exists", async () => {
    const { database } = fakeDatabase({});
    const { service } = createService(database);
    await expect(
      service.add({
        ownerUserId,
        projectId,
        body: { statement: "x", verb: "label", expectedRevision: 0 },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });
});

describe("PostgresObjectivesService.update", () => {
  it("edits an objective and bumps its revision", async () => {
    const { database, objectives } = fakeDatabase({
      setRows: [draftSetRow()],
      objectiveRows: [objectiveRow()],
    });
    const { service } = createService(database);
    const result = await service.update({
      ownerUserId,
      projectId,
      objectiveId: objectiveA,
      body: {
        statement: "Describe evaporation precisely.",
        expectedRevision: 0,
      },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    const edited = objectives.find((row) => row.id === objectiveA);
    expect(edited).toMatchObject({
      statement: "Describe evaporation precisely.",
      revision: 1,
    });
    expect(result.set?.objectives[0]?.statement).toBe(
      "Describe evaporation precisely.",
    );
  });

  it("resolves teacher-selected source blocks into source refs", async () => {
    const { database, objectives } = fakeDatabase({
      setRows: [draftSetRow()],
      objectiveRows: [objectiveRow()],
      sourceSnapshotRows: [{ id: snapshotId, projectId, ownerUserId }],
    });
    const { service } = createService(database);
    await service.update({
      ownerUserId,
      projectId,
      objectiveId: objectiveA,
      body: {
        statement: "Describe evaporation precisely.",
        sourceBlockIds: [blockB],
        expectedRevision: 0,
      },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    const edited = objectives.find((row) => row.id === objectiveA) as {
      sourceRefs: Array<{ blockIds: string[] }>;
    } | undefined;
    expect(edited?.sourceRefs).toHaveLength(1);
    expect(edited!.sourceRefs[0]!.blockIds).toEqual([blockB]);
  });

  it("rejects editing an objective from another set", async () => {
    const { database } = fakeDatabase({
      setRows: [draftSetRow()],
      objectiveRows: [],
    });
    const { service } = createService(database);
    await expect(
      service.update({
        ownerUserId,
        projectId,
        objectiveId: objectiveA,
        body: { statement: "x", expectedRevision: 0 },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });
});

describe("PostgresObjectivesService.remove", () => {
  it("removes an objective and renumbers the rest", async () => {
    const { database, objectives } = fakeDatabase({
      setRows: [draftSetRow()],
      objectiveRows: [objectiveRow(), secondObjectiveRow()],
    });
    const { service } = createService(database);
    const result = await service.remove({
      ownerUserId,
      projectId,
      objectiveId: objectiveA,
      body: { expectedRevision: 0 },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    expect(objectives).toHaveLength(1);
    expect(objectives[0]).toMatchObject({ id: objectiveB, order: 1 });
    expect(result.set?.objectives).toHaveLength(1);
  });
});

describe("PostgresObjectivesService.reorder", () => {
  it("reorders objectives while preserving ids and citations", async () => {
    const { database, objectives } = fakeDatabase({
      setRows: [draftSetRow()],
      objectiveRows: [objectiveRow(), secondObjectiveRow()],
    });
    const { service } = createService(database);
    const result = await service.reorder({
      ownerUserId,
      projectId,
      body: {
        objectiveIds: [objectiveB, objectiveA],
        expectedRevision: 0,
      },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    expect(result.set?.objectives.map((o) => o.id)).toEqual([
      objectiveB,
      objectiveA,
    ]);
    const a = objectives.find((row) => row.id === objectiveA) as {
      order: number;
      sourceRefs: Array<{ blockIds: string[] }>;
    } | undefined;
    const b = objectives.find((row) => row.id === objectiveB) as {
      order: number;
      sourceRefs: Array<{ blockIds: string[] }>;
    } | undefined;
    expect(b?.order).toBe(1);
    expect(a?.order).toBe(2);
    expect(a!.sourceRefs[0]!.blockIds).toEqual([blockA]);
    expect(b!.sourceRefs[0]!.blockIds).toEqual([blockB]);
  });

  it("rejects reorder lists that omit objectives", async () => {
    const { database } = fakeDatabase({
      setRows: [draftSetRow()],
      objectiveRows: [objectiveRow(), secondObjectiveRow()],
    });
    const { service } = createService(database);
    await expect(
      service.reorder({
        ownerUserId,
        projectId,
        body: { objectiveIds: [objectiveB], expectedRevision: 0 },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });
});

describe("PostgresObjectivesService.approve", () => {
  it("approves the draft set and supersedes all other sets", async () => {
    const { database, sets, projects } = fakeDatabase({
      setRows: [
        draftSetRow(),
        draftSetRow({
          id: "019ffbf1-eeee-7000-8000-000000000010",
          status: "approved",
          revision: 2,
          idempotencyKey: "objectives:key-old-approved",
        }),
        draftSetRow({
          id: "019ffbf1-eeee-7000-8000-000000000011",
          status: "draft",
          revision: 1,
          idempotencyKey: "objectives:key-stale-draft",
        }),
      ],
      objectiveRows: [objectiveRow()],
      projectRows: [projectRow()],
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
      sets.find((row) => row.id === "019ffbf1-eeee-7000-8000-000000000010")
        ?.status,
    ).toBe("superseded");
    expect(
      sets.find((row) => row.id === "019ffbf1-eeee-7000-8000-000000000011")
        ?.status,
    ).toBe("superseded");
    expect(projects[0]?.stage).toBe("outline_review");
    expect(result.state).toBe("approved");
  });

  it("preserves the approved set when a candidate draft exists until approval", async () => {
    const { database, sets } = fakeDatabase({
      setRows: [
        draftSetRow({
          id: "019ffbf1-eeee-7000-8000-000000000012",
          status: "approved",
          revision: 3,
          idempotencyKey: "objectives:key-approved-candidate",
        }),
        draftSetRow({
          id: setA,
          revision: 0,
          idempotencyKey: "objectives:key-candidate-draft",
        }),
      ],
      objectiveRows: [objectiveRow()],
      projectRows: [projectRow()],
    });
    const { service } = createService(database);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.state).toBe("draft");
    expect(result.approved?.id).toBe("019ffbf1-eeee-7000-8000-000000000012");
    expect(result.set?.id).toBe(setA);
    expect(sets.find((row) => row.id === "019ffbf1-eeee-7000-8000-000000000012")?.status).toBe("approved");
  });

  it("requires at least one objective", async () => {
    const { database } = fakeDatabase({
      setRows: [draftSetRow()],
      objectiveRows: [],
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

  it("rejects approving with a stale revision", async () => {
    const { database } = fakeDatabase({
      setRows: [draftSetRow({ revision: 5 })],
      objectiveRows: [objectiveRow()],
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

describe("PostgresObjectivesService approved-set editing", () => {
  it("clones the approved set into a new draft when the teacher edits", async () => {
    const { database, sets, objectives } = fakeDatabase({
      setRows: [
        draftSetRow({
          status: "approved",
          revision: 2,
          idempotencyKey: "objectives:key-approved",
        }),
      ],
      objectiveRows: [objectiveRow()],
    });
    const { service } = createService(database);
    const result = await service.add({
      ownerUserId,
      projectId,
      body: {
        statement: "Label the water cycle stages.",
        verb: "label",
        expectedRevision: 2,
      },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    const drafts = sets.filter((row) => row.status === "draft");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).not.toMatchObject({ id: setA });
    expect(sets.find((row) => row.id === setA)?.status).toBe("approved");
    expect(result.set?.status).toBe("draft");
    expect(result.set?.objectives).toHaveLength(2);
    const added = objectives.find(
      (row) => row.statement === "Label the water cycle stages.",
    );
    expect(added).toBeDefined();
  });

  it("serializes concurrent first-edits so only one draft is cloned", async () => {
    const { database, sets } = fakeDatabase({
      setRows: [
        draftSetRow({
          status: "approved",
          revision: 2,
          idempotencyKey: "objectives:key-approved",
        }),
      ],
      objectiveRows: [objectiveRow()],
    });
    const { service } = createService(database);
    const call = () =>
      service.add({
        ownerUserId,
        projectId,
        body: {
          statement: "Concurrent edit.",
          verb: "label",
          expectedRevision: 2,
        },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      });
    const [first, second] = await Promise.allSettled([call(), call()]);
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    const drafts = sets.filter((row) => row.status === "draft");
    expect(drafts).toHaveLength(1);
    expect(sets.find((row) => row.id === setA)?.status).toBe("approved");
  });
});

describe("PostgresObjectivesService audit events", () => {
  it("records an approval audit event", async () => {
    const { database, audits } = fakeDatabase({
      setRows: [draftSetRow()],
      objectiveRows: [objectiveRow()],
      projectRows: [projectRow()],
    });
    const { service } = createService(database);
    await service.approve({
      ownerUserId,
      projectId,
      body: { expectedRevision: 0 },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    expect(
      audits.some(
        (entry) => (entry as { eventType?: string }).eventType === "objectives.approved",
      ),
    ).toBe(true);
  });

  it("records an edit audit event", async () => {
    const { database, audits } = fakeDatabase({
      setRows: [draftSetRow()],
      objectiveRows: [objectiveRow()],
    });
    const { service } = createService(database);
    await service.add({
      ownerUserId,
      projectId,
      body: { statement: "x", verb: "label", expectedRevision: 0 },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    expect(
      audits.some(
        (entry) => (entry as { eventType?: string }).eventType === "objectives.edited",
      ),
    ).toBe(true);
  });
});
