import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { InMemoryOwnerScopedProjectRepository, ProjectAuthorizationService, createCrossUserProjectFixture, type AuthGateway } from "@avlp/auth";
import { createId } from "@avlp/config";
import { assertCurrentVersion, buildLessonVersionSnapshot, canonicalJson, lessonVersionContentHash, mediaReferences, prepareRestoredSnapshot, restoredStoryboardDraft } from "./lesson-versions.js";
import { createApp, sessionCookieName } from "./app.js";

describe("lesson version canonical serialization", () => {
  it("hashes equivalent object-key order deterministically without changing array order", () => {
    const first = { storyboard: { title: "Water cycle", scenes: [{ id: "a" }, { id: "b" }] }, configuration: { tone: "calm", subject: "Science" } };
    const reorderedKeys = { configuration: { subject: "Science", tone: "calm" }, storyboard: { scenes: [{ id: "a" }, { id: "b" }], title: "Water cycle" } };
    expect(canonicalJson(first)).toBe(canonicalJson(reorderedKeys));
    expect(lessonVersionContentHash(first)).toBe(lessonVersionContentHash(reorderedKeys));
    expect(lessonVersionContentHash(first)).not.toBe(lessonVersionContentHash({ ...first, storyboard: { ...first.storyboard, scenes: [...first.storyboard.scenes].reverse() } }));
  });
});

it("stores media as immutable identifiers rather than binaries", () => {
  expect(mediaReferences({ assetId: "asset-1", nested: { objectId: "object-2", contentHash: "a".repeat(64) }, bytes: "not-a-reference" })).toEqual(["asset-1", "object-2", "a".repeat(64)]);
});

it("includes every approved input and portable LessonSpec in a snapshot", () => {
  const id = "019ffbf1-eeee-7000-8000-000000000045";
  const state = {
    configuration: { version: 2, ageBand: "11-13", difficulty: "introductory", targetDurationSeconds: 180, tone: "friendly", visualTheme: "mvp-default" },
    objectives: { id }, outline: { id, sourceSnapshotId: id }, narration: { id, sourceSnapshotId: id, promptVersion: "narration-v1" },
    storyboard: { id, projectId: id, title: "Water", subject: "Science", objectiveIds: [id], schemaVersion: "storyboard-v1", promptVersion: "storyboard-v1", basedOnNarrationSetId: id, payload: { scenes: [{ scene: { id, order: 1, narration: "Water moves.", durationSeconds: 30, onScreenText: [], transition: "cut", assetBindings: [], sourceRefs: [{ documentId: id, parsedDocumentVersion: 1, pageStart: 1, sectionId: id, blockIds: [id] }], generatedAdditions: [], template: "definition", visual: { term: "Water", definition: "H2O" } } }] } },
    source: { id, payload: { source: "immutable" } }, objectiveItems: [{ id }], outlineItems: [{ id }], blocks: [{ id }], groundingCheckId: null,
  } as unknown as Parameters<typeof buildLessonVersionSnapshot>[0];
  const snapshot = buildLessonVersionSnapshot(state, { sceneCitations: [] }) as Record<string, unknown>;
  expect(snapshot).toMatchObject({ configuration: { version: 2 }, objectives: { items: [{ id }] }, outline: { items: [{ id }] }, narration: { blocks: [{ id }] }, sourceSnapshot: { source: "immutable" }, citations: { sceneCitations: [] } });
  expect((snapshot.lessonSpec as { schemaVersion: string }).schemaVersion).toBe("1.8");
});

it("clones a compatible historical snapshot without mutating it", () => {
  const id = "019ffbf1-eeee-7000-8000-000000000045";
  const snapshot = buildLessonVersionSnapshot({ configuration: { version: 2, ageBand: "11-13", difficulty: "introductory", targetDurationSeconds: 180, tone: "friendly", visualTheme: "mvp-default" }, objectives: { id }, outline: { id, sourceSnapshotId: id }, narration: { id, sourceSnapshotId: id, promptVersion: "narration-v1" }, storyboard: { id, projectId: id, title: "Water", subject: "Science", objectiveIds: [id], promptVersion: "storyboard-v1", basedOnNarrationSetId: id, payload: { scenes: [{ scene: { id, order: 1, narration: "Water moves.", durationSeconds: 30, onScreenText: [], transition: "cut", assetBindings: [], sourceRefs: [{ documentId: id, parsedDocumentVersion: 1, pageStart: 1, sectionId: id, blockIds: [id] }], generatedAdditions: [], template: "definition", visual: { term: "Water", definition: "H2O" } } }] } }, source: { id, payload: {} }, objectiveItems: [{ id }], outlineItems: [{ id }], blocks: [{ id }], groundingCheckId: null } as unknown as Parameters<typeof buildLessonVersionSnapshot>[0], { sceneCitations: [] });
  const restored = prepareRestoredSnapshot(snapshot, id, id, (snapshot as { storyboard: unknown }).storyboard, (snapshot as { lessonSpec: unknown }).lessonSpec) as { restoredFromVersionId: string; lessonSpec: unknown };
  expect(restored.restoredFromVersionId).toBe(id);
  expect(restored.lessonSpec).toEqual((snapshot as { lessonSpec: unknown }).lessonSpec);
  expect(snapshot).not.toHaveProperty("restoredFromVersionId");
  const validStoryboard = { schemaVersion: 1, id, projectId: id, basedOnNarrationSetId: id, narrationSetContentHash: "a".repeat(64), outlineSetId: id, outlineSetContentHash: "b".repeat(64), configurationVersion: 2, promptId: "storyboard", promptVersion: "v1", model: "mock", modelCallId: id, status: "draft", revision: 0, title: "Water", subject: "Science", targetDurationSeconds: 180, totalDurationSeconds: 30, objectiveIds: [id], contentHash: "c".repeat(64), generatedAt: "2026-08-23T00:00:00.000Z", createdAt: "2026-08-23T00:00:00.000Z", scenes: [{ id, stableSceneId: id, order: 1, template: "definition", durationSeconds: 30, narrationBlockIds: [id], assetRequirements: [], scene: { id, order: 1, narration: "Water moves.", durationSeconds: 30, onScreenText: [], transition: "cut", assetBindings: [], sourceRefs: [{ documentId: id, parsedDocumentVersion: 1, pageStart: 1, sectionId: id, blockIds: [id] }], generatedAdditions: [], template: "definition", visual: { term: "Water", definition: "H2O" } } }] };
  const draft = restoredStoryboardDraft({ storyboard: validStoryboard, lessonSpec: (snapshot as { lessonSpec: unknown }).lessonSpec }, "019ffbf1-eeee-7000-8000-000000000046", new Date("2026-08-23T00:00:00.000Z"));
  expect(draft.scenes[0]!.id).not.toBe(id);
  expect(draft.scenes[0]!.scene.id).toBe(draft.scenes[0]!.id);
  expect(() => prepareRestoredSnapshot({ schemaVersion: "lesson-version-v0" }, id, id, {}, {})).toThrow("incompatible or corrupt");
});

it("rejects a restore confirmation when the current-version pointer is stale", () => {
  const current = createId();
  const stale = createId();
  expect(() => assertCurrentVersion(current, stale)).toThrow("changed while you were reviewing");
  expect(() => assertCurrentVersion(current, current)).not.toThrow();
});

it("enforces immutable version rows and serializes concurrent version creation in the migration/service", () => {
  const migration = readFileSync(join(process.cwd(), "../../packages/database/drizzle/0045_orange_scourge.sql"), "utf8");
  expect(migration).toContain("BEFORE UPDATE OR DELETE ON \"lesson_versions\"");
  const implementation = readFileSync(join(process.cwd(), "src/lesson-versions.ts"), "utf8");
  expect(implementation).toContain("pg_advisory_xact_lock");
  expect(implementation).toContain("onConflictDoNothing");
});

describe("lesson version routes", () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => { await app?.close(); });
  it("uses the authorized tenant scope for explicit saves and lists", async () => {
    const fixture = createCrossUserProjectFixture();
    const create = vi.fn(async () => ({ versions: [], latestModifiedAt: null, currentVersionId: null }));
    const list = vi.fn(async () => ({ versions: [], latestModifiedAt: null, currentVersionId: null }));
    const detail = vi.fn();
    const restore = vi.fn();
    const authGateway: AuthGateway = { register: async () => { throw new Error("unused"); }, signIn: async () => null, currentSession: async (token) => token === "owner" ? { id: fixture.ownerUserId, email: "owner@test", displayName: "Owner" } : token === "other" ? { id: fixture.otherUserId, email: "other@test", displayName: "Other" } : null, signOut: async () => {}, requestPasswordReset: async () => {}, confirmPasswordReset: async () => {} };
    app = await createApp({ authGateway, projectAuthorizer: new ProjectAuthorizationService(new InMemoryOwnerScopedProjectRepository([fixture.project])), lessonVersionsService: { create, list, detail, restore } });
    const server = app.getHttpAdapter().getInstance();
    const post = await server.inject({ method: "POST", url: `/projects/${fixture.projectId}/versions`, cookies: { [sessionCookieName]: "owner" }, payload: { reason: "explicit_save" }, headers: { "x-correlation-id": createId() } });
    expect(post.statusCode).toBe(201); expect(create).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: fixture.ownerUserId, projectId: fixture.projectId, body: { reason: "explicit_save" } }));
    const get = await server.inject({ method: "GET", url: `/projects/${fixture.projectId}/versions`, cookies: { [sessionCookieName]: "owner" } });
    expect(get.statusCode).toBe(200); expect(list).toHaveBeenCalledWith({ ownerUserId: fixture.ownerUserId, projectId: fixture.projectId });
    const foreign = await server.inject({ method: "GET", url: `/projects/${fixture.projectId}/versions`, cookies: { [sessionCookieName]: "other" } });
    expect(foreign.statusCode).toBe(404); expect(list).toHaveBeenCalledTimes(1);
    const detailResponse = await server.inject({ method: "GET", url: `/projects/${fixture.projectId}/versions/${fixture.projectId}`, cookies: { [sessionCookieName]: "owner" } });
    expect(detailResponse.statusCode).toBe(200); expect(detail).toHaveBeenCalledWith(expect.objectContaining({ versionId: fixture.projectId }));
    const restored = await server.inject({ method: "POST", url: `/projects/${fixture.projectId}/versions/${fixture.projectId}/restore`, cookies: { [sessionCookieName]: "owner" }, payload: { expectedCurrentVersionId: null, confirmReplace: true } });
    expect(restored.statusCode).toBe(201); expect(restore).toHaveBeenCalledWith(expect.objectContaining({ versionId: fixture.projectId, body: { expectedCurrentVersionId: null, confirmReplace: true } }));
  });
});
