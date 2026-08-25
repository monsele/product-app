import { createHash } from "node:crypto";
import { z } from "zod";

export const promptKindValues = [
  "objectives",
  "outline",
  "narration",
  "storyboard",
  "grounding",
] as const;
export const promptKindSchema = z.enum(promptKindValues);
export type PromptKind = z.infer<typeof promptKindSchema>;

export const promptVersionPattern = /^v\d+$/;

/**
 * Versioned prompt definition. A prompt change is a behavior change: bump
 * `version` and update the changelog, then run the referenced evaluation cases.
 */
export const promptDefinitionSchema = z
  .object({
    kind: promptKindSchema,
    promptId: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z][a-z0-9-]*$/),
    version: z.string().regex(promptVersionPattern),
    purpose: z.string().trim().min(1).max(500),
    inputSchema: z.string().trim().min(1).max(200),
    outputSchema: z.string().trim().min(1).max(200),
    allowedSourceContext: z.string().trim().min(1).max(2_000),
    templateCatalogVersion: z.string().trim().max(50).nullable(),
    examples: z
      .array(
        z
          .object({
            input: z.string().min(1).max(20_000),
            output: z.string().min(1).max(20_000),
          })
          .strict(),
      )
      .max(50),
    knownFailureModes: z.array(z.string().min(1).max(500)).max(100),
    evaluationCases: z.array(z.string().min(1).max(200)).max(100),
    changelog: z.string().trim().min(1).max(2_000),
    system: z.string().min(1).max(100_000),
    userTemplate: z.string().min(1).max(200_000),
  })
  .strict();
export type PromptDefinition = z.infer<typeof promptDefinitionSchema>;

export interface PromptRegistry {
  get(promptId: string, version: string): PromptDefinition;
  list(promptId?: string): PromptDefinition[];
  latest(promptId: string): PromptDefinition;
}

export function promptVersionRank(version: string): number {
  const match = promptVersionPattern.exec(version);
  if (match === null) throw new TypeError(`Invalid prompt version ${version}.`);
  return Number.parseInt(version.slice(1), 10);
}

function byVersionDescending(
  left: PromptDefinition,
  right: PromptDefinition,
): number {
  return promptVersionRank(right.version) - promptVersionRank(left.version);
}

/**
 * In-memory registry seeded with the repository's versioned prompt files.
 * Rejects duplicate (promptId, version) definitions at construction so a
 * version bump is always explicit.
 */
export class StaticPromptRegistry implements PromptRegistry {
  private readonly definitions: readonly PromptDefinition[];

  public constructor(definitions: readonly PromptDefinition[]) {
    const seen = new Set<string>();
    for (const definition of definitions) {
      const key = `${definition.promptId}:${definition.version}`;
      if (seen.has(key))
        throw new TypeError(
          `Duplicate prompt definition ${key}; a prompt change must bump its version.`,
        );
      seen.add(key);
    }
    this.definitions = definitions;
  }

  public list(promptId?: string): PromptDefinition[] {
    const definitions = this.definitions.filter(
      (definition) =>
        promptId === undefined || definition.promptId === promptId,
    );
    return [...definitions].sort((left, right) => {
      const byKind = left.kind.localeCompare(right.kind);
      if (byKind !== 0) return byKind;
      const byId = left.promptId.localeCompare(right.promptId);
      if (byId !== 0) return byId;
      return byVersionDescending(left, right);
    });
  }

  public get(promptId: string, version: string): PromptDefinition {
    const definition = this.definitions.find(
      (candidate) =>
        candidate.promptId === promptId && candidate.version === version,
    );
    if (definition === undefined)
      throw new RangeError(`Prompt ${promptId}@${version} is not registered.`);
    return definition;
  }

  public latest(promptId: string): PromptDefinition {
    const matches = this.list(promptId);
    if (matches.length === 0)
      throw new RangeError(`Prompt ${promptId} is not registered.`);
    return matches[0]!;
  }
}

export type PromptRenderVariables = Record<string, string>;

/**
 * Renders the user template with the given variables using `{{name}}`
 * placeholders. Any leftover `{{...}}` placeholders are reported so a
 * misconfigured prompt never reaches the model silently.
 */
export function renderPrompt(
  definition: PromptDefinition,
  variables: PromptRenderVariables,
): { system: string; user: string } {
  let user = definition.userTemplate;
  for (const [name, value] of Object.entries(variables))
    user = user.replaceAll(`{{${name}}}`, value);
  const missing = /{{\s*([a-zA-Z0-9_-]+)\s*}}/g;
  const names = [...user.matchAll(missing)].map((match) => match[1]!);
  if (names.length > 0)
    throw new Error(
      `Prompt ${definition.promptId}@${definition.version} is missing variables: ${[...new Set(names)].join(", ")}`,
    );
  return { system: definition.system, user };
}

/**
 * Deterministic input version for one model-call operation. It binds the
 * operation, prompt id/version, model, and the exact approved source snapshot
 * plus operation parameters so that changing any of them (including a prompt
 * version bump) changes the input version and therefore the idempotency key.
 */
export function computeGenerationInputVersion(input: {
  operationType: string;
  promptId: string;
  promptVersion: string;
  model: string;
  sourceSnapshotId: string;
  sourceSnapshotContentHash: string;
  paramsHash: string;
}): string {
  const canonical = JSON.stringify({
    operationType: input.operationType,
    promptId: input.promptId,
    promptVersion: input.promptVersion,
    model: input.model,
    sourceSnapshotId: input.sourceSnapshotId,
    sourceSnapshotContentHash: input.sourceSnapshotContentHash,
    paramsHash: input.paramsHash,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Stable SHA-256 of a JSON value with sorted keys, used for input/param hashes. */
export function stableJsonHash(value: unknown): string {
  const canonical = JSON.stringify(sortCanonical(value));
  return createHash("sha256").update(canonical).digest("hex");
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortCanonical(nested)]),
    );
  }
  return value;
}
