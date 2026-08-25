CREATE TYPE "public"."validation_run_status" AS ENUM('passed', 'failed');--> statement-breakpoint

CREATE TABLE "validation_runs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "project_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "lesson_spec_id" uuid NOT NULL REFERENCES "lesson_specs"("id") ON DELETE cascade,
  "lesson_spec_revision" integer NOT NULL,
  "lesson_spec_content_hash" text NOT NULL,
  "input_hash" text NOT NULL,
  "ruleset_version" text NOT NULL,
  "scene_library_version" text NOT NULL,
  "artifact_hashes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" "validation_run_status" NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone NOT NULL
);--> statement-breakpoint

CREATE TABLE "validation_issues" (
  "id" uuid PRIMARY KEY NOT NULL,
  "project_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "validation_runs"("id") ON DELETE cascade,
  "severity" text NOT NULL,
  "code" text NOT NULL,
  "scope_type" text NOT NULL,
  "scope_id" uuid,
  "scene_id" uuid,
  "field_path" text NOT NULL,
  "message" text NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "acknowledgeable" boolean DEFAULT false NOT NULL,
  "acknowledged_at" timestamp with time zone,
  "acknowledged_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX "validation_runs_tenant_input_hash_unique" ON "validation_runs" USING btree ("owner_user_id", "project_id", "input_hash");--> statement-breakpoint
CREATE INDEX "validation_runs_owner_project_completed_idx" ON "validation_runs" USING btree ("owner_user_id", "project_id", "completed_at");--> statement-breakpoint
CREATE INDEX "validation_runs_lesson_spec_idx" ON "validation_runs" USING btree ("lesson_spec_id");--> statement-breakpoint
CREATE INDEX "validation_issues_owner_project_run_idx" ON "validation_issues" USING btree ("owner_user_id", "project_id", "run_id");--> statement-breakpoint
CREATE INDEX "validation_issues_run_severity_idx" ON "validation_issues" USING btree ("run_id", "severity");--> statement-breakpoint
CREATE INDEX "validation_issues_scene_idx" ON "validation_issues" USING btree ("scene_id");
