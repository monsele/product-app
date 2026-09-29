import {
  carryForwardCreativeDesignManifest,
  creativeDesignHash,
  creativeDesignManifestSchema,
  creativeDesignPackIdSchema,
  type CreativeDesignManifest,
} from "@avlp/schemas/creative-design";
import { and, desc, eq, lt } from "drizzle-orm";
import type { DatabaseExecutor } from "./client.js";
import {
  creativeDesignDrafts,
  creativeDesignSnapshots,
  lessonConfigurations,
} from "./schema.js";

/**
 * Re-pins a lesson's creative design to a new storyboard revision.
 *
 * Snapshots are keyed by exact `lessonSpecRevision`, and preview, lesson
 * versions and render read only the current revision's snapshot. Every writer
 * that bumps the storyboard revision must call this in the same transaction,
 * or the lesson silently falls back to the legacy `mvp-default` look.
 *
 * The design comes from the latest earlier snapshot, or from the configured
 * style pack when the lesson has none yet. See
 * `carryForwardCreativeDesignManifest` for when it is kept or re-planned.
 * Returns the pinned manifest, or `undefined` when the lesson stays legacy.
 */
export async function carryForwardCreativeDesignSnapshot(
  executor: DatabaseExecutor,
  input: Readonly<{
    ownerUserId: string;
    projectId: string;
    lessonSpecId: string;
    nextRevision: number;
    scenes: readonly Readonly<{
      id: string;
      template: string;
      durationSeconds: number;
    }>[];
    createId: () => string;
    now: Date;
  }>,
): Promise<CreativeDesignManifest | undefined> {
  const scope = and(
    eq(creativeDesignSnapshots.ownerUserId, input.ownerUserId),
    eq(creativeDesignSnapshots.projectId, input.projectId),
    eq(creativeDesignSnapshots.lessonSpecId, input.lessonSpecId),
  );
  const [existing] = await executor
    .select({ manifest: creativeDesignSnapshots.manifest })
    .from(creativeDesignSnapshots)
    .where(
      and(scope, eq(creativeDesignSnapshots.lessonSpecRevision, input.nextRevision)),
    )
    .orderBy(desc(creativeDesignSnapshots.createdAt))
    .limit(1);
  if (existing !== undefined)
    return creativeDesignManifestSchema.parse(existing.manifest);

  const [previousRow] = await executor
    .select({
      manifest: creativeDesignSnapshots.manifest,
      manifestHash: creativeDesignSnapshots.manifestHash,
    })
    .from(creativeDesignSnapshots)
    .where(
      and(scope, lt(creativeDesignSnapshots.lessonSpecRevision, input.nextRevision)),
    )
    .orderBy(
      desc(creativeDesignSnapshots.lessonSpecRevision),
      desc(creativeDesignSnapshots.createdAt),
    )
    .limit(1);
  const previousParsed =
    previousRow === undefined
      ? undefined
      : creativeDesignManifestSchema.safeParse(previousRow.manifest);
  const previous = previousParsed?.success ? previousParsed.data : undefined;

  let packId: ReturnType<typeof creativeDesignPackIdSchema.parse> | undefined;
  if (previous === undefined) {
    const [configuration] = await executor
      .select({ creativeStylePack: lessonConfigurations.creativeStylePack })
      .from(lessonConfigurations)
      .where(
        and(
          eq(lessonConfigurations.ownerUserId, input.ownerUserId),
          eq(lessonConfigurations.projectId, input.projectId),
        ),
      )
      .limit(1);
    packId = creativeDesignPackIdSchema.safeParse(
      configuration?.creativeStylePack,
    ).data;
    if (packId === undefined) return undefined;
  }

  const manifest = carryForwardCreativeDesignManifest({
    previous,
    packId: packId ?? null,
    scenes: input.scenes,
  });
  if (manifest === undefined) return undefined;
  const manifestHash = creativeDesignHash(manifest);
  await executor
    .insert(creativeDesignSnapshots)
    .values({
      id: input.createId(),
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      lessonSpecId: input.lessonSpecId,
      lessonSpecRevision: input.nextRevision,
      manifest,
      manifestHash,
      createdAt: input.now,
    })
    .onConflictDoNothing();

  // Keep the editable draft on the current revision so the panel's Apply does
  // not hit an edit conflict. A draft holding the applied design follows the
  // carried design; a draft with the teacher's unapplied edits keeps them.
  const [draft] = await executor
    .select({
      id: creativeDesignDrafts.id,
      manifestHash: creativeDesignDrafts.manifestHash,
      revision: creativeDesignDrafts.revision,
    })
    .from(creativeDesignDrafts)
    .where(
      and(
        eq(creativeDesignDrafts.ownerUserId, input.ownerUserId),
        eq(creativeDesignDrafts.projectId, input.projectId),
        eq(creativeDesignDrafts.lessonSpecId, input.lessonSpecId),
      ),
    )
    .limit(1);
  if (draft === undefined)
    await executor
      .insert(creativeDesignDrafts)
      .values({
        id: input.createId(),
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        lessonSpecId: input.lessonSpecId,
        lessonSpecRevision: input.nextRevision,
        manifest,
        manifestHash,
        revision: 1,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing();
  else if (
    draft.manifestHash === previousRow?.manifestHash &&
    draft.manifestHash !== manifestHash
  )
    await executor
      .update(creativeDesignDrafts)
      .set({
        manifest,
        manifestHash,
        lessonSpecRevision: input.nextRevision,
        revision: draft.revision + 1,
        updatedAt: input.now,
      })
      .where(eq(creativeDesignDrafts.id, draft.id));
  else
    await executor
      .update(creativeDesignDrafts)
      .set({ lessonSpecRevision: input.nextRevision })
      .where(eq(creativeDesignDrafts.id, draft.id));
  return manifest;
}
