import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type DatabaseClient = PostgresJsDatabase;
export type DatabaseTransaction = Parameters<
  Parameters<DatabaseClient["transaction"]>[0]
>[0];
export type DatabaseExecutor = DatabaseClient | DatabaseTransaction;

export type DatabaseConnection = {
  client: DatabaseClient;
  healthCheck: () => Promise<void>;
  close: () => Promise<void>;
};

export type DatabaseConnectionOptions = {
  maxConnections?: number;
  connectTimeoutSeconds?: number;
  idleTimeoutSeconds?: number;
};

export function validatePostgresUrl(databaseUrl: string): URL {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new TypeError("Database connection URL must be a valid URL.");
  }
  if (
    parsedUrl.protocol !== "postgres:" &&
    parsedUrl.protocol !== "postgresql:"
  )
    throw new TypeError("Database connection URL must use PostgreSQL.");
  return parsedUrl;
}

export function createDatabaseConnection(
  databaseUrl: string,
  options: DatabaseConnectionOptions = {},
): DatabaseConnection {
  const pool = postgres(validatePostgresUrl(databaseUrl).toString(), {
    max: options.maxConnections ?? 10,
    connect_timeout: options.connectTimeoutSeconds ?? 10,
    idle_timeout: options.idleTimeoutSeconds ?? 20,
    onnotice: () => undefined,
  });
  const client = drizzle(pool);

  return {
    client,
    healthCheck: async () => {
      await pool`select 1`;
    },
    close: () => pool.end({ timeout: 5 }),
  };
}

export async function inTransaction<T>(
  client: DatabaseClient,
  work: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return client.transaction(work);
}
