import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const primaryId = (name = "id") => uuid(name).primaryKey();

export const utcTimestamp = (name: string) =>
  timestamp(name, { mode: "date", withTimezone: true });

export const auditColumns = () => ({
  createdAt: utcTimestamp("created_at").notNull().defaultNow(),
  updatedAt: utcTimestamp("updated_at").notNull().defaultNow(),
});

export const revisionColumn = () => integer("revision").notNull().default(1);

export const softDeletionColumn = () => utcTimestamp("deleted_at");

export const ownershipColumn = () => uuid("owner_user_id").notNull();

/**
 * Infrastructure-only smoke table. Feature stories own all domain tables.
 * JSONB is available for versioned metadata without making it an ownership or
 * workflow source of truth.
 */
export const databaseMetadata = pgTable("database_metadata", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().default({}),
  revision: revisionColumn(),
  ...auditColumns(),
});
