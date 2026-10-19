import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { setTimeout, clearTimeout } from "node:timers";
import {
  fontParserRequestSchema,
  fontParserResponseSchema,
  type DesignSystemFontInspection,
} from "./design-system-font-contract.js";

/** A parser crash, runaway layout or allocation cannot terminate the job host. */
export async function inspectIsolatedDesignSystemFont(
  bytes: Uint8Array,
  mediaType: string,
  options: { timeoutMs?: number } = {},
): Promise<DesignSystemFontInspection> {
  const input = fontParserRequestSchema.parse({ bytes, mediaType });
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000)
    throw new Error("Invalid font inspection deadline.");
  // Source execution uses the same pinned tsx loader as the development worker.
  // Compiled production code needs only Node and the compiled parser module.
  const source = new URL(import.meta.url).pathname.endsWith(".ts");
  const parser = new URL(
    source
      ? "./design-system-font-parser.ts"
      : "./design-system-font-parser.js",
    import.meta.url,
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--max-old-space-size=128",
        "--max-semi-space-size=16",
        ...(source
          ? [
              "--import",
              pathToFileURL(createRequire(import.meta.url).resolve("tsx/esm"))
                .href,
            ]
          : []),
        fileURLToPath(parser),
      ],
      {
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        serialization: "advanced",
        windowsHide: true,
        // The decoder has no need for storage, database or provider credentials.
        env: {
          ...(process.env.SystemRoot
            ? { SystemRoot: process.env.SystemRoot }
            : {}),
          ...(process.env.TEMP ? { TEMP: process.env.TEMP } : {}),
        },
      },
    );
    let settled = false;
    const finish = (inspection?: DesignSystemFontInspection) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      child.kill("SIGKILL");
      if (inspection) resolve(inspection);
      else
        reject(
          new Error(
            "The font is invalid or exceeds inspection resource limits.",
          ),
        );
    };
    const deadline = setTimeout(() => finish(), timeoutMs);
    child.on("error", () => finish());
    child.on("exit", () => finish());
    child.on("message", (message: unknown) => {
      const result = fontParserResponseSchema.safeParse(message);
      finish(
        result.success && result.data.ok ? result.data.inspection : undefined,
      );
    });
    try {
      if (!child.send) {
        finish();
        return;
      }
      child.send(input, (error) => {
        if (error) finish();
      });
    } catch {
      finish();
    }
  });
}
