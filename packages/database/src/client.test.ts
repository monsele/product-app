import { describe, expect, it } from "vitest";
import { createDatabaseConnection, validatePostgresUrl } from "./client.js";

describe("database health", () => {
  it("rejects non-PostgreSQL URLs before opening a connection", () => {
    expect(() =>
      validatePostgresUrl("https://database.example.test/app"),
    ).toThrow("must use PostgreSQL");
  });

  it("fails safely when PostgreSQL cannot be reached", async () => {
    const connection = createDatabaseConnection(
      "postgresql://postgres:postgres@127.0.0.1:1/unreachable",
      { connectTimeoutSeconds: 1, maxConnections: 1 },
    );
    try {
      await expect(connection.healthCheck()).rejects.toBeDefined();
    } finally {
      await connection.close();
    }
  });
});
