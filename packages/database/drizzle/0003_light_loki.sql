ALTER TABLE "usage_records" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
UPDATE "usage_records"
SET "idempotency_key" = 'legacy:' || "id"::text
WHERE "idempotency_key" IS NULL;--> statement-breakpoint
ALTER TABLE "usage_records" ALTER COLUMN "idempotency_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_records_idempotency_key_unique" ON "usage_records" USING btree ("idempotency_key");
