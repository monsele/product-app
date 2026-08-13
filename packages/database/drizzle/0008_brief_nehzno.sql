ALTER TABLE "jobs" ADD COLUMN "progress" real DEFAULT 0 NOT NULL;
UPDATE "jobs" SET "progress" = 1 WHERE "state" = 'succeeded';
