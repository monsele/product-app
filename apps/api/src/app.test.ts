import { afterEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createId, identifierSchema } from "@avlp/config";
import { createApp } from "./app.js";

describe("API correlation middleware", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("returns a client correlation ID and generates one when absent", async () => {
    app = await createApp();
    expect(app.getHttpAdapter().getInstance().log.level).toBe("info");
    const suppliedId = createId();
    const suppliedResponse = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: "GET",
        url: "/health",
        headers: { "x-correlation-id": suppliedId },
      });
    expect(suppliedResponse.headers["x-correlation-id"]).toBe(suppliedId);

    const generatedResponse = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: "GET", url: "/health" });
    expect(
      identifierSchema.safeParse(generatedResponse.headers["x-correlation-id"])
        .success,
    ).toBe(true);
  });

  it("returns a safe 503 when the database health check fails", async () => {
    app = await createApp({
      database: {
        healthCheck: () =>
          Promise.reject(new Error("secret connection detail")),
        close: () => Promise.resolve(),
      },
    });
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("secret connection detail");
    expect(response.json()).toMatchObject({
      error: { code: "internal_error", retryable: true },
    });
  });
});
