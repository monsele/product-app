import { describe, expect, it, vi } from "vitest";
import { TogetherWhisperAlignmentProvider } from "./together-alignment.js";

const response = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

describe("Together Whisper alignment adapter", () => {
  it("requests word timestamps and maps them to approved narration sentences", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        text: "Water moves. It changes state.",
        words: [
          { word: "Water", start: 0.1, end: 0.4 },
          { word: "moves.", start: 0.45, end: 0.8 },
          { word: "It", start: 1.2, end: 1.35 },
          { word: "changes", start: 1.4, end: 1.7 },
          { word: "state.", start: 1.75, end: 2.1 },
        ],
      }),
    );
    const provider = new TogetherWhisperAlignmentProvider({
      apiKey: "test-key",
      fetcher,
      maxRetries: 0,
    });

    const result = await provider.align({
      audio: new Uint8Array([1, 2, 3]),
      narration: "Water moves. It changes state.",
      durationMs: 2_100,
    });

    expect(result.timing).toEqual([
      { startMs: 100, endMs: 800, text: "Water moves." },
      { startMs: 1_200, endMs: 2_100, text: "It changes state." },
    ]);
    expect(result.providerCallId).toMatch(/^together-alignment-/);
    expect(result.costUsd).toBeCloseTo(0.0015 * (2_100 / 60_000));
    const request = fetcher.mock.calls[0]![1]!;
    expect(request.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(request.body).toBeInstanceOf(FormData);
    const form = request.body as FormData;
    expect(form.get("model")).toBe("openai/whisper-large-v3");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.get("timestamp_granularities[0]")).toBe("word");
  });

  it("retries transient transcription failures without exposing provider payloads", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ error: { secret: "do-not-leak" } }, 503))
      .mockResolvedValueOnce(
        response({ words: [{ word: "Hello.", start: 0, end: 1 }] }),
      );
    const provider = new TogetherWhisperAlignmentProvider({
      apiKey: "test-key",
      fetcher,
      maxRetries: 1,
    });

    await expect(
      provider.align({
        audio: new Uint8Array([1]),
        narration: "Hello.",
        durationMs: 1_000,
      }),
    ).resolves.toMatchObject({ timing: [{ text: "Hello." }], retryCount: 1 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
