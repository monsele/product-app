/**
 * ST-112 proof helper, temporary and untracked: clears the generated hero
 * pictures of a proof lesson's current v2 draft and retires their candidate
 * records, so the pictures are generated again with the current brief.
 *
 *   npx tsx --env-file=../../.env src/st112-unpin.local.ts
 */
import { parseEnvironment, type Identifier } from "@avlp/config";
import {
  createDatabaseConnection,
  creativeDesignDrafts,
  illustrationGenerationCandidates,
} from "@avlp/database";
import { creativeDesignHash, isCreativeDesignManifestV2 } from "@avlp/schemas";
import { and, eq } from "drizzle-orm";
import { PostgresCreativeDesignService } from "./creative-design.js";

const scope = {
  ownerUserId: process.env.PROOF_OWNER as Identifier,
  projectId: process.env.PROOF_PROJECT as Identifier,
};
const database = createDatabaseConnection(parseEnvironment(process.env).DATABASE_URL);
const client = database.client;
try {
  const draft = await new PostgresCreativeDesignService(client).getDraft(scope);
  if (draft === null || !isCreativeDesignManifestV2(draft.manifest)) throw new Error("no v2 draft");
  const hash = creativeDesignHash(draft.manifest);
  const scenes = Object.fromEntries(
    Object.entries(draft.manifest.scenes).map(([id, scene]) => [
      id,
      scene.imagery.hero?.origin === "generated"
        ? { ...scene, imagery: { ...scene.imagery, hero: null } }
        : scene,
    ]),
  );
  const next = { ...draft.manifest, scenes };
  const updated = await client
    .update(creativeDesignDrafts)
    .set({ manifest: next, manifestHash: creativeDesignHash(next), revision: draft.revision + 1, updatedAt: new Date() })
    .where(
      and(
        eq(creativeDesignDrafts.ownerUserId, scope.ownerUserId),
        eq(creativeDesignDrafts.projectId, scope.projectId),
        eq(creativeDesignDrafts.revision, draft.revision),
        eq(creativeDesignDrafts.manifestHash, hash),
      ),
    )
    .returning({ id: creativeDesignDrafts.id });
  console.log("drafts updated", updated.length);
  const candidates = await client
    .select()
    .from(illustrationGenerationCandidates)
    .where(
      and(
        eq(illustrationGenerationCandidates.ownerUserId, scope.ownerUserId),
        eq(illustrationGenerationCandidates.projectId, scope.projectId),
        eq(illustrationGenerationCandidates.slot, "cinema-hero"),
      ),
    );
  for (const candidate of candidates)
    await client
      .update(illustrationGenerationCandidates)
      .set({ slot: "cinema-hero-retired", idempotencyKey: `${candidate.idempotencyKey}:retired` })
      .where(eq(illustrationGenerationCandidates.id, candidate.id));
  console.log("candidates retired", candidates.length);
} finally {
  await database.close?.();
  process.exit(0);
}
