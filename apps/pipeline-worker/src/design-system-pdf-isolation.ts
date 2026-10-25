import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { setTimeout, clearTimeout } from "node:timers";
import {
  pdfParserRequestSchema,
  pdfParserResponseSchema,
  type PdfInspection,
} from "./design-system-pdf-contract.js";

/** A parser crash, runaway layout or allocation cannot terminate the job host. */
export async function inspectIsolatedDesignSystemPdf(
  bytes: Uint8Array,
  options: { timeoutMs?: number; extractText?: boolean } = {},
): Promise<PdfInspection> {
  const input = pdfParserRequestSchema.parse(bytes);
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000)
    throw new Error("Invalid PDF inspection deadline.");
  // Source execution uses the same pinned tsx loader as the development worker.
  // Compiled production code needs only Node and the compiled parser module.
  const source = new URL(import.meta.url).pathname.endsWith(".ts");
  const parser = new URL(
    source ? "./design-system-pdf-parser.ts" : "./design-system-pdf-parser.js",
    import.meta.url,
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        options.extractText
          ? "--max-old-space-size=256"
          : "--max-old-space-size=128",
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
    const finish = (inspection?: PdfInspection) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      child.kill("SIGKILL");
      if (inspection) resolve(inspection);
      else
        reject(
          new Error(
            "The PDF is invalid or exceeds inspection resource limits.",
          ),
        );
    };
    const deadline = setTimeout(() => finish(), timeoutMs);
    child.on("error", () => finish());
    child.on("exit", () => finish());
    child.on("message", (message: unknown) => {
      const result = pdfParserResponseSchema.safeParse(message);
      finish(
        result.success && result.data.ok ? result.data.inspection : undefined,
      );
    });
    try {
      if (!child.send) {
        finish();
        return;
      }
      child.send(
        options.extractText ? { bytes: input, extractText: true } : input,
        (error) => {
          if (error) finish();
        },
      );
    } catch {
      finish();
    }
  });
}
