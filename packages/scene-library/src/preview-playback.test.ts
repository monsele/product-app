import {
  chromium,
  expect as browserExpect,
  type Browser,
} from "@playwright/test";
import { bundle } from "@remotion/bundler";
import { Buffer } from "node:buffer";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function audioFixture(): Buffer {
  const sampleRate = 24_000;
  const dataBytes = sampleRate * 12 * 2;
  const bytes = Buffer.alloc(44 + dataBytes);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + dataBytes, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < dataBytes / 2; i++)
    bytes.writeInt16LE(
      Math.round(100 * Math.sin((i * 2 * Math.PI * 220) / sampleRate)),
      44 + i * 2,
    );
  return bytes;
}

describe("preview audio playback clock", () => {
  let browser: Browser;
  let server: Server;
  let origin: string;
  beforeAll(async () => {
    const directory = await bundle({
      ignoreRegisterRootWarning: true,
      entryPoint: fileURLToPath(
        new URL("../dist/preview-playback.fixture.js", import.meta.url),
      ),
      webpackOverride: (config) => ({
        ...config,
        output: { ...config.output, filename: "playback.js" },
      }),
    });
    const script = await readFile(join(directory, "playback.js"));
    const wav = audioFixture();
    server = createServer((request, response) => {
      const isAudio = request.url === "/audio.wav";
      const isScript = request.url === "/playback.js";
      response.setHeader(
        "content-type",
        isAudio ? "audio/wav" : isScript ? "text/javascript" : "text/html",
      );
      response.end(
        isAudio
          ? wav
          : isScript
            ? script
            : '<html><body><script src="/playback.js"></script></body></html>',
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("Missing test address");
    origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  }, 120_000);
  afterAll(async () => {
    await browser?.close();
    await new Promise<void>(
      (resolve) => server?.close(() => resolve()) ?? resolve(),
    );
  });

  it.each(["lesson", "scene"])(
    "keeps %s audio monotonic during frame updates and preserves controls",
    async (mode) => {
      const page = await browser.newPage();
      try {
        await page.goto(`${origin}/${mode === "scene" ? "?scene" : ""}`);
        await page
          .getByRole("button", { name: `Play ${mode}`, exact: true })
          .click();
        const seek = page.getByLabel(`Seek ${mode}`);
        await browserExpect
          .poll(async () => Number(await seek.inputValue()))
          .toBeGreaterThan(15);
        const startedAt = Date.now();
        const startFrame = Number(await seek.inputValue());
        await page.evaluate(() => {
          window.previewAudioSeeks = [];
        });
        await page.waitForTimeout(5_000);
        const elapsed = (Date.now() - startedAt) / 1_000;
        const advanced = (Number(await seek.inputValue()) - startFrame) / 30;
        expect(Math.abs(advanced - elapsed)).toBeLessThan(0.7);
        expect(
          await page.evaluate(() =>
            window.previewAudioSeeks.filter((s) => s.to < s.from - 0.15),
          ),
        ).toEqual([]);

        await page
          .getByRole("button", { name: `Pause ${mode}`, exact: true })
          .click();
        const pausedFrame = await seek.inputValue();
        await page.waitForTimeout(300);
        expect(await seek.inputValue()).toBe(pausedFrame);
        await page
          .getByRole("button", { name: `Play ${mode}`, exact: true })
          .click();
        await browserExpect
          .poll(async () => Number(await seek.inputValue()))
          .toBeGreaterThan(Number(pausedFrame));
        if (mode === "lesson") {
          await page
            .getByRole("button", { name: "Scene 2", exact: true })
            .click();
          await browserExpect
            .poll(async () => Number(await seek.inputValue()))
            .toBeGreaterThanOrEqual(360);
          await browserExpect(
            page.getByTestId("full-lesson-caption"),
          ).toHaveText("Scene 2 narration");
          await page
            .getByRole("button", { name: "Scene 1", exact: true })
            .click();
        } else {
          await page
            .getByRole("button", { name: "Replay scene", exact: true })
            .click();
        }
        expect(Number(await seek.inputValue())).toBeLessThan(60);
        await browserExpect
          .poll(async () =>
            page.evaluate(() => {
              const audio = Array.from(window.document.querySelectorAll("audio")).find(
                (a) => a.duration > 1,
              );
              return (
                audio !== undefined && !audio.paused && audio.currentTime < 2
              );
            }),
          )
          .toBe(true);
      } finally {
        await page.close();
      }
    },
  );
});
