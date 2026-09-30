/**
 * ST-112 proof driver for an EXISTING lesson (the investigated lesson):
 * the explicit v2 upgrade path, reusing its narration, audio and pictures.
 * Temporary and untracked; never imported by production code.
 *
 *   npx tsx --env-file=../../.env src/st112-proof.local.ts <phase>
 *   phases: status | upgrade | plan | pictures | apply | render
 */
import { createId, parseEnvironment, type Identifier } from "@avlp/config";
import {
  createDatabaseConnection,
  illustrationGenerationCandidates,
  jobs,
} from "@avlp/database";
import { cinemaComposition, isCreativeDesignManifestV2 } from "@avlp/schemas";
import { createS3CompatibleObjectStorage } from "@avlp/storage";
import { and, desc, eq } from "drizzle-orm";
import { PostgresCitationHistoryService } from "./citation-history.js";
import { PostgresCreativeDesignService } from "./creative-design.js";
import { IllustrationGenerationService } from "./illustration-generation.js";
import { PostgresLessonValidationService } from "./lesson-validation.js";
import { PostgresLessonVersionsService } from "./lesson-versions.js";
import { PostgresRenderService } from "./renders.js";
import { PostgresSourceSnapshotService } from "./source-snapshot.js";

const scope = {
  ownerUserId: (process.env.PROOF_OWNER ?? "01a0c938-7551-7405-a9e1-4db43e6bc491") as Identifier,
  projectId: (process.env.PROOF_PROJECT ?? "01a0ecdc-8067-7926-814a-84d1a29920a5") as Identifier,
};
const phase = process.argv[2] ?? "status";
const environment = parseEnvironment(process.env);
const database = createDatabaseConnection(environment.DATABASE_URL);
const client = database.client;
const design = new PostgresCreativeDesignService(client);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function describe() {
  const draft = await design.getDraft(scope);
  if (draft === null) return { draft: null };
  const manifest = draft.manifest;
  if (!isCreativeDesignManifestV2(manifest))
    return { revision: draft.revision, release: "1.0", pack: manifest.pack.id, applied: draft.applied };
  return {
    revision: draft.revision,
    release: "2.0",
    pack: manifest.pack.id,
    applied: draft.applied,
    plan: manifest.plan.source,
    artDirection: manifest.artDirection,
    eligibility: draft.eligibility,
    scenes: Object.entries(manifest.scenes).map(([id, scene]) => ({
      id: id.slice(-6),
      composition: scene.compositionId,
      family: cinemaComposition(scene.compositionId).family,
      headline: scene.display.headline,
      hero: scene.imagery.hero?.origin ?? null,
      brief: scene.imagery.brief?.concept ?? null,
      beats: scene.beats.length,
    })),
  };
}

async function waitForJob(jobId: string) {
  for (;;) {
    const [job] = await client.select().from(jobs).where(eq(jobs.id, jobId));
    if (job !== undefined && !["queued", "running", "retry_wait"].includes(job.state)) return job;
    await sleep(5_000);
  }
}

try {
  if (phase === "upgrade") {
    const draft = await design.getDraft(scope);
    if (draft === null) throw new Error("no draft");
    const upgraded = await design.upgrade({ ...scope, body: { expectedRevision: draft.revision } });
    console.log("upgraded to revision", upgraded.revision);
  } else if (phase === "plan") {
    const queued = await design.requestVisualPlan({
      ...scope,
      correlationId: createId(),
      requestKey: `st112-proof:visual-plan:${process.argv[3] ?? "1"}`,
    });
    console.log("queued", queued);
    if ("jobId" in queued) {
      const job = await waitForJob(queued.jobId);
      console.log("job", job.state, JSON.stringify(job.resultMetadata), JSON.stringify(job.errorMetadata));
    }
  } else if (phase === "pictures") {
    const result = await new IllustrationGenerationService(client).queueCinemaIllustrations({
      ...scope,
      correlationId: createId(),
      requestKey: "st112-proof:pictures",
    });
    console.log(JSON.stringify(result, null, 1));
    for (const entry of result.queued) {
      const job = await waitForJob(entry.jobId);
      const [candidate] = await client
        .select()
        .from(illustrationGenerationCandidates)
        .where(eq(illustrationGenerationCandidates.id, entry.candidateId));
      console.log(entry.key, job.state, candidate?.status, candidate?.provider, candidate?.failureCode);
    }
  } else if (phase === "apply") {
    const draft = await design.getDraft(scope);
    if (draft === null) throw new Error("no draft");
    console.log(await design.apply({ ...scope, expectedRevision: draft.revision }));
  } else if (phase === "render") {
    const storage = await createS3CompatibleObjectStorage({
      bucket: environment.OBJECT_STORAGE_BUCKET!,
      allowedPrefix: "users",
      allowedUploadContentTypes: ["image/png"],
      maxUploadBytes: environment.MAX_UPLOAD_BYTES,
      defaultSignedUrlTtlSeconds: environment.SIGNED_URL_TTL_SECONDS,
      region: environment.OBJECT_STORAGE_REGION,
      forcePathStyle: environment.OBJECT_STORAGE_FORCE_PATH_STYLE,
      allowInsecureEndpoint: environment.OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT,
      runtimeEnvironment: environment.NODE_ENV,
      credentials: {
        accessKeyId: environment.OBJECT_STORAGE_ACCESS_KEY!,
        secretAccessKey: environment.OBJECT_STORAGE_SECRET_KEY!,
      },
      ...(environment.OBJECT_STORAGE_ENDPOINT === undefined
        ? {}
        : { endpoint: environment.OBJECT_STORAGE_ENDPOINT }),
    });
    const validation = new PostgresLessonValidationService(client);
    const sourceSnapshots = new PostgresSourceSnapshotService(client);
    const run = await validation.run({ ...scope, body: {} });
    console.log("validation", run.status, run.issues.map((issue) => `${issue.severity}:${issue.code}`));
    if (run.status !== "passed") throw new Error("validation did not pass");
    const correlationId = createId();
    const versions = await new PostgresLessonVersionsService(
      client,
      new PostgresCitationHistoryService(client, (input) => sourceSnapshots.resolveSourceRefs(input)),
    ).create({ ...scope, correlationId, body: { reason: "before_render" } });
    console.log("version", versions.currentVersionId);
    const renders = new PostgresRenderService(
      client,
      validation,
      { maxConcurrentPerProject: environment.RENDER_CONCURRENCY, maxStartsPerProjectHour: environment.MAX_RENDERS_PER_HOUR },
      undefined,
      storage,
      sourceSnapshots,
    );
    let render = await renders.start({
      ...scope,
      correlationId,
      idempotencyKey: `st112-proof:render:${versions.currentVersionId}`,
      body: { lessonVersionId: versions.currentVersionId },
    });
    console.log("render", render.id, render.status);
    while (render.status === "queued" || render.status === "rendering") {
      await sleep(10_000);
      render = await renders.detail({ ...scope, renderId: render.id });
    }
    console.log("render finished", render.status, render.errorCode, JSON.stringify(render.review)?.slice(0, 600));
    const [job] = await client
      .select()
      .from(jobs)
      .where(and(eq(jobs.projectId, scope.projectId), eq(jobs.jobType, "lesson.render")))
      .orderBy(desc(jobs.createdAt));
    console.log("storageKey", (job?.resultMetadata as { video?: { storageKey?: string } } | null)?.video?.storageKey);
  }
  console.log(JSON.stringify(await describe(), null, 1));
} finally {
  await database.close?.();
  process.exit(0);
}
