import { createHash } from "node:crypto";
import { createId, PublicError, serializeUtcTimestamp, type Identifier } from "@avlp/config";
import { groundingChecks, learningObjectiveSets, learningObjectives, lessonConfigurations, lessonOutlineItems, lessonOutlineSets, lessonSpecs, lessonVersions, narrationBlocks, narrationSets, projects, sourceSnapshots, type DatabaseClient, type DatabaseExecutor } from "@avlp/database";
import { lessonSpecSchema, lessonVersionCreateSchema, lessonVersionsResponseSchema, type LessonVersionsResponse } from "@avlp/schemas";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { CitationHistoryService } from "./citation-history.js";

type Scope = { ownerUserId: Identifier; projectId: Identifier };
export interface LessonVersionsService { create(input: Scope & { body: unknown; correlationId: Identifier }): Promise<LessonVersionsResponse>; list(input: Scope): Promise<LessonVersionsResponse>; }
export function canonicalJson(value: unknown): string { return JSON.stringify(canonical(value)); }
function canonical(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonical(nested)])); return value; }
export function lessonVersionContentHash(value: unknown): string { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }

export class PostgresLessonVersionsService implements LessonVersionsService {
  public constructor(private readonly database: DatabaseClient, private readonly citations: CitationHistoryService, private readonly now: () => Date = () => new Date()) {}
  public async create(input: Scope & { body: unknown; correlationId: Identifier }): Promise<LessonVersionsResponse> {
    const command = parse(lessonVersionCreateSchema, input.body); const now = this.now();
    await this.database.transaction(async (tx) => {
      // Serializes per-project numbering and pointer updates, including the
      // empty-history case where a row lock alone cannot prevent two v1 rows.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.projectId}))`);
      const state = await loadState(tx, input); ensureReady(state);
      const id = createId(now);
      const citation = await this.citations.snapshotForVersion({ executor: tx, ...input, lessonVersionId: id, lessonSpecId: state.storyboard.id as Identifier, lessonSpecRevision: state.storyboard.revision, groundingCheckId: state.groundingCheckId, sourceSnapshotId: state.source.id as Identifier, sourceSnapshotContentHash: state.source.contentHash, now });
      const snapshot = buildLessonVersionSnapshot(state, citation);
      // A version ID and its creation timestamp identify a persistence event,
      // not lesson content. Excluding them preserves deterministic hashes and
      // makes duplicate explicit saves idempotent.
      const hash = lessonVersionContentHash(hashableSnapshot(snapshot));
      const [existing] = await tx.select({ id: lessonVersions.id }).from(lessonVersions).where(and(eq(lessonVersions.ownerUserId, input.ownerUserId), eq(lessonVersions.projectId, input.projectId), eq(lessonVersions.contentHash, hash))).limit(1);
      let versionId = existing?.id;
      if (versionId === undefined) {
        const [created] = await tx.insert(lessonVersions).values({ id, ownerUserId: input.ownerUserId, projectId: input.projectId, versionNumber: await nextNumber(tx, input), reason: command.reason ?? "explicit_save", createdBy: input.ownerUserId, lessonSpecId: state.storyboard.id, lessonSpecRevision: state.storyboard.revision, sourceSnapshotId: state.source.id, configurationVersion: state.configuration.version, objectiveSetId: state.objectives.id, outlineSetId: state.outline.id, narrationSetId: state.narration.id, schemaVersion: "lesson-version-v1", sceneLibraryVersion: "mvp-v1", promptVersions: (snapshot as { versions: unknown }).versions, contentHash: hash, snapshot, createdAt: now }).onConflictDoNothing({ target: [lessonVersions.ownerUserId, lessonVersions.projectId, lessonVersions.contentHash] }).returning({ id: lessonVersions.id });
        versionId = created?.id;
        if (versionId === undefined) versionId = (await tx.select({ id: lessonVersions.id }).from(lessonVersions).where(and(eq(lessonVersions.ownerUserId, input.ownerUserId), eq(lessonVersions.projectId, input.projectId), eq(lessonVersions.contentHash, hash))).limit(1))[0]?.id;
        if (versionId === undefined) throw new Error("The lesson version could not be read after creation.");
        if (created !== undefined) await this.citations.persistSnapshot({ executor: tx, ownerUserId: input.ownerUserId, projectId: input.projectId, snapshot: citation, now });
      }
      await tx.update(projects).set({ currentLessonVersionId: versionId, updatedAt: now }).where(and(eq(projects.id, input.projectId), eq(projects.ownerUserId, input.ownerUserId)));
    }); return this.list(input);
  }
  public async list(input: Scope): Promise<LessonVersionsResponse> { const rows = await this.database.select().from(lessonVersions).where(and(eq(lessonVersions.ownerUserId, input.ownerUserId), eq(lessonVersions.projectId, input.projectId))).orderBy(desc(lessonVersions.versionNumber)); return lessonVersionsResponseSchema.parse({ versions: rows.map((row) => ({ id: row.id, versionNumber: row.versionNumber, reason: row.reason, contentHash: row.contentHash, createdBy: row.createdBy, createdAt: serializeUtcTimestamp(row.createdAt), lessonSpecId: row.lessonSpecId, lessonSpecRevision: row.lessonSpecRevision })), latestModifiedAt: rows[0] ? serializeUtcTimestamp(rows[0].createdAt) : null }); }
}

async function loadState(db: DatabaseExecutor, scope: Scope) {
  const [configuration] = await db.select().from(lessonConfigurations).where(and(eq(lessonConfigurations.ownerUserId, scope.ownerUserId), eq(lessonConfigurations.projectId, scope.projectId))).limit(1);
  const objectives = await approvedObjectives(db, scope); const outline = await approvedOutline(db, scope); const narration = await approvedNarration(db, scope); const storyboard = await workingStoryboard(db, scope);
  if (!configuration || !objectives || !outline || !narration || !storyboard) return { configuration, objectives, outline, narration, storyboard, source: undefined, objectiveItems: [], outlineItems: [], blocks: [], groundingCheckId: null };
  const [source] = await db.select().from(sourceSnapshots).where(and(eq(sourceSnapshots.id, objectives.sourceSnapshotId), eq(sourceSnapshots.ownerUserId, scope.ownerUserId), eq(sourceSnapshots.projectId, scope.projectId))).limit(1);
  const objectiveItems = await db.select().from(learningObjectives).where(and(eq(learningObjectives.setId, objectives.id), eq(learningObjectives.ownerUserId, scope.ownerUserId), eq(learningObjectives.projectId, scope.projectId))).orderBy(learningObjectives.order);
  const outlineItems = await db.select().from(lessonOutlineItems).where(and(eq(lessonOutlineItems.setId, outline.id), eq(lessonOutlineItems.ownerUserId, scope.ownerUserId), eq(lessonOutlineItems.projectId, scope.projectId))).orderBy(lessonOutlineItems.order);
  const blocks = await db.select().from(narrationBlocks).where(and(eq(narrationBlocks.setId, narration.id), eq(narrationBlocks.ownerUserId, scope.ownerUserId), eq(narrationBlocks.projectId, scope.projectId))).orderBy(narrationBlocks.order);
  const [check] = await db.select({ id: groundingChecks.id }).from(groundingChecks).where(and(eq(groundingChecks.ownerUserId, scope.ownerUserId), eq(groundingChecks.projectId, scope.projectId), eq(groundingChecks.lessonSpecId, storyboard.id), eq(groundingChecks.lessonSpecContentHash, storyboard.contentHash))).orderBy(desc(groundingChecks.createdAt)).limit(1);
  return { configuration, objectives, outline, narration, storyboard, source, objectiveItems, outlineItems, blocks, groundingCheckId: (check?.id as Identifier | undefined) ?? null };
}
async function approvedObjectives(db: DatabaseExecutor, scope: Scope) { return (await db.select().from(learningObjectiveSets).where(and(eq(learningObjectiveSets.ownerUserId, scope.ownerUserId), eq(learningObjectiveSets.projectId, scope.projectId), eq(learningObjectiveSets.status, "approved"))).orderBy(desc(learningObjectiveSets.generatedAt)).limit(1))[0]; }
async function approvedOutline(db: DatabaseExecutor, scope: Scope) { return (await db.select().from(lessonOutlineSets).where(and(eq(lessonOutlineSets.ownerUserId, scope.ownerUserId), eq(lessonOutlineSets.projectId, scope.projectId), eq(lessonOutlineSets.status, "approved"))).orderBy(desc(lessonOutlineSets.generatedAt)).limit(1))[0]; }
async function approvedNarration(db: DatabaseExecutor, scope: Scope) { return (await db.select().from(narrationSets).where(and(eq(narrationSets.ownerUserId, scope.ownerUserId), eq(narrationSets.projectId, scope.projectId), eq(narrationSets.status, "approved"))).orderBy(desc(narrationSets.generatedAt)).limit(1))[0]; }
async function workingStoryboard(db: DatabaseExecutor, scope: Scope) { const [draft] = await db.select().from(lessonSpecs).where(and(eq(lessonSpecs.ownerUserId, scope.ownerUserId), eq(lessonSpecs.projectId, scope.projectId), eq(lessonSpecs.status, "draft"))).orderBy(desc(lessonSpecs.generatedAt)).limit(1); if (draft) return draft; return (await db.select().from(lessonSpecs).where(and(eq(lessonSpecs.ownerUserId, scope.ownerUserId), eq(lessonSpecs.projectId, scope.projectId), eq(lessonSpecs.status, "approved"))).orderBy(desc(lessonSpecs.generatedAt)).limit(1))[0]; }
function ensureReady(state: Awaited<ReturnType<typeof loadState>>): asserts state is typeof state & { source: NonNullable<typeof state.source>; configuration: NonNullable<typeof state.configuration>; objectives: NonNullable<typeof state.objectives>; outline: NonNullable<typeof state.outline>; narration: NonNullable<typeof state.narration>; storyboard: NonNullable<typeof state.storyboard> } { if (!state.configuration || !state.objectives || !state.outline || !state.narration || !state.storyboard || !state.source || state.objectiveItems.length === 0 || state.outlineItems.length === 0 || state.blocks.length === 0) throw new PublicError("bad_request", "The approved lesson is not ready to save as a version.", 409); if (state.outline.sourceSnapshotId !== state.source.id || state.narration.sourceSnapshotId !== state.source.id || state.storyboard.basedOnNarrationSetId !== state.narration.id) throw new PublicError("bad_request", "The lesson planning artifacts are no longer aligned. Refresh them before saving a version.", 409); }
async function nextNumber(db: DatabaseExecutor, scope: Scope): Promise<number> { const [row] = await db.select({ value: sql<number>`coalesce(max(${lessonVersions.versionNumber}), 0)::int` }).from(lessonVersions).where(and(eq(lessonVersions.ownerUserId, scope.ownerUserId), eq(lessonVersions.projectId, scope.projectId))).for("update"); return (row?.value ?? 0) + 1; }
export function mediaReferences(value: unknown): string[] { return [...new Set(Array.from(JSON.stringify(value).matchAll(/"(?:assetId|objectId|contentHash)":"([^"]+)"/g), (match) => match[1]!))]; }
export function buildLessonVersionSnapshot(
  state: Awaited<ReturnType<typeof loadState>>,
  citation: unknown,
): unknown {
  ensureReady(state);
  return JSON.parse(JSON.stringify({
    schemaVersion: "lesson-version-v1",
    configuration: state.configuration,
    objectives: { set: state.objectives, items: state.objectiveItems },
    outline: { set: state.outline, items: state.outlineItems },
    narration: { set: state.narration, blocks: state.blocks },
    storyboard: state.storyboard.payload,
    lessonSpec: portableLessonSpec(state),
    sourceSnapshot: state.source.payload,
    citations: citation,
    mediaReferences: mediaReferences(state.storyboard.payload),
    versions: { lessonSpec: "1.8", sceneLibrary: "mvp-v1", prompts: { storyboard: state.storyboard.promptVersion, narration: state.narration.promptVersion } },
  })) as unknown;
}
function portableLessonSpec(state: Awaited<ReturnType<typeof loadState>>) { const value = state as typeof state & { configuration: NonNullable<typeof state.configuration>; storyboard: NonNullable<typeof state.storyboard> }; const parsed = lessonSpecSchema.safeParse({ schemaVersion: "1.8", lessonId: value.storyboard.id, projectId: value.storyboard.projectId, title: value.storyboard.title, subject: value.storyboard.subject, audience: { ageBand: value.configuration.ageBand, difficulty: value.configuration.difficulty, priorKnowledge: [] }, targetDurationSeconds: value.configuration.targetDurationSeconds, tone: value.configuration.tone, themeId: value.configuration.visualTheme, objectiveIds: value.storyboard.objectiveIds, voice: { providerVoiceId: "mvp-default", speakingRate: 1 }, scenes: (value.storyboard.payload as { scenes: Array<{ scene: unknown }> }).scenes.map((scene) => scene.scene) }); if (!parsed.success) throw new PublicError("bad_request", "The storyboard must be complete and grounded before saving a version.", 409); return parsed.data; }
function hashableSnapshot(snapshot: unknown): unknown { const value = snapshot as { citations: { lessonVersionId: unknown; createdAt: unknown } }; return { ...value, citations: { ...value.citations, lessonVersionId: undefined, createdAt: undefined } }; }
function parse<T>(schema: z.ZodType<T>, input: unknown): T { const parsed = schema.safeParse(input); if (!parsed.success) throw new PublicError("validation_failed", "Request validation failed.", 400); return parsed.data; }
