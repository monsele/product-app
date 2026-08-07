import { describe, expect, it } from "vitest";
import { parseEnvironment } from "./index.js";

describe("parseEnvironment", () => {
  it("accepts required service connection values", () => {
    expect(
      parseEnvironment({
        DATABASE_URL: "postgresql://localhost/app",
        REDIS_URL: "redis://localhost:6379",
      }).PORT,
    ).toBe(3001);
  });

  it("rejects invalid external configuration at the boundary", () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: "not-a-url",
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toThrow();
  });
});
