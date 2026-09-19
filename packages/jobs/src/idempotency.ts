import { createHash } from "node:crypto";
import { identifierSchema } from "@avlp/config";
import { jobTypeSchema } from "./contracts.js";

export const canonicalJsonPolicy = "canonical-json-v1" as const;

/**
 * Canonical JSON for durable job and render identities.  Array order remains
 * meaningful; object-key order does not.  Reject values that JSON would
 * silently coerce or omit, because treating those as an identity would make a
 * render cache key ambiguous (CR-06).
 */
export function canonicalJson(value: unknown): string {
  const ancestors = new WeakSet<object>();
  const visit = (entry: unknown): string => {
    if (entry === null) return "null";
    if (typeof entry === "number") {
      if (!Number.isFinite(entry))
        throw new TypeError("Canonical job options must not contain non-finite numbers.");
      return JSON.stringify(entry);
    }
    if (typeof entry === "string" || typeof entry === "boolean")
      return JSON.stringify(entry);
    if (typeof entry === "undefined" || typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint")
      throw new TypeError("Canonical job options must contain JSON values only.");
    if (Array.isArray(entry)) {
      if (ancestors.has(entry))
        throw new TypeError("Canonical job options must not contain cycles.");
      ancestors.add(entry);
      const result = `[${entry.map(visit).join(",")}]`;
      ancestors.delete(entry);
      return result;
    }
    if (typeof entry !== "object")
      throw new TypeError("Canonical job options must contain JSON values only.");
    if (
      Object.getPrototypeOf(entry) !== Object.prototype &&
      Object.getPrototypeOf(entry) !== null
    )
      throw new TypeError("Canonical job options must contain plain JSON objects only.");
    if (ancestors.has(entry))
      throw new TypeError("Canonical job options must not contain cycles.");
    ancestors.add(entry);
    const record = entry as Record<string, unknown>;
    const result = `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${visit(record[key])}`)
      .join(",")}}`;
    ancestors.delete(entry);
    return result;
  };
  return visit(value);
}

export function hashJobOptions(options: unknown): string {
  return createHash("sha256").update(canonicalJson(options)).digest("hex");
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
