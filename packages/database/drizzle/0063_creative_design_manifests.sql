CREATE TABLE "creative_design_presets" (
  "id" uuid PRIMARY KEY NOT NULL,
  "project_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "archived_at" timestamp with time zone,
  "revision" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "creative_design_presets_project_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade,
  CONSTRAINT "creative_design_presets_owner_fk" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE restrict
);
CREATE UNIQUE INDEX "creative_design_presets_tenant_name_unique" ON "creative_design_presets" ("owner_user_id", "project_id", "name");
CREATE INDEX "creative_design_presets_owner_project_idx" ON "creative_design_presets" ("owner_user_id", "project_id");

CREATE TABLE "creative_design_preset_versions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "project_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "preset_id" uuid NOT NULL REFERENCES "creative_design_presets"("id") ON DELETE restrict,
  "version_number" integer NOT NULL,
  "manifest" jsonb NOT NULL,
  "manifest_hash" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "creative_design_preset_versions_number_unique" ON "creative_design_preset_versions" ("preset_id", "version_number");
CREATE UNIQUE INDEX "creative_design_preset_versions_hash_unique" ON "creative_design_preset_versions" ("owner_user_id", "project_id", "manifest_hash");

CREATE TABLE "creative_design_drafts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "project_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "lesson_spec_id" uuid NOT NULL REFERENCES "lesson_specs"("id") ON DELETE cascade,
  "lesson_spec_revision" integer NOT NULL,
  "manifest" jsonb NOT NULL,
  "manifest_hash" text NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "creative_design_drafts_lesson_spec_unique" ON "creative_design_drafts" ("lesson_spec_id");
CREATE INDEX "creative_design_drafts_owner_project_idx" ON "creative_design_drafts" ("owner_user_id", "project_id");

CREATE TABLE "creative_design_snapshots" (
  "id" uuid PRIMARY KEY NOT NULL,
  "project_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "lesson_spec_id" uuid NOT NULL REFERENCES "lesson_specs"("id") ON DELETE restrict,
  "lesson_spec_revision" integer NOT NULL,
  "manifest" jsonb NOT NULL,
  "manifest_hash" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "creative_design_snapshots_hash_unique" ON "creative_design_snapshots" ("owner_user_id", "project_id", "manifest_hash");
CREATE INDEX "creative_design_snapshots_owner_project_idx" ON "creative_design_snapshots" ("owner_user_id", "project_id");
