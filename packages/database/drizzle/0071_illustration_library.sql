-- ST-113: the curated, platform-owned illustration library used as the
-- picture fallback of v2 designs. Additive only; no existing row changes.
CREATE TABLE "illustration_library_entries" (
  "id" uuid PRIMARY KEY NOT NULL,
  "illustration_key" text NOT NULL,
  "treatment" text NOT NULL,
  "surface" text NOT NULL,
  "concept" text NOT NULL,
  "description" text NOT NULL,
  "subject" text NOT NULL,
  "depicts_people" boolean NOT NULL,
  "alt_text" text NOT NULL,
  "status" text NOT NULL DEFAULT 'generating',
  "storage_key" text,
  "checksum_sha256" text,
  "content_type" text,
  "width" integer,
  "height" integer,
  "prompt" text NOT NULL,
  "prompt_version" text NOT NULL,
  "provider" text NOT NULL,
  "model" text,
  "provider_call_id" text,
  "cost_usd" numeric(14, 6),
  "failure_code" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "illustration_library_entries_storage_key_unique" UNIQUE("storage_key"),
  CONSTRAINT "illustration_library_entries_status_check" CHECK ("status" IN ('generating', 'active', 'rejected', 'failed', 'retired')),
  CONSTRAINT "illustration_library_entries_treatment_check" CHECK ("treatment" IN ('flat', 'ink-sketch', 'editorial')),
  CONSTRAINT "illustration_library_entries_surface_check" CHECK ("surface" IN ('light', 'dark')),
  CONSTRAINT "illustration_library_entries_subject_check" CHECK ("subject" IN ('object', 'person', 'place', 'process')),
  CONSTRAINT "illustration_library_entries_key_treatment_check" CHECK (starts_with("illustration_key", "treatment" || ':')),
  CONSTRAINT "illustration_library_entries_checksum_check" CHECK ("checksum_sha256" IS NULL OR "checksum_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "illustration_library_entries_storage_prefix_check" CHECK ("storage_key" IS NULL OR "storage_key" LIKE 'catalog/illustrations/%'),
  CONSTRAINT "illustration_library_entries_active_has_bytes" CHECK ("status" NOT IN ('active', 'retired') OR ("storage_key" IS NOT NULL AND "checksum_sha256" IS NOT NULL AND "content_type" = 'image/png')),
  CONSTRAINT "illustration_library_entries_cost_nonnegative" CHECK ("cost_usd" IS NULL OR "cost_usd" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "illustration_library_entries_key_surface_unique" ON "illustration_library_entries" ("illustration_key", "surface");
--> statement-breakpoint
CREATE INDEX "illustration_library_entries_lookup_idx" ON "illustration_library_entries" ("treatment", "surface", "status");
