import { describe, expect, it, vi } from "vitest";
import { createId } from "@avlp/config";
import {
  citationHistorySnapshots,
  lessonSpecs,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import {
  citationHistorySnapshotSchema,
  lessonStoryboardSchema,
} from "@avlp/schemas";
import {
  PostgresCitationHistoryService,
  type CitationHistoryService,
} from "./citation-history.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const lessonSpecId = "019ffbf1-eeee-7000-8000-000000000040";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const lessonVersionId = "019ffbf1-eeee-7000-8000-000000000045";
const groundingCheckId = "019ffbf1-eeee-7000-8000-000000000070";
const sceneId = "019ffbf1-eeee-7000-8000-000000000050";
const blockA = "019ffbf1-eeee-7000-8000-000000000021";
const contentHash = "a".repeat(64);
const now = new Date("2026-08-18T10:00:00.000Z");

function lessonSpecPayload() {
  return lessonStoryboardSchema.parse({
    schemaVersion: 1,
    id: lessonSpecId,
    projectId,
    basedOnNarrationSetId: "019ffbf1-eeee-7000-8000-000000000020",
    narrationSetContentHash: "c".repeat(64),
    outlineSetId: "019ffbf1-eeee-7000-8000-000000000002",
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "storyboard",
    promptVersion: "v1",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
    status: "draft",
    revision: 0,
    title: "The water cycle",
    subject: "Science",
    targetDurationSeconds: 180,
    totalDurationSeconds: 30,
    objectiveIds: ["019ffbf1-eeee-7000-8000-000000000009"],
    contentHash: "d".repeat(64),
    scenes: [
      {
        id: sceneId,
        stableSceneId: sceneId,
        order: 1,
        template: "definition",
        durationSeconds: 30,
        narrationBlockIds: [blockA],
        assetRequirements: [],
        scene: {
          id: sceneId,
          order: 1,
          narration:
            "Water evaporates when heated and rises as water vapour into the sky.",
          durationSeconds: 30,
          onScreenText: ["Key term"],
          transition: "cut",
          assetBindings: [],
          sourceRefs: [
            {
              documentId: "019ffbf1-3333-7000-8000-000000000001",
              parsedDocumentVersion: 1,
              pageStart: 1,
              pageEnd: 1,
              sectionId: "019ffbf1-2222-7000-8000-000000000001",
              blockIds: [blockA],
            },
          ],
          generatedAdditions: [],
          template: "definition",
          visual: { term: "Evaporation", definition: "A liquid becoming a gas." },
        },
      },
    ],
    generatedAt: "2026-08-18T10:00:00.000Z",
    createdAt: "2026-08-18T10:00:00.000Z",
  });
}

function lessonSpecRow() {
  return {
    id: lessonSpecId,
    projectId,
    ownerUserId,
    schemaVersion: "storyboard-v1",
    basedOnNarrationSetId: "019ffbf1-eeee-7000-8000-000000000020",
    narrationSetContentHash: "c".repeat(64),
    outlineSetId: "019ffbf1-eeee-7000-8000-000000000002",
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "storyboard",
    promptVersion: "v1",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
    status: "draft",
    revision: 0,
    idempotencyKey: "storyboard:key-1",
    title: "The water cycle",
    subject: "Science",
    targetDurationSeconds: 180,
    totalDurationSeconds: 30,
    objectiveIds: ["019ffbf1-eeee-7000-8000-000000000009"],
    contentHash: "d".repeat(64),
    payload: lessonSpecPayload(),
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function fakeDatabase() {
  const rowsByVersion = new Map<string, { id: string }>();
  const inserts: Array<{ table: unknown; value: unknown }> = [];
  const insert = (table: unknown) => ({
    values: (value: unknown) => {
      inserts.push({ table, value });
      const chain = {
        onConflictDoNothing: () => chain,
        returning: async () => {
          if (table === citationHistorySnapshots) {
            const versionId = (value as { lessonVersionId: string })
              .lessonVersionId;
            if (rowsByVersion.has(versionId)) return [];
            const id = (value as { id: string }).id;
            rowsByVersion.set(versionId, { id });
            return [{ id }];
          }
          return [{ id: createId() }];
        },
        then: (resolve: (rows: never[]) => void) =>
          Promise.resolve([]).then(resolve),
      };
      return chain;
    },
  });
  const select = () => ({
    from: (table: unknown) => {
      if (table === lessonSpecs)
        return {
          where: () => ({
            orderBy: () => ({
              limit: async () => [lessonSpecRow()],
            }),
          }),
        };
      return {
        where: () => ({
          limit: async () => {
            const value = [...rowsByVersion.values()].at(-1);
            return value === undefined ? [] : [value];
          },
        }),
      };
    },
  });
  return {
    client: {},
    insert,
    select,
    rowsByVersion,
    inserts,
  } as unknown as DatabaseClient & {
    rowsByVersion: Map<string, { id: string }>;
    inserts: Array<{ table: unknown; value: unknown }>;
  };
}

function createService(database: DatabaseClient & { rowsByVersion: Map<string, { id: string }> }) {
  const resolveSourceRefs = vi.fn(
    async (): Promise<import("@avlp/schemas").ResolvedCitation[]> => [
      {
        documentId: "019ffbf1-3333-7000-8000-000000000001",
        parsedDocumentVersion: 1,
        pageStart: 1,
        pageEnd: 1,
        sectionId: "019ffbf1-2222-7000-8000-000000000001",
        sectionHeading: "Water cycle",
        blocks: [
          {
            blockId: blockA,
            sectionId: "019ffbf1-2222-7000-8000-000000000001",
            kind: "paragraph",
            page: 1,
            text: "Water evaporates when heated and rises as water vapour into the sky.",
          },
        ],
        figures: [],
        tables: [],
        issues: [],
      },
    ],
  );
  const service: CitationHistoryService = new PostgresCitationHistoryService(
    database,
    resolveSourceRefs,
  );
  return { service, resolveSourceRefs };
}

describe("PostgresCitationHistoryService.persistSnapshot", () => {
  it("persists an immutable tenant-scoped snapshot for a lesson version", async () => {
    const database = fakeDatabase();
    const { service } = createService(database);
    const snapshot = citationHistorySnapshotSchema.parse({
      schemaVersion: "citation-history-v1",
      lessonVersionId,
      lessonSpecId,
      lessonSpecRevision: 0,
      sourceSnapshotId: snapshotId,
      sourceSnapshotContentHash: contentHash,
      sceneCitations: [],
      groundingCheckId,
      createdAt: now.toISOString(),
    });
    const result = await service.persistSnapshot({
      executor: database as unknown as DatabaseExecutor,
      ownerUserId,
      projectId,
      snapshot,
      now,
    });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    const row = database.inserts[0]!.value as {
      lessonVersionId: string;
      sceneCitations: unknown[];
      groundingCheckId: string;
      sourceSnapshotContentHash: string;
    };
    expect(row.lessonVersionId).toBe(lessonVersionId);
    expect(row.sceneCitations).toEqual([]);
    expect(row.groundingCheckId).toBe(groundingCheckId);
    expect(row.sourceSnapshotContentHash).toBe(contentHash);
  });

  it("returns the existing snapshot when the same version is snapshotted again", async () => {
    const database = fakeDatabase();
    const { service } = createService(database);
    const snapshot = citationHistorySnapshotSchema.parse({
      schemaVersion: "citation-history-v1",
      lessonVersionId,
      lessonSpecId,
      lessonSpecRevision: 0,
      sourceSnapshotId: snapshotId,
      sourceSnapshotContentHash: contentHash,
      sceneCitations: [],
      groundingCheckId,
      createdAt: now.toISOString(),
    });
    const first = await service.persistSnapshot({
      executor: database as unknown as DatabaseExecutor,
      ownerUserId,
      projectId,
      snapshot,
      now,
    });
    const second = await service.persistSnapshot({
      executor: database as unknown as DatabaseExecutor,
      ownerUserId,
      projectId,
      snapshot: {
        ...snapshot,
        groundingCheckId: null,
        createdAt: new Date("2026-08-18T11:00:00.000Z").toISOString(),
      },
      now: new Date("2026-08-18T11:00:00.000Z"),
    });
    expect(second.id).toBe(first.id);
    expect(database.rowsByVersion.size).toBe(1);
  });

  it("preserves the original citation history for older versions", async () => {
    const database = fakeDatabase();
    const { service } = createService(database);
    const olderSnapshot = citationHistorySnapshotSchema.parse({
      schemaVersion: "citation-history-v1",
      lessonVersionId: "019ffbf1-eeee-7000-8000-000000000046",
      lessonSpecId,
      lessonSpecRevision: 0,
      sourceSnapshotId: snapshotId,
      sourceSnapshotContentHash: contentHash,
      sceneCitations: [
        {
          sceneId,
          citations: [
            {
              documentId: "019ffbf1-3333-7000-8000-000000000001",
              parsedDocumentVersion: 1,
              pageStart: 1,
              pageEnd: 1,
              sectionId: "019ffbf1-2222-7000-8000-000000000001",
              sectionHeading: "Water cycle",
              blocks: [
                {
                  blockId: blockA,
                  sectionId: "019ffbf1-2222-7000-8000-000000000001",
                  kind: "paragraph",
                  page: 1,
                  text: "Water evaporates when heated and rises as water vapour into the sky.",
                },
              ],
              figures: [],
              tables: [],
              issues: [],
            },
          ],
          generatedAdditions: [],
        },
      ],
      groundingCheckId,
      createdAt: "2026-08-18T09:00:00.000Z",
    });
    await service.persistSnapshot({
      executor: database as unknown as DatabaseExecutor,
      ownerUserId,
      projectId,
      snapshot: olderSnapshot,
      now,
    });
    const olderRow = database.inserts[0]!.value as {
      sceneCitations: unknown[];
      groundingCheckId: string;
    };
    expect(olderRow.sceneCitations).toHaveLength(1);
    expect(olderRow.groundingCheckId).toBe(groundingCheckId);
    expect(database.rowsByVersion.size).toBe(1);
  });
});

describe("PostgresCitationHistoryService.snapshotForVersion", () => {
  it("builds a snapshot with resolved scene citations and the grounding check", async () => {
    const database = fakeDatabase();
    const { service, resolveSourceRefs } = createService(database);
    const snapshot = await service.snapshotForVersion({
      ownerUserId,
      projectId,
      lessonVersionId,
      groundingCheckId,
      sourceSnapshotId: snapshotId,
      sourceSnapshotContentHash: contentHash,
      now,
    });
    expect(snapshot.lessonVersionId).toBe(lessonVersionId);
    expect(snapshot.lessonSpecId).toBe(lessonSpecId);
    expect(snapshot.lessonSpecRevision).toBe(0);
    expect(snapshot.sourceSnapshotContentHash).toBe(contentHash);
    expect(snapshot.groundingCheckId).toBe(groundingCheckId);
    expect(snapshot.sceneCitations).toHaveLength(1);
    expect(snapshot.sceneCitations[0]!.sceneId).toBe(sceneId);
    expect(resolveSourceRefs).toHaveBeenCalledTimes(1);
  });
});
