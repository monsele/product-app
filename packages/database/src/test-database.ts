import { randomUUID } from "node:crypto";
import postgres from "postgres";
import {
  createDatabaseConnection,
  validatePostgresUrl,
  type DatabaseConnection,
} from "./client.js";

export type TestDatabase = DatabaseConnection & {
  databaseName: string;
  destroy: () => Promise<void>;
};

const safeDatabaseNamePattern = /^avlp_test_[0-9a-f]{32}$/;

function assertTestRuntime(): void {
  if (process.env.NODE_ENV !== "test")
    throw new Error(
      "Test databases may only be created while NODE_ENV is test.",
    );
}

export async function createTestDatabase(
  serverUrl: string,
): Promise<TestDatabase> {
  assertTestRuntime();
  const databaseName = `avlp_test_${randomUUID().replaceAll("-", "")}`;
  if (!safeDatabaseNamePattern.test(databaseName))
    throw new Error("Generated an unsafe test database name.");

  const adminUrl = validatePostgresUrl(serverUrl);
  adminUrl.pathname = "/postgres";
  const databaseUrl = validatePostgresUrl(serverUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const admin = postgres(adminUrl.toString(), {
    max: 1,
    onnotice: () => undefined,
  });

  try {
    await admin.unsafe(`create database "${databaseName}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }
  const connection = createDatabaseConnection(databaseUrl.toString(), {
    maxConnections: 2,
  });
  let destroyed = false;

  return {
    ...connection,
    databaseName,
    destroy: async () => {
      if (destroyed) return;
      const cleanupAdmin = postgres(adminUrl.toString(), {
        max: 1,
        onnotice: () => undefined,
      });
      try {
        await connection.close();
        await cleanupAdmin`
          select pg_terminate_backend(pid)
          from pg_stat_activity
          where datname = ${databaseName} and pid <> pg_backend_pid()
        `;
        await cleanupAdmin.unsafe(`drop database if exists "${databaseName}"`);
        destroyed = true;
      } finally {
        await cleanupAdmin.end({ timeout: 5 });
      }
    },
  };
}
