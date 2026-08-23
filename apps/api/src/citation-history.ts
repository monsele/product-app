import { createId, type Identifier } from "@avlp/config";
import {
  citationHistorySnapshots,
  lessonSpecs,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import {
  citationHistorySnapshotSchema,
  lessonStoryboardSchema,
  sceneCitationsResponseSchema,
  type CitationHistorySnapshot,
  type SceneCitationsResponse,
  type SourceRef,
} from "@avlp/schemas";
import { and, desc, eq } from "drizzle-orm";
import type { SourceSnapshotService } from "./source-snapshot.js";

/**
 * Citation-history preservation (ST-053 / PRD E19-US2, E20-US1).
 *
 * Lesson versions must retain the citation/grounding state that existed when
 * the version was created. This module owns that persistence: an immutable,
 * tenant-scoped row per lesson version. Version creation itself ships in
 * ST-060; the version-creation service calls `snapshotForVersion` and
 * `persistSnapshot` here (see ADR-002).
 */
export interface CitationHistoryService {
  snapshotForVersion(input: {
    executor?: DatabaseExecutor;
    ownerUserId: Identifier;
    projectId: Identifier;
    lessonVersionId: Identifier;
    lessonSpecId?: Identifier;
    lessonSpecRevision?: number;
    groundingCheckId: Identifier | null;
    sourceSnapshotId: Identifier;
    sourceSnapshotContentHash: string;
    now?: Date;
  }): Promise<CitationHistorySnapshot>;
  persistSnapshot(input: {
    executor: DatabaseExecutor;
    ownerUserId: Identifier;
    projectId: Identifier;
    snapshot: CitationHistorySnapshot;
    now?: Date;
  }): Promise<{ id: Identifier }>;
}

/**
 * Builds and persists immutable citation-history snapshots. A retry for the
 * same lesson version returns the already-created row instead of duplicating
 * or overwriting history, so older versions always retain their original
 * citations and grounding state. Version creation itself ships in ST-060; the
 * version-creation service calls `snapshotForVersion` and `persistSnapshot`
 * here (see ADR-002).
 */
export class PostgresCitationHistoryService implements CitationHistoryService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly resolveSourceRefs: SourceSnapshotService["resolveSourceRefs"],
  ) {}

  public async snapshotForVersion(input: {
    executor?: DatabaseExecutor;
    ownerUserId: Identifier;
    projectId: Identifier;
    lessonVersionId: Identifier;
    lessonSpecId?: Identifier;
    lessonSpecRevision?: number;
    groundingCheckId: Identifier | null;
    sourceSnapshotId: Identifier;
    sourceSnapshotContentHash: string;
    now?: Date;
  }): Promise<CitationHistorySnapshot> {
    const timestamp = input.now ?? new Date();
    const executor = input.executor ?? this.database;
    const [lessonSpecRow] = await executor
      .select()
      .from(lessonSpecs)
      .where(
        and(
          eq(lessonSpecs.ownerUserId, input.ownerUserId),
          eq(lessonSpecs.projectId, input.projectId),
          ...(input.lessonSpecId === undefined
            ? []
            : [eq(lessonSpecs.id, input.lessonSpecId)]),
          ...(input.lessonSpecRevision === undefined
            ? []
            : [eq(lessonSpecs.revision, input.lessonSpecRevision)]),
        ),
      )
      .orderBy(desc(lessonSpecs.generatedAt))
      .limit(1);
    if (lessonSpecRow === undefined)
      throw new Error("No lesson spec exists to snapshot.");
    const storyboard = lessonStoryboardSchema.parse(lessonSpecRow.payload);
    const sceneCitations: SceneCitationsResponse[] = [];
    for (const scene of storyboard.scenes) {
      const citations = await this.resolveSourceRefs({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        sourceRefs: (scene.scene.sourceRefs as SourceRef[]) ?? [],
      });
      sceneCitations.push(
        sceneCitationsResponseSchema.parse({
          sceneId: scene.stableSceneId,
          citations,
          generatedAdditions: scene.scene.generatedAdditions,
        }),
      );
    }
    const snapshot = citationHistorySnapshotSchema.parse({
      schemaVersion: "citation-history-v1",
      lessonVersionId: input.lessonVersionId,
      lessonSpecId: lessonSpecRow.id as Identifier,
      lessonSpecRevision: lessonSpecRow.revision,
      sourceSnapshotId: input.sourceSnapshotId,
      sourceSnapshotContentHash: input.sourceSnapshotContentHash,
      sceneCitations,
      groundingCheckId: input.groundingCheckId,
      createdAt: timestamp.toISOString(),
    });
    return snapshot;
  }

  public async persistSnapshot(input: {
    executor: DatabaseExecutor;
    ownerUserId: Identifier;
    projectId: Identifier;
    snapshot: CitationHistorySnapshot;
    now?: Date;
  }): Promise<{ id: Identifier }> {
    const timestamp = input.now ?? new Date();
    const id = createId(timestamp);
    const [created] = await input.executor
      .insert(citationHistorySnapshots)
      .values({
        id,
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        lessonVersionId: input.snapshot.lessonVersionId,
        lessonSpecId: input.snapshot.lessonSpecId,
        lessonSpecRevision: input.snapshot.lessonSpecRevision,
        sourceSnapshotId: input.snapshot.sourceSnapshotId,
        sourceSnapshotContentHash: input.snapshot.sourceSnapshotContentHash,
        sceneCitations: input.snapshot.sceneCitations as unknown[],
        groundingCheckId: input.snapshot.groundingCheckId,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing({
        target: [
          citationHistorySnapshots.ownerUserId,
          citationHistorySnapshots.projectId,
          citationHistorySnapshots.lessonVersionId,
        ],
      })
      .returning({ id: citationHistorySnapshots.id });
    if (created !== undefined) return { id: created.id as Identifier };
    const [existing] = await input.executor
      .select({ id: citationHistorySnapshots.id })
      .from(citationHistorySnapshots)
      .where(
        and(
          eq(
            citationHistorySnapshots.ownerUserId,
            input.ownerUserId,
          ),
          eq(citationHistorySnapshots.projectId, input.projectId),
          eq(
            citationHistorySnapshots.lessonVersionId,
            input.snapshot.lessonVersionId,
          ),
        ),
      )
      .limit(1);
    if (existing === undefined)
      throw new Error("The citation history snapshot could not be read.");
    return { id: existing.id as Identifier };
  }
}
