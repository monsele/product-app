import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { DatabaseClient } from "./client.js";

export const migrationsFolder = fileURLToPath(
  new URL("../drizzle", import.meta.url),
);

export async function migrateDatabase(
  client: DatabaseClient,
  folder = migrationsFolder,
): Promise<void> {
  await migrate(client, { migrationsFolder: folder });
}
