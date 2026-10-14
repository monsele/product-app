/**
 * ST-113 — generates the curated illustration library from a checked-in
 * concept list. Operators only; never triggered from the product.
 *
 * `pnpm --filter @avlp/api illustration-library:generate --list <file>
 *   [--treatment flat,ink-sketch,editorial] [--surface light,dark]
 *   [--max <n>] [--dry-run]`
 *
 * Every picture is one concept × treatment × surface. The run is planned and
 * priced before any paid call; `--dry-run` stops there. Each picture's row is
 * claimed (`generating`) before its call, so neither a re-run nor a crashed
 * run pays twice: active, rejected, retired and in-progress rows are skipped
 * and only `failed` rows are retried. A picture becomes `active` only after
 * the provider's moderation approves it. Prompts are built from the concept
 * list alone; lesson text, briefs and project pictures never reach the
 * library. Spend is logged per run and recorded per row.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  createId,
  databaseEnvironmentSchema,
  parseWorkerEnvironment,
  storageEnvironmentSchema,
} from "@avlp/config";
import {
  createDatabaseConnection,
  illustrationLibraryEntries,
  type DatabaseClient,
} from "@avlp/database";
import {
  ProviderCallError,
  resolveJobAdapter,
  TogetherIllustrationProvider,
  type IllustrationProvider,
} from "@avlp/provider-adapters";
import {
  cinemaIllustrationKey,
  cinemaIllustrationPrompt,
  cinemaIllustrationSurfaces,
  cinemaIllustrationTreatments,
  illustrationLibraryConceptListSchema,
  illustrationLibraryPrefix,
  illustrationLibraryPromptVersion,
  type CinemaArtDirection,
  type CinemaIllustrationPalette,
  type CinemaIllustrationSurface,
  type CinemaIllustrationTreatment,
  type IllustrationLibraryConcept,
  type IllustrationLibraryConceptList,
} from "@avlp/schemas";
import {
  createS3CompatibleObjectStorage,
  storageKeySchema,
  type ObjectStorage,
} from "@avlp/storage";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";

/** Neutral palettes per surface; the treatment carries the video's style. */
export const illustrationLibraryPalettes: Readonly<
  Record<CinemaIllustrationSurface, CinemaIllustrationPalette>
> = Object.freeze({
  light: { accent: "#3b6ea5", diagramEmphasis: "#c96f1e", surface: "#f7f5f0" },
  dark: { accent: "#8cb8e6", diagramEmphasis: "#f0a35e", surface: "#1c2230" },
});

/** One drawing language per treatment, shared by every library picture. */
export function illustrationLibraryArtDirection(
  treatment: CinemaIllustrationTreatment,
  depictsPeople: boolean,
): CinemaArtDirection {
  return {
    treatment,
    line: treatment === "flat" ? "fine" : treatment === "ink-sketch" ? "hand-drawn" : "none",
    subjects: depictsPeople ? "people-and-objects" : "objects",
    background: treatment === "flat" ? "cutout" : "soft-vignette",
    humanFigures: depictsPeople,
  };
}

export type LibraryGenerationOptions = Readonly<{
  treatments: readonly CinemaIllustrationTreatment[];
  surfaces: readonly CinemaIllustrationSurface[];
  max: number;
  dryRun: boolean;
}>;

const listOf = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .transform((value) => value.split(",").map((entry) => entry.trim()))
    .pipe(z.array(z.enum(values)).min(1));

/** Validates the command line at the boundary. */
export function parseLibraryArguments(argv: readonly string[]): LibraryGenerationOptions & {
  list: string;
} {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      list: { type: "string" },
      treatment: { type: "string" },
      surface: { type: "string" },
      max: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  return z
    .object({
      list: z.string().min(1),
      treatments: listOf(cinemaIllustrationTreatments).default(cinemaIllustrationTreatments.join(",")),
      surfaces: listOf(cinemaIllustrationSurfaces).default(cinemaIllustrationSurfaces.join(",")),
      max: z.coerce.number().int().min(1).max(1_000).default(20),
      dryRun: z.boolean(),
    })
    .parse({
      list: values.list,
      treatments: values.treatment,
      surfaces: values.surface,
      max: values.max,
      dryRun: values["dry-run"],
    });
}

export async function loadConceptList(path: string): Promise<IllustrationLibraryConceptList> {
  return illustrationLibraryConceptListSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export type LibraryPlanItem = Readonly<{
  key: string;
  treatment: CinemaIllustrationTreatment;
  surface: CinemaIllustrationSurface;
  concept: IllustrationLibraryConcept;
  /** True when a `failed` row is being retried. */
  retry: boolean;
}>;

/** Statuses a run never generates again. `generating` is left for review: a
 * crashed run may already have paid for it. */
const settledStatuses = new Set(["active", "rejected", "retired", "generating"]);

/**
 * The pictures this run would generate, in list order, at most `max`. Pure,
 * so the dry run and the real run price exactly the same work.
 */
export function planLibraryGeneration(
  list: IllustrationLibraryConceptList,
  options: LibraryGenerationOptions,
  existing: ReadonlyMap<string, string>,
): { items: LibraryPlanItem[]; alreadyDone: number; remaining: number } {
  const items: LibraryPlanItem[] = [];
  let alreadyDone = 0;
  let remaining = 0;
  for (const concept of list.concepts)
    for (const treatment of options.treatments)
      for (const surface of options.surfaces) {
        const key = cinemaIllustrationKey(concept.concept, treatment);
        const status = existing.get(`${key}|${surface}`);
        if (status !== undefined && settledStatuses.has(status)) {
          alreadyDone += 1;
          continue;
        }
        if (items.length >= options.max) {
          remaining += 1;
          continue;
        }
        items.push({ key, treatment, surface, concept, retry: status === "failed" });
      }
  return { items, alreadyDone, remaining };
}

export type LibraryGenerationSummary = {
  planned: number;
  alreadyDone: number;
  remaining: number;
  estimatedCostUsd: number;
  generated: number;
  rejected: number;
  failed: number;
  skipped: number;
  spentUsd: number;
  dryRun: boolean;
};

const roundUsd = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

/**
 * Plans, prices and (unless a dry run) generates library pictures. The
 * provider and storage are only touched after the plan has been printed.
 */
export async function generateIllustrationLibrary(input: {
  database: DatabaseClient;
  list: IllustrationLibraryConceptList;
  options: LibraryGenerationOptions;
  costPerImageUsd: number;
  /** Required unless a dry run. */
  provider?: IllustrationProvider | undefined;
  /** Confined to `catalog/illustrations`; required unless a dry run. */
  storage?: Pick<ObjectStorage, "putBytes"> | undefined;
  log?: (line: string) => void;
  now?: () => Date;
}): Promise<LibraryGenerationSummary> {
  const log = input.log ?? ((line: string) => console.log(line));
  const now = input.now ?? (() => new Date());
  const rows = await input.database
    .select({
      key: illustrationLibraryEntries.illustrationKey,
      surface: illustrationLibraryEntries.surface,
      status: illustrationLibraryEntries.status,
    })
    .from(illustrationLibraryEntries);
  const existing = new Map(rows.map((row) => [`${row.key}|${row.surface}`, row.status]));
  const plan = planLibraryGeneration(input.list, input.options, existing);
  const summary: LibraryGenerationSummary = {
    planned: plan.items.length,
    alreadyDone: plan.alreadyDone,
    remaining: plan.remaining,
    estimatedCostUsd: roundUsd(plan.items.length * input.costPerImageUsd),
    generated: 0,
    rejected: 0,
    failed: 0,
    skipped: 0,
    spentUsd: 0,
    dryRun: input.options.dryRun,
  };
  log(
    `Illustration library plan: ${summary.planned} to generate (max ${input.options.max}), ` +
      `${summary.alreadyDone} already done, ${summary.remaining} left for a later run. ` +
      `Estimated cost: $${summary.estimatedCostUsd.toFixed(4)} at $${input.costPerImageUsd} per image.`,
  );
  for (const item of plan.items)
    log(`  ${item.retry ? "retry" : "new"}  ${item.key} (${item.surface})`);
  if (input.options.dryRun || plan.items.length === 0) return summary;
  if (input.provider === undefined || input.storage === undefined)
    throw new Error("A provider and library storage are required to generate pictures.");
  const provider = resolveJobAdapter({
    jobType: "illustration.generate",
    adapterFamily: "illustration",
    adapter: input.provider,
  }).adapter;

  for (const item of plan.items) {
    const artDirection = illustrationLibraryArtDirection(item.treatment, item.concept.depictsPeople);
    const palette = illustrationLibraryPalettes[item.surface];
    const brief = {
      concept: item.concept.concept,
      description: item.concept.description,
      subject: item.concept.subject,
    };
    const prompt = cinemaIllustrationPrompt({ brief, artDirection, palette });
    const values = {
      illustrationKey: item.key,
      treatment: item.treatment,
      surface: item.surface,
      concept: item.concept.concept,
      description: item.concept.description,
      subject: item.concept.subject,
      depictsPeople: item.concept.depictsPeople,
      altText: item.concept.description,
      prompt,
      promptVersion: illustrationLibraryPromptVersion,
      provider: provider.providerId,
      model: provider.model ?? null,
    };
    // Claim before paying: a new row, or a `failed` row taken back.
    const [claimed] = await input.database
      .insert(illustrationLibraryEntries)
      .values({ id: createId(now()), ...values, status: "generating", createdAt: now(), updatedAt: now() })
      .onConflictDoUpdate({
        target: [illustrationLibraryEntries.illustrationKey, illustrationLibraryEntries.surface],
        set: { ...values, status: "generating", failureCode: null, updatedAt: now() },
        setWhere: sql`${illustrationLibraryEntries.status} = 'failed'`,
      })
      .returning({ id: illustrationLibraryEntries.id });
    if (claimed === undefined) {
      summary.skipped += 1;
      continue;
    }
    const settle = (set: Partial<typeof illustrationLibraryEntries.$inferInsert>) =>
      input.database
        .update(illustrationLibraryEntries)
        .set({ ...set, updatedAt: now() })
        .where(
          and(
            eq(illustrationLibraryEntries.id, claimed.id),
            eq(illustrationLibraryEntries.status, "generating"),
          ),
        );
    try {
      const result = await provider.generate({
        prompt,
        size: "1024x1024",
        style: `cinema-${item.treatment}`,
      });
      summary.spentUsd = roundUsd(summary.spentUsd + result.costUsd);
      const paid = {
        providerCallId: result.providerCallId,
        costUsd: result.costUsd.toFixed(6),
        model: result.model ?? provider.model ?? null,
      };
      if (result.moderation.status !== "approved") {
        await settle({ ...paid, status: "rejected", failureCode: result.moderation.code });
        summary.rejected += 1;
        log(`  rejected ${item.key} (${item.surface}): ${result.moderation.code}`);
        continue;
      }
      const metadata = await sharp(result.bytes, { limitInputPixels: 20_000_000 }).metadata();
      if (metadata.format !== "png" || metadata.width === undefined || metadata.height === undefined)
        throw new ProviderCallError({
          code: "INVALID_IMAGE_OUTPUT",
          message: "The provider returned an invalid PNG image.",
        });
      const sha256 = createHash("sha256").update(result.bytes).digest("hex");
      const storageKey = storageKeySchema.parse(
        `${illustrationLibraryPrefix}/${item.treatment}/${item.surface}/${claimed.id}/${sha256}.png`,
      );
      await input.storage.putBytes({
        key: storageKey,
        body: new Uint8Array(result.bytes),
        contentType: "image/png",
        metadata: { "illustration-key": item.key.slice(0, 200), provenance: "ai-generated", sha256 },
      });
      await settle({
        ...paid,
        status: "active",
        storageKey,
        checksumSha256: sha256,
        contentType: "image/png",
        width: metadata.width,
        height: metadata.height,
      });
      summary.generated += 1;
      log(`  active   ${item.key} (${item.surface})`);
    } catch (error) {
      const code = error instanceof ProviderCallError ? error.code : "ILLUSTRATION_LIBRARY_FAILED";
      await settle({ status: "failed", failureCode: code });
      summary.failed += 1;
      log(`  failed   ${item.key} (${item.surface}): ${code}`);
    }
  }
  log(
    `Illustration library run: ${summary.generated} active, ${summary.rejected} rejected, ` +
      `${summary.failed} failed, ${summary.skipped} skipped. Spent: $${summary.spentUsd.toFixed(4)}.`,
  );
  return summary;
}

async function main(): Promise<void> {
  const args = parseLibraryArguments(process.argv.slice(2));
  const worker = parseWorkerEnvironment(process.env);
  const database = createDatabaseConnection(
    databaseEnvironmentSchema.parse(process.env).DATABASE_URL,
  );
  try {
    const list = await loadConceptList(args.list);
    const options: LibraryGenerationOptions = args;
    if (args.dryRun) {
      await generateIllustrationLibrary({
        database: database.client,
        list,
        options,
        costPerImageUsd: worker.TOGETHER_IMAGE_COST_USD,
      });
      return;
    }
    // Paid pictures need the production provider; no silent mock fallback.
    if (worker.TOGETHER_API_KEY === undefined)
      throw new Error("TOGETHER_API_KEY is required to generate library pictures.");
    const environment = storageEnvironmentSchema
      .and(z.object({ OBJECT_STORAGE_BUCKET: z.string().min(1) }))
      .parse(process.env);
    const storage = await createS3CompatibleObjectStorage({
      bucket: environment.OBJECT_STORAGE_BUCKET,
      allowedPrefix: illustrationLibraryPrefix,
      allowedUploadContentTypes: ["image/png"],
      maxUploadBytes: 20 * 1024 * 1024,
      region: environment.OBJECT_STORAGE_REGION,
      forcePathStyle: environment.OBJECT_STORAGE_FORCE_PATH_STYLE,
      allowInsecureEndpoint: environment.OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT,
      runtimeEnvironment: environment.NODE_ENV,
      ...(environment.OBJECT_STORAGE_ACCESS_KEY === undefined
        ? {}
        : {
            credentials: {
              accessKeyId: environment.OBJECT_STORAGE_ACCESS_KEY,
              secretAccessKey: environment.OBJECT_STORAGE_SECRET_KEY!,
            },
          }),
      ...(environment.OBJECT_STORAGE_ENDPOINT === undefined
        ? {}
        : { endpoint: environment.OBJECT_STORAGE_ENDPOINT }),
    });
    await generateIllustrationLibrary({
      database: database.client,
      list,
      options,
      costPerImageUsd: worker.TOGETHER_IMAGE_COST_USD,
      provider: new TogetherIllustrationProvider({
        apiKey: worker.TOGETHER_API_KEY,
        baseUrl: worker.TOGETHER_API_BASE_URL,
        model: worker.TOGETHER_IMAGE_MODEL,
        costUsdPerImage: worker.TOGETHER_IMAGE_COST_USD,
        requestTimeoutMs: worker.TOGETHER_REQUEST_TIMEOUT_MS,
        maxRetries: worker.TOGETHER_MAX_RETRIES,
      }),
      storage,
    });
  } finally {
    await database.close();
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url)
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Illustration library generation failed.");
    process.exitCode = 1;
  });
