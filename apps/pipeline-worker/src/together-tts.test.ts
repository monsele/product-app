import { describe, expect, it, vi } from "vitest";
import { retimePcm16Wav, TogetherKokoroTtsProvider } from "./together-tts.js";

function wavOneSecond(): Uint8Array {
  const sampleRate = 24_000;
  const samples = sampleRate;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const word = (offset: number, value: string) =>
    [...value].forEach((char, index) =>
      view.setUint8(offset + index, char.charCodeAt(0)),
    );
  word(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  word(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, samples * 2, true);
  return bytes;
}

function audioResponse(audio: Uint8Array, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => audio.buffer as ArrayBuffer,
  } as Response;
}

describe("Together Kokoro TTS adapter", () => {
  it("synthesizes WAV audio, maps public voices, and defers timing to alignment", async () => {
    const audio = wavOneSecond();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(audioResponse(audio));
    const provider = new TogetherKokoroTtsProvider({
      apiKey: "test-key",
      fetcher,
      maxRetries: 0,
    });
    const result = await provider.synthesize({
      narration: "Water moves. It changes state.",
      speakingRate: 1,
      voiceId: "english-aria",
      pronunciationOverrides: [{ phrase: "Water", replacement: "H2O" }],
    });
    expect(result.durationMs).toBe(1_000);
    expect(result.timing).toEqual([]);
    expect(result.costUsd).toBeGreaterThan(0);
    const body = JSON.parse(
      fetcher.mock.calls[0]![1]?.body as string,
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "hexgrad/Kokoro-82M",
      input: "Water moves. It changes state.",
      voice: "af_bella",
      response_format: "wav",
      stream: false,
      extra_params: { pronunciation_dict: ["Water/H2O"] },
    });
    expect(JSON.stringify(body)).not.toContain('"speed"');
  });

  it("applies the teacher speaking rate to PCM audio locally", () => {
    const source = wavOneSecond();
    expect(wavDuration(retimePcm16Wav(source, 1.25))).toBe(800);
    expect(wavDuration(retimePcm16Wav(source, 0.75))).toBe(1_333);
  });

  it("retries transient audio failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(audioResponse(new Uint8Array(), 503))
      .mockResolvedValueOnce(audioResponse(wavOneSecond()));
    const provider = new TogetherKokoroTtsProvider({
      apiKey: "test-key",
      fetcher,
      maxRetries: 1,
    });
    await expect(
      provider.synthesize({ narration: "A sentence.", speakingRate: 1 }),
    ).resolves.toMatchObject({ durationMs: 1_000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

function wavDuration(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const byteRate = view.getUint32(28, true);
  const dataBytes = view.getUint32(40, true);
  return Math.round((dataBytes / byteRate) * 1_000);
}
