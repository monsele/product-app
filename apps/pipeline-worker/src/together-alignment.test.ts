import { describe, expect, it, vi } from "vitest";
import { TogetherWhisperAlignmentProvider } from "./together-alignment.js";

const response = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

describe("Together audio alignment adapter", () => {
  it("maps different word splits to exact narration without estimating timestamps", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        words: [
          { word: "Water", start: 0, end: 0.2 },
          { word: "cycle.", start: 0.2, end: 0.5 },
          { word: "It", start: 0.7, end: 0.8 },
          { word: "can't", start: 0.8, end: 1 },
          { word: "stop.", start: 1, end: 1.5 },
        ],
      }),
    );
    const provider = new TogetherWhisperAlignmentProvider({
      apiKey: "test-key",
      fetcher,
      maxRetries: 0,
    });
    await expect(
      provider.align({
        audio: new Uint8Array([1]),
        narration: "Water-cycle. It — can't stop.",
        durationMs: 1500,
      }),
    ).resolves.toMatchObject({
      timing: [
        { text: "Water-cycle.", startMs: 0, endMs: 500 },
        { text: "It — can't stop.", startMs: 700, endMs: 1500 },
      ],
    });
    await expect(
      provider.align({
        audio: new Uint8Array([1]),
        narration: "Water-cycle. It — cannot possibly stop.",
        durationMs: 1500,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_ALIGNMENT_MISMATCH" });
  });
  it("keeps real timing when the transcript mishears numbers, symbols and names", async () => {
    // Parakeet transcribes freely: digits come back as words, symbols split,
    // and a name is misheard. The old matcher threw on the count difference
    // and the scene fell back to evenly spread, estimated captions.
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        words: [
          { word: "Plants", start: 0.3, end: 0.6 },
          { word: "take", start: 0.6, end: 0.8 },
          { word: "in", start: 0.8, end: 0.9 },
          { word: "C", start: 0.9, end: 1.0 },
          { word: "O", start: 1.0, end: 1.1 },
          { word: "two.", start: 1.1, end: 1.5 },
          { word: "About", start: 3.0, end: 3.3 },
          { word: "ninety", start: 3.3, end: 3.6 },
          { word: "percent", start: 3.6, end: 4.0 },
          { word: "comes", start: 4.0, end: 4.3 },
          { word: "from", start: 4.3, end: 4.5 },
          { word: "the", start: 4.5, end: 4.6 },
          { word: "leaves.", start: 4.6, end: 5.2 },
          { word: "Calvin", start: 6.0, end: 6.4 },
          { word: "showed", start: 6.4, end: 6.7 },
          { word: "this", start: 6.7, end: 6.9 },
          { word: "first.", start: 6.9, end: 7.4 },
        ],
      }),
    );
    const provider = new TogetherWhisperAlignmentProvider({
      apiKey: "test-key",
      model: "nvidia/parakeet-tdt-0.6b-v3",
      fetcher,
      maxRetries: 0,
    });
    await expect(
      provider.align({
        audio: new Uint8Array([1]),
        narration:
          "Plants take in CO2. About 90% comes from the leaves. Kelvin showed this first.",
        durationMs: 8_000,
      }),
    ).resolves.toMatchObject({
      timing: [
        { text: "Plants take in CO2.", startMs: 300, endMs: 1500 },
        { text: "About 90% comes from the leaves.", startMs: 3000, endMs: 5200 },
        { text: "Kelvin showed this first.", startMs: 6000, endMs: 7400 },
      ],
    });
  });
  it("interpolates a sentence the transcript dropped between its neighbours", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        words: [
          { word: "Heat", start: 0, end: 0.4 },
          { word: "rises", start: 0.4, end: 1 },
          { word: "cold", start: 3, end: 3.4 },
          { word: "air", start: 3.4, end: 3.6 },
          { word: "sinks", start: 3.6, end: 4 },
        ],
      }),
    );
    const provider = new TogetherWhisperAlignmentProvider({
      apiKey: "test-key",
      fetcher,
      maxRetries: 0,
    });
    await expect(
      provider.align({
        audio: new Uint8Array([1]),
        narration: "Heat rises. Yes. Cold air sinks.",
        durationMs: 4_000,
      }),
    ).resolves.toMatchObject({
      timing: [
        { text: "Heat rises.", startMs: 0, endMs: 1000 },
        { text: "Yes.", startMs: 1000, endMs: 3000 },
        { text: "Cold air sinks.", startMs: 3000, endMs: 4000 },
      ],
    });
  });
  it("accepts quantized word anchors while requiring positive sentence duration", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        words: [
          { word: "Hello", start: 0.1, end: 0.1 },
          { word: "world.", start: 0.2, end: 0.5 },
        ],
      }),
    );
    const provider = new TogetherWhisperAlignmentProvider({
      apiKey: "test-key",
      fetcher,
      maxRetries: 0,
    });
    await expect(
      provider.align({
        audio: new Uint8Array([1]),
        narration: "Hello world.",
        durationMs: 1000,
      }),
    ).resolves.toMatchObject({
      timing: [{ startMs: 100, endMs: 500, text: "Hello world." }],
    });
    fetcher.mockResolvedValue(
      response({ words: [{ word: "Hello.", start: 0.1, end: 0.1 }] }),
    );
    await expect(
      provider.align({
        audio: new Uint8Array([1]),
        narration: "Hello.",
        durationMs: 1000,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_INVALID_ALIGNMENT" });
    fetcher.mockResolvedValue(
      response({ words: [{ word: "Hello.", start: 0.5, end: 0.1 }] }),
    );
    await expect(
      provider.align({
        audio: new Uint8Array([1]),
        narration: "Hello.",
        durationMs: 1000,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_INVALID_ALIGNMENT" });
  });
  it("uses an explicitly configured replacement model and still requires word timing", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ words: [{ word: "Hello.", start: 0, end: 1 }] }),
      );
    const provider = new TogetherWhisperAlignmentProvider({
      apiKey: "test-key",
      model: "nvidia/parakeet-tdt-0.6b-v3",
      fetcher,
      maxRetries: 0,
    });
    await expect(
      provider.align({
        audio: new Uint8Array([1]),
        narration: "Hello.",
        durationMs: 1000,
      }),
    ).resolves.toMatchObject({
      timing: [{ startMs: 0, endMs: 1000, text: "Hello." }],
    });
    expect((fetcher.mock.calls[0]![1]!.body as FormData).get("model")).toBe(
      "nvidia/parakeet-tdt-0.6b-v3",
    );
  });
  it("preserves HTTP status on exhausted alignment failures without retaining the response body", async () => {
    const provider = new TogetherWhisperAlignmentProvider({
      apiKey: "test-key",
      maxRetries: 0,
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(response({ message: "private narration" }, 503)),
    });
    const error = await provider
      .align({
        audio: new Uint8Array([1]),
        narration: "Hello.",
        durationMs: 1000,
      })
      .catch((error: unknown) => error);
    expect(error).toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      providerStatus: 503,
      retryable: true,
    });
    expect(JSON.stringify(error)).not.toContain("private narration");
  });
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
    expect(form.get("model")).toBe("nvidia/parakeet-tdt-0.6b-v3");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.get("timestamp_granularities")).toBe("word");
    expect(form.has("timestamp_granularities[0]")).toBe(false);
  });

  it("retries transient transcription failures without exposing provider payloads", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ error: { secret: "do-not-leak" } }, 503),
      )
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
