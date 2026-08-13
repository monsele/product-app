import { describe, expect, it, vi } from "vitest";
import { shutdownRenderWorkerResources } from "./runtime.js";

describe("render worker runtime lifecycle", () => {
  it("drains the consumer before closing its database dependency", async () => {
    const order: string[] = [];
    const logger = { error: vi.fn() };

    await shutdownRenderWorkerResources({
      consumer: {
        close: async () => {
          order.push("consumer:start");
          await Promise.resolve();
          order.push("consumer:end");
        },
      },
      database: {
        close: async () => {
          order.push("database");
        },
      },
      logger,
    });

    expect(order).toEqual(["consumer:start", "consumer:end", "database"]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("still closes the database and records a safe error if consumer shutdown fails", async () => {
    const databaseClose = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const logger = { error: vi.fn() };

    await shutdownRenderWorkerResources({
      consumer: {
        close: () => Promise.reject(new Error("consumer close failed")),
      },
      database: { close: databaseClose },
      logger,
    });

    expect(databaseClose).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith("worker.shutdown_failed", {
      service: "renderer",
    });
  });
});
