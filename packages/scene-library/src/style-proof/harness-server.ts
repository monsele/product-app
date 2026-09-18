/**
 * ST-094 — static server for the browser harness bundle.
 *
 * It serves the whole bundle directory, not just the entry script. The pinned
 * `.woff2` files are emitted as bundle assets, and the preview must fetch the
 * real font files for the browser/server parity comparison to mean anything.
 *
 * Test-only: deliberately not re-exported from `./index.js`.
 */

import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const contentTypes: Readonly<Record<string, string>> = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const page =
  '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><div id="root"></div><script src="/harness.js"></script></body></html>';

export type HarnessServer = Readonly<{
  close: () => Promise<void>;
  origin: string;
}>;

export async function startHarnessServer(
  bundleDirectory: string,
): Promise<HarnessServer> {
  const root = resolve(bundleDirectory);
  const server: Server = createServer((request, response) => {
    const requestPath = (request.url ?? "/").split("?")[0] ?? "/";
    if (requestPath === "/" || requestPath === "/index.html") {
      response.setHeader("content-type", "text/html");
      response.end(page);
      return;
    }
    const target = resolve(join(root, normalize(requestPath)));
    // Path traversal guard: the harness serves a build directory, nothing else.
    if (!target.startsWith(root + sep)) {
      response.statusCode = 403;
      response.end();
      return;
    }
    void readFile(target).then(
      (bytes) => {
        response.setHeader(
          "content-type",
          contentTypes[extname(target).toLowerCase()] ??
            "application/octet-stream",
        );
        response.end(bytes);
      },
      () => {
        response.statusCode = 404;
        response.end();
      },
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Harness server did not bind a port.");
  return Object.freeze({
    close: () => new Promise<void>((done) => server.close(() => done())),
    origin: `http://127.0.0.1:${address.port}`,
  });
}
