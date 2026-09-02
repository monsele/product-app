import { Buffer } from "node:buffer";
import { setTimeout } from "node:timers";
import { describe, expect, it, vi } from "vitest";
import {
  TogetherIllustrationProvider,
  TogetherLanguageModelProvider,
  togetherModelDefaults,
} from "./together-provider.js";

const png1x1 = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65,
  84, 8, 215, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61,
  29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function streamResponse(chunks: readonly unknown[]): Response {
  const events = [
    ...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`),
    "data: [DONE]\n\n",
  ].join("");
  return new Response(events, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function chunk(input: {
  content?: string;
  reasoning?: string;
  finishReason?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}): unknown {
  return {
    model: togetherModelDefaults.llm,
    choices:
      input.usage === undefined
        ? [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: input.content ?? "",
                reasoning: input.reasoning ?? "",
              },
              text: input.content ?? "",
              finish_reason: input.finishReason ?? null,
            },
          ]
        : [],
    usage: input.usage ?? null,
  };
}

describe("Together provider adapters", () => {
  it("maps Together chat completions into the provider-neutral contract", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        id: "chat-1",
        model: togetherModelDefaults.llm,
        choices: [
          {
            message: { role: "assistant", content: '{"ok":true}' },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      }),
    );
    const provider = new TogetherLanguageModelProvider({
      apiKey: "test-key",
      fetcher,
      maxRetries: 0,
    });
    const result = await provider.complete({
      model: togetherModelDefaults.llm,
      messages: [{ role: "user", content: "Return JSON." }],
      responseFormat: "json_object",
    });
    expect(result).toMatchObject({
      providerId: "together",
      model: togetherModelDefaults.llm,
      text: '{"ok":true}',
      usage: { inputTokens: 12, outputTokens: 4 },
      retries: 0,
    });
    expect(JSON.parse(fetcher.mock.calls[0]![1]?.body as string)).toMatchObject({
      model: togetherModelDefaults.llm,
    });
    expect(JSON.parse(fetcher.mock.calls[0]![1]?.body as string)).not.toHaveProperty("response_format");
    expect(JSON.parse(fetcher.mock.calls[0]![1]?.body as string)).not.toHaveProperty("reasoning");
  });

  it("streams chat completions and drops reasoning deltas", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      streamResponse([
        chunk({ reasoning: "thinking about the answer" }),
        chunk({ content: '{"ok":' }),
        chunk({ content: "true}" }),
        chunk({ finishReason: "stop" }),
        chunk({ usage: { prompt_tokens: 73, completion_tokens: 41 } }),
      ]),
    );
    const provider = new TogetherLanguageModelProvider({
      apiKey: "test-key",
      fetcher,
      maxRetries: 0,
    });
    await expect(
      provider.complete({
        model: togetherModelDefaults.llm,
        messages: [{ role: "user", content: "Return JSON." }],
      }),
    ).resolves.toMatchObject({
      text: '{"ok":true}',
      finishReason: "stop",
      usage: { inputTokens: 73, outputTokens: 41 },
    });
    expect(JSON.parse(fetcher.mock.calls[0]![1]?.body as string)).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it("treats the request timeout as a stall guard rather than a total duration cap", async () => {
    const chunks = [
      chunk({ content: '{"ok":' }),
      chunk({ content: "true}" }),
      chunk({ finishReason: "stop" }),
      chunk({ usage: { prompt_tokens: 5, completion_tokens: 2 } }),
    ];
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        for (const part of chunks) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const provider = new TogetherLanguageModelProvider({
      apiKey: "test-key",
      fetcher,
      maxRetries: 0,
      // The whole stream outlives this window; only a silent gap may abort.
      requestTimeoutMs: 1_000,
    });
    await expect(
      provider.complete({
        model: togetherModelDefaults.llm,
        messages: [{ role: "user", content: "Return JSON." }],
      }),
    ).resolves.toMatchObject({ text: '{"ok":true}' });
  });

  it("retries transient Together responses without retrying terminal errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ error: {} }, 503))
      .mockResolvedValueOnce(
        response({
          model: togetherModelDefaults.llm,
          choices: [{ message: { content: "done" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      );
    const provider = new TogetherLanguageModelProvider({
      apiKey: "test-key",
      fetcher,
      maxRetries: 1,
    });
    await expect(
      provider.complete({
        model: togetherModelDefaults.llm,
        messages: [{ role: "user", content: "Generate." }],
      }),
    ).resolves.toMatchObject({ retries: 1 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("decodes a PNG image and keeps the provider safety gate enabled", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        id: "image-1",
        data: [{ b64_json: Buffer.from(png1x1).toString("base64") }],
      }),
    );
    const provider = new TogetherIllustrationProvider({
      apiKey: "test-key",
      fetcher,
      maxRetries: 0,
    });
    const result = await provider.generate({
      prompt: "A simple educational diagram of a water cycle.",
      size: "1024x1024",
      style: "flat-educational-vector",
    });
    expect(result).toMatchObject({
      providerId: "together",
      providerCallId: "image-1",
      mediaType: "image/png",
      width: 1,
      height: 1,
      units: 1,
      moderation: { status: "approved", code: "together_safety_checker" },
    });
    expect(JSON.parse(fetcher.mock.calls[0]![1]?.body as string)).toMatchObject({
      model: togetherModelDefaults.image,
      response_format: "base64",
      output_format: "png",
      disable_safety_checker: false,
    });
  });

  it("does not expose response bodies in provider errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({ error: { message: "secret upstream detail" } }, 400),
    );
    const provider = new TogetherLanguageModelProvider({
      apiKey: "test-key",
      fetcher,
      maxRetries: 0,
    });
    await expect(
      provider.complete({
        model: togetherModelDefaults.llm,
        messages: [{ role: "user", content: "Generate." }],
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_REQUEST_REJECTED",
      message: expect.not.stringContaining("secret upstream detail"),
    });
  });
});
