import type { SafeMetadataValue } from "./contracts.js";

export const redactedValue = "[REDACTED]" as const;
const sensitiveKeyPattern =
  /(?:authorization|cookie|password|passphrase|secret|token|api[-_]?key|access[-_]?key|signed[-_]?url|signature|provider[-_]?payload|source[-_]?text|document[-_]?text|raw[-_]?payload|error[-_]?message|exception)/i;
const sensitivePromptKeyPattern =
  /prompt(?:[-_.]?(?:text|content|body|payload))?$/i;
const bearerPattern = /\bbearer\s+[a-z0-9._~+/=-]+/gi;
const signedUrlPattern =
  /https?:\/\/\S+[?&](?:x-amz-signature|x-amz-credential|signature|token)=[^\s]+/gi;

export type RedactionOptions = {
  maxDepth?: number;
  maxArrayLength?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
};

export function redactSensitiveData(
  input: unknown,
  options: RedactionOptions = {},
): SafeMetadataValue {
  const limits = {
    maxDepth: options.maxDepth ?? 8,
    maxArrayLength: options.maxArrayLength ?? 100,
    maxObjectKeys: options.maxObjectKeys ?? 100,
    maxStringLength: options.maxStringLength ?? 2_000,
  };
  const seen = new WeakSet<object>();

  const visit = (value: unknown, depth: number): SafeMetadataValue => {
    if (depth > limits.maxDepth) return "[TRUNCATED]";
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number")
      return Number.isFinite(value) ? value : String(value);
    if (typeof value === "string")
      return value
        .replace(bearerPattern, `Bearer ${redactedValue}`)
        .replace(signedUrlPattern, redactedValue)
        .slice(0, limits.maxStringLength);
    if (typeof value !== "object") return String(value).slice(0, 200);
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    if (Array.isArray(value))
      return value
        .slice(0, limits.maxArrayLength)
        .map((item) => visit(item, depth + 1));
    const output: Record<string, SafeMetadataValue> = {};
    for (const [key, nested] of Object.entries(value).slice(
      0,
      limits.maxObjectKeys,
    )) {
      const safeKey = key.slice(0, 100) || "field";
      output[safeKey] =
        sensitiveKeyPattern.test(key) || sensitivePromptKeyPattern.test(key)
          ? redactedValue
          : visit(nested, depth + 1);
    }
    return output;
  };

  return visit(input, 0);
}
