import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "./testing.js";

describe("test database boundary", () => {
  const originalNodeEnvironment = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnvironment;
  });

  it("rejects database administration outside the test runtime", async () => {
    process.env.NODE_ENV = "production";

    await expect(
      createTestDatabase("postgresql://postgres:postgres@localhost/postgres"),
    ).rejects.toThrow("NODE_ENV is test");
  });
});
