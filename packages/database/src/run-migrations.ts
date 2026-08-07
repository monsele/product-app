import { createDatabaseConnection } from "./client.js";
import { migrateDatabase } from "./migrations.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined)
  throw new Error("DATABASE_URL is required to apply migrations.");

const connection = createDatabaseConnection(databaseUrl, { maxConnections: 1 });
try {
  await migrateDatabase(connection.client);
} finally {
  await connection.close();
}
