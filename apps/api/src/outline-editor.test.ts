import { describe, expect, it, vi } from "vitest";
import {
  auditEvents,
  jobs,
  learningObjectives,
  learningObjectiveSets,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  outlineObjectiveLinks,
  projects,
  sourceSnapshots,
  type DatabaseClient,
} from "@avlp/database";
import type { SourceApprovalStatus } from "@avlp/schemas";
import { PostgresOutlineService } from "./outline.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const objectiveSetId = "019ffbf1-eeee-7000-8000-000000000002";
const objectiveA = "019ffbf1-eeee-7000-8000-000000000003";
const objectiveB = "019ffbf1-eeee-7000-8000-000000000004";
const objectiveC = "019ffbf1-eeee-7000-8000-000000000006";
const setA = "019ffbf1-eeee-7000-8000-000000000010";
const itemA = "019ffbf1-eeee-7000-8000-000000000020";
const itemB = "019ffbf1-eeee-7000-8000-000000000021";
const contentHash = "a".repeat(64);
const sectionId = "019ffbf1-1111-7000-8000-000000000001";
const blockA = "019ffbf1-2222-7000-8000-000000000001";
const blockB = "019ffbf1-2223-7000-8000-000000000001";

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

function sourceRef(blockIds: string[] = [blockA]) {
  return [
    {
      documentId: "019ffbf1-4444-7000-8000-000000000001",
      parsedDocumentVersion: 1,
      pageStart: 1,
      pageEnd: 1,
      sectionId,
      blockIds,
    },
  ];
}

function outlineSetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: setA,
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: contentHash,
    objectiveSetId,
    objectiveSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "outline",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
    status: "draft",
    revision: 0,
    idempotencyKey: "outline:key-1",
    totalEstimatedSeconds: 60,
    generatedAt: new Date("2026-08-17T10:00:00.000Z"),
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    ...overrides,
  };
}

function outlineItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: itemA,
    projectId,
    ownerUserId,
    setId: setA,
    order: 1,
    kind: "hook",
    title: "Where does the water go?",
    description: "Open with a question.",
    estimatedSeconds: 20,
    sourceRefs: [],
    framingNote: "Generated framing question.",
    generated: true,
    revision: 0,
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    ...overrides,
  };
}

function secondOutlineItemRow(overrides: Record<string, unknown> = {}) {
  return outlineItemRow({
    id: itemB,
    order: 2,
    kind: "concept",
    title: "Evaporation",
    description: "Explain evaporation.",
    estimatedSeconds: 40,
    sourceRefs: sourceRef(),
    framingNote: null,
    ...overrides,
  });
}

function outlineLinkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "019ffbf1-eeee-7000-8000-000000000030",
    projectId,
    ownerUserId,
    outlineItemId: itemA,
    objectiveId: objectiveA,
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    ...overrides,
  };
}

function secondOutlineLinkRow(overrides: Record<string, unknown> = {}) {
  return outlineLinkRow({
    id: "019ffbf1-eeee-7000-8000-000000000031",
    outlineItemId: itemB,
    objectiveId: objectiveB,
    ...overrides,
  });
}

function objectiveSetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: objectiveSetId,
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: contentHash,
    configurationVersion: 3,
    promptId: "objectives",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
    status: "approved",
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
    setId: objectiveSetId,
    order: 1,
    statement: "Describe how evaporation forms water vapour.",
    verb: "describe",
    confidence: 0.95,
    sourceRefs: sourceRef(),
    generated: true,
    revision: 0,
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    ...overrides,
  };
}

function secondObjectiveRow() {
  return objectiveRow({
    id: objectiveB,
    order: 2,
    statement: "Explain how condensation forms clouds.",
    verb: "explain",
  });
}

function thirdObjectiveRow() {
  return objectiveRow({
    id: objectiveC,
    order: 3,
    statement: "Recall how water moves through the cycle.",
    verb: "recall",
  });
}

function configRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "019ffbf1-eeee-7000-8000-000000000009",
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

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: projectId,
    ownerUserId,
    title: "Water cycle",
    stage: "outline_review",
    revision: 1,
    deletedAt: null,
    ...overrides,
  };
}

type Comparison = { column: string; op: "=" | "<>"; value: unknown };

function extractComparisons(
  node: unknown,
  out: Comparison[] = [],
): Comparison[] {
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
  setRows?: Record<string, unknown>[];
  itemRows?: Record<string, unknown>[];
  linkRows?: Record<string, unknown>[];
  objectiveRows?: Record<string, unknown>[];
  objectiveSetRows?: Record<string, unknown>[];
  configRows?: Record<string, unknown>[];
  projectRows?: Record<string, unknown>[];
  jobRows?: Record<string, unknown>[];
  sourceSnapshotRows?: Record<string, unknown>[];
}) {
  const sets = [...(input.setRows ?? [])];
  const items = [...(input.itemRows ?? [])];
  const links = [...(input.linkRows ?? [])];
  const objectives = [...(input.objectiveRows ?? [])];
  const objectiveSets = [...(input.objectiveSetRows ?? [])];
  const configs = [...(input.configRows ?? [])];
  const projectRows = [...(input.projectRows ?? [])];
  const jobRows = [...(input.jobRows ?? [])];
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

  const rowsFor = (table: unknown): Record<string, unknown>[] => {
    if (table === lessonOutlineSets) return sets;
    if (table === lessonOutlineItems) return items;
    if (table === outlineObjectiveLinks) return links;
    if (table === learningObjectives) return objectives;
    if (table === learningObjectiveSets) return objectiveSets;
    if (table === lessonConfigurations) return configs;
    if (table === projects) return projectRows;
    if (table === jobs) return jobRows;
    if (table === sourceSnapshots)
      return (input.sourceSnapshotRows ?? []).map((row) => ({
        ...row,
        payload: snapshotPayload,
      }));
    return [];
  };

  const select = (projection?: Record<string, unknown>) => ({
    from: (table: unknown) => ({
      where: (where: unknown) => {
        const comparisons = extractComparisons(where);
        const source = rowsFor(table);
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
        if (projection !== undefined && "total" in projection) {
          const total = filtered.reduce((acc, row) => {
            return (
              acc +
              Number((row as Record<string, unknown>).estimatedSeconds ?? 0)
            );
          }, 0);
          return {
            then: (resolve: (value: unknown[]) => void) =>
              Promise.resolve([{ total }]).then(resolve),
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
            if (table === lessonOutlineSets) sets.push(item as never);
            if (table === lessonOutlineItems) items.push(item as never);
            if (table === outlineObjectiveLinks) links.push(item as never);
            if (table === auditEvents) audits.push(item);
          }
          return batch;
        },
        then: (resolve: (value: unknown[]) => void) => {
          const batch = Array.isArray(value) ? value : [value];
          for (const item of batch) {
            if (table === lessonOutlineSets) sets.push(item as never);
            if (table === lessonOutlineItems) items.push(item as never);
            if (table === outlineObjectiveLinks) links.push(item as never);
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
          table === lessonOutlineSets
            ? sets
            : table === lessonOutlineItems
              ? items
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
        table === lessonOutlineItems
          ? items
          : table === outlineObjectiveLinks
            ? links
            : [];
      const targets = collection.filter((row) => matches(row, comparisons));
      for (const target of targets)
        collection.splice(collection.indexOf(target), 1);
      return {
        returning: async () => targets.map((row) => ({ id: row.id })),
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
    items,
    links,
    objectives,
    projects: projectRows,
    audits,
  };
}

function createService(database: DatabaseClient) {
  const sourceApprovalStatus = vi.fn(async () => approvedStatus);
  const service = new PostgresOutlineService(
    database,
    sourceApprovalStatus,
    () => new Date("2026-08-17T10:00:00.000Z"),
  );
  return { service, sourceApprovalStatus };
}

function draftFixture(extra: {
  setRows?: Record<string, unknown>[];
  itemRows?: Record<string, unknown>[];
  linkRows?: Record<string, unknown>[];
  objectiveRows?: Record<string, unknown>[];
  objectiveSetRows?: Record<string, unknown>[];
  configRows?: Record<string, unknown>[];
  projectRows?: Record<string, unknown>[];
  sourceSnapshotRows?: Record<string, unknown>[];
  jobRows?: Record<string, unknown>[];
} = {}) {
  return fakeDatabase({
    setRows: extra.setRows ?? [outlineSetRow()],
    itemRows: extra.itemRows ?? [outlineItemRow(), secondOutlineItemRow()],
    linkRows: extra.linkRows ?? [outlineLinkRow(), secondOutlineLinkRow()],
    objectiveRows:
      extra.objectiveRows ?? [objectiveRow(), secondObjectiveRow()],
    objectiveSetRows: extra.objectiveSetRows ?? [objectiveSetRow()],
    configRows: extra.configRows ?? [configRow()],
    projectRows: extra.projectRows ?? [projectRow()],
    sourceSnapshotRows:
      extra.sourceSnapshotRows ?? [
        { id: snapshotId, projectId, ownerUserId },
      ],
    jobRows: extra.jobRows ?? [],
  });
}

describe("PostgresOutlineService.add", () => {
  it("adds a teacher-authored item and recomputes totals", async () => {
    const { database, items, links } = draftFixture();
    const { service } = createService(database);
    const result = await service.add({
      ownerUserId,
      projectId,
      body: {
        kind: "concept",
        title: "Condensation",
        description: "Explain condensation.",
        estimatedSeconds: 40,
        objectiveIds: [objectiveA],
        expectedRevision: 0,
      },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    const added = items.find((row) => row.title === "Condensation");
    expect(added).toMatchObject({
      generated: false,
      revision: 0,
      order: 3,
      sourceRefs: [],
    });
    expect(items).toHaveLength(3);
    expect(links.some((row) => row.outlineItemId === added?.id)).toBe(true);
    expect(result.set?.totalEstimatedSeconds).toBe(100);
    expect(result.set?.revision).toBe(1);
  });

  it("resolves teacher-provided source blocks into source refs", async () => {
    const { database, items } = draftFixture();
    const { service } = createService(database);
    await service.add({
      ownerUserId,
      projectId,
      body: {
        kind: "concept",
        title: "Condensation",
        description: "Explain condensation.",
        estimatedSeconds: 40,
        objectiveIds: [objectiveA],
        sourceBlockIds: [blockB],
        expectedRevision: 0,
      },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    const added = items.find((row) => row.title === "Condensation") as {
      sourceRefs: Array<{ blockIds: string[] }>;
    } | undefined;
    expect(added?.sourceRefs).toHaveLength(1);
    expect(added!.sourceRefs[0]!.blockIds).toEqual([blockB]);
  });

  it("rejects objective links outside the approved set", async () => {
    const { database } = draftFixture();
    const { service } = createService(database);
    await expect(
      service.add({
        ownerUserId,
        projectId,
        body: {
          kind: "concept",
          title: "Condensation",
          description: "Explain condensation.",
          estimatedSeconds: 40,
          objectiveIds: ["019ffbf1-eeee-7000-8000-000000000099"],
          expectedRevision: 0,
        },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });

  it("rejects a stale expected revision", async () => {
    const { database } = draftFixture();
    const { service } = createService(database);
    await expect(
      service.add({
        ownerUserId,
        projectId,
        body: {
          kind: "concept",
          title: "Condensation",
          description: "Explain condensation.",
          estimatedSeconds: 40,
          objectiveIds: [objectiveA],
          expectedRevision: 4,
        },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("serializes concurrent adds so only one succeeds", async () => {
    const { database, items } = draftFixture();
    const { service } = createService(database);
    const call = () =>
      service.add({
        ownerUserId,
        projectId,
        body: {
          kind: "concept",
          title: "Concurrent add.",
          description: "Explain.",
          estimatedSeconds: 40,
          objectiveIds: [objectiveA],
          expectedRevision: 0,
        },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      });
    const [first, second] = await Promise.allSettled([call(), call()]);
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    expect(items).toHaveLength(3);
  });

  it("rejects edits before any outline set exists", async () => {
    const { database } = fakeDatabase({});
    const { service } = createService(database);
    await expect(
      service.add({
        ownerUserId,
        projectId,
        body: {
          kind: "concept",
          title: "Condensation",
          description: "Explain condensation.",
          estimatedSeconds: 40,
          objectiveIds: [objectiveA],
          expectedRevision: 0,
        },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });
});

describe("PostgresOutlineService.update", () => {
  it("edits an item, bumps its revision, and recomputes totals", async () => {
    const { database, items } = draftFixture();
    const { service } = createService(database);
    const result = await service.update({
      ownerUserId,
      projectId,
      itemId: itemA,
      body: {
        title: "Where does the rain go?",
        estimatedSeconds: 30,
        expectedRevision: 0,
      },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    const edited = items.find((row) => row.id === itemA);
    expect(edited).toMatchObject({
      title: "Where does the rain go?",
      estimatedSeconds: 30,
      revision: 1,
    });
    expect(result.set?.totalEstimatedSeconds).toBe(70);
  });

  it("keeps existing source refs when none are provided", async () => {
    const { database, items } = draftFixture();
    const { service } = createService(database);
    await service.update({
      ownerUserId,
      projectId,
      itemId: itemB,
      body: {
        title: "Evaporation in detail",
        expectedRevision: 0,
      },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    const edited = items.find((row) => row.id === itemB) as {
      sourceRefs: Array<{ blockIds: string[] }>;
    } | undefined;
    expect(edited?.sourceRefs[0]?.blockIds).toEqual([blockA]);
  });

  it("replaces objective links when objective ids are provided", async () => {
    const { database, links } = draftFixture();
    const { service } = createService(database);
    await service.update({
      ownerUserId,
      projectId,
      itemId: itemA,
      body: {
        objectiveIds: [objectiveA, objectiveB],
        expectedRevision: 0,
      },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    const itemLinks = links.filter((row) => row.outlineItemId === itemA);
    expect(itemLinks.map((row) => row.objectiveId).sort()).toEqual(
      [objectiveA, objectiveB].sort(),
    );
  });

  it("changes the item kind on update", async () => {
    const { database, items } = draftFixture();
    const { service } = createService(database);
    await service.update({
      ownerUserId,
      projectId,
      itemId: itemB,
      body: {
        kind: "summary",
        title: "Evaporation wrap-up",
        expectedRevision: 0,
      },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    const edited = items.find((row) => row.id === itemB);
    expect(edited).toMatchObject({ kind: "summary", revision: 1 });
  });

  it("rejects editing an item from another set", async () => {
    const { database } = draftFixture({ itemRows: [] });
    const { service } = createService(database);
    await expect(
      service.update({
        ownerUserId,
        projectId,
        itemId: itemA,
        body: { title: "x", expectedRevision: 0 },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });
});

describe("PostgresOutlineService.remove", () => {
  it("removes an item, renumbers the rest, and recomputes totals", async () => {
    const { database, items, links } = draftFixture();
    const { service } = createService(database);
    const result = await service.remove({
      ownerUserId,
      projectId,
      itemId: itemA,
      body: { expectedRevision: 0 },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: itemB, order: 1 });
    expect(links.every((row) => row.outlineItemId !== itemA)).toBe(true);
    expect(result.set?.totalEstimatedSeconds).toBe(40);
    expect(result.set?.items).toHaveLength(1);
  });

  it("rejects removing an item from another tenant", async () => {
    const { database } = draftFixture();
    const { service } = createService(database);
    await expect(
      service.remove({
        ownerUserId: "019ffbf1-bbbb-7000-8000-000000000001",
        projectId,
        itemId: itemA,
        body: { expectedRevision: 0 },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });
});

describe("PostgresOutlineService.reorder", () => {
  it("reorders items while preserving ids and citations", async () => {
    const { database, items } = draftFixture();
    const { service } = createService(database);
    const result = await service.reorder({
      ownerUserId,
      projectId,
      body: { itemIds: [itemB, itemA], expectedRevision: 0 },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    expect(result.set?.items.map((item) => item.id)).toEqual([itemB, itemA]);
    const a = items.find((row) => row.id === itemA) as {
      order: number;
      sourceRefs: Array<{ blockIds: string[] }>;
    } | undefined;
    const b = items.find((row) => row.id === itemB) as {
      order: number;
      sourceRefs: Array<{ blockIds: string[] }>;
    } | undefined;
    expect(b?.order).toBe(1);
    expect(a?.order).toBe(2);
    expect(a!.sourceRefs).toEqual([]);
    expect(b!.sourceRefs[0]!.blockIds).toEqual([blockA]);
  });

  it("rejects reorder lists that omit items", async () => {
    const { database } = draftFixture();
    const { service } = createService(database);
    await expect(
      service.reorder({
        ownerUserId,
        projectId,
        body: { itemIds: [itemB], expectedRevision: 0 },
        correlationId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });
});

describe("PostgresOutlineService.approve", () => {
  it("approves the draft and supersedes all other sets", async () => {
    const { database, sets, projects } = draftFixture({
      setRows: [
        outlineSetRow(),
        outlineSetRow({
          id: "019ffbf1-eeee-7000-8000-000000000011",
          status: "approved",
          revision: 2,
          idempotencyKey: "outline:key-old-approved",
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
      sets.find((row) => row.id === "019ffbf1-eeee-7000-8000-000000000011")
        ?.status,
    ).toBe("superseded");
    expect(projects[0]?.stage).toBe("narration_storyboard_review");
    expect(result.state).toBe("approved");
  });

  it("blocks approval when an approved objective is uncovered", async () => {
    const { database } = draftFixture({
      objectiveRows: [objectiveRow(), secondObjectiveRow(), thirdObjectiveRow()],
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

  it("blocks approval for a non-hook item without source refs", async () => {
    const { database } = draftFixture({
      itemRows: [
        outlineItemRow(),
        outlineItemRow({
          id: itemB,
          order: 2,
          kind: "concept",
          title: "Evaporation",
          sourceRefs: [],
          framingNote: null,
        }),
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

  it("blocks approval for an uncited hook without a framing note", async () => {
    const { database } = draftFixture({
      itemRows: [
        outlineItemRow({ framingNote: null }),
        secondOutlineItemRow(),
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

  it("blocks approval with a stale revision", async () => {
    const { database } = draftFixture();
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

  it("blocks approval while an outline generation job is in flight", async () => {
    const { database } = draftFixture({
      jobRows: [
        {
          id: "019ffbf1-eeee-7000-8000-000000000040",
          ownerUserId,
          projectId,
          jobType: "outline.generate",
          state: "running",
          errorMetadata: null,
          createdAt: new Date("2026-08-17T10:00:00.000Z"),
          updatedAt: new Date("2026-08-17T10:00:00.000Z"),
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

  it("requires at least one outline item", async () => {
    const { database } = draftFixture({ itemRows: [] });
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

describe("PostgresOutlineService approved-set editing", () => {
  it("clones the approved set into a new draft when the teacher edits", async () => {
    const { database, sets, items } = draftFixture({
      setRows: [
        outlineSetRow({ status: "approved", revision: 2, idempotencyKey: "outline:key-approved" }),
      ],
    });
    const { service } = createService(database);
    const result = await service.add({
      ownerUserId,
      projectId,
      body: {
        kind: "concept",
        title: "Condensation",
        description: "Explain condensation.",
        estimatedSeconds: 40,
        objectiveIds: [objectiveA],
        expectedRevision: 2,
      },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    const drafts = sets.filter((row) => row.status === "draft");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).not.toMatchObject({ id: setA });
    expect(sets.find((row) => row.id === setA)?.status).toBe("approved");
    expect(result.set?.status).toBe("draft");
    expect(result.set?.items).toHaveLength(3);
    const cloned = items.filter((row) => row.setId === drafts[0]?.id);
    expect(cloned.map((row) => row.order)).toEqual([1, 2, 3]);
    expect(items.find((row) => row.title === "Condensation")).toBeDefined();
  });

  it("serializes concurrent first-edits so only one draft is cloned", async () => {
    const { database, sets } = draftFixture({
      setRows: [
        outlineSetRow({ status: "approved", revision: 2, idempotencyKey: "outline:key-approved" }),
      ],
    });
    const { service } = createService(database);
    const call = () =>
      service.add({
        ownerUserId,
        projectId,
        body: {
          kind: "concept",
          title: "Concurrent edit.",
          description: "Explain.",
          estimatedSeconds: 40,
          objectiveIds: [objectiveA],
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

describe("PostgresOutlineService audit events", () => {
  it("records an approval audit event", async () => {
    const { database, audits } = draftFixture();
    const { service } = createService(database);
    await service.approve({
      ownerUserId,
      projectId,
      body: { expectedRevision: 0 },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    expect(
      audits.some(
        (entry) => (entry as { eventType?: string }).eventType === "outline.approved",
      ),
    ).toBe(true);
  });

  it("records an edit audit event", async () => {
    const { database, audits } = draftFixture();
    const { service } = createService(database);
    await service.add({
      ownerUserId,
      projectId,
      body: {
        kind: "concept",
        title: "Condensation",
        description: "Explain condensation.",
        estimatedSeconds: 40,
        objectiveIds: [objectiveA],
        expectedRevision: 0,
      },
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    expect(
      audits.some(
        (entry) => (entry as { eventType?: string }).eventType === "outline.edited",
      ),
    ).toBe(true);
  });
});

describe("PostgresOutlineService.current validation", () => {
  it("reports uncovered objectives on the draft", async () => {
    const { database } = draftFixture({
      objectiveRows: [objectiveRow(), secondObjectiveRow(), thirdObjectiveRow()],
    });
    const { service } = createService(database);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.validation.structurallyValid).toBe(true);
    expect(result.validation.uncoveredObjectiveIds).toEqual([objectiveC]);
    expect(result.canApprove).toBe(false);
  });

  it("reports a duration warning outside the tolerance", async () => {
    const { database } = draftFixture({
      setRows: [
        outlineSetRow({ totalEstimatedSeconds: 30 }),
      ],
    });
    const { service } = createService(database);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.validation.durationStatus).toBe("under");
    expect(result.validation.durationWarning).toContain("lesson target");
    expect(result.canApprove).toBe(true);
  });

  it("reports an empty draft as structurally invalid", async () => {
    const { database } = draftFixture({ itemRows: [] });
    const { service } = createService(database);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.validation.structurallyValid).toBe(false);
    expect(result.canApprove).toBe(false);
  });
});
