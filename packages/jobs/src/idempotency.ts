import { createHash } from "node:crypto";
import { identifierSchema } from "@avlp/config";
import { jobTypeSchema } from "./contracts.js";

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function hashJobOptions(options: unknown): string {
  return createHash("sha256").update(stableJson(options)).digest("hex");
}

export function createIdempotencyKey(input: {
  jobType: string;
  projectId: string;
  inputVersion: string;
  options: unknown;
}): string {
  const jobType = jobTypeSchema.parse(input.jobType);
  const projectId = identifierSchema.parse(input.projectId);
  if (input.inputVersion.length === 0 || input.inputVersion.length > 200)
    throw new TypeError(
      "Input version must contain between 1 and 200 characters.",
    );
  return `${jobType}:${projectId}:${input.inputVersion}:${hashJobOptions(input.options)}`;
}
