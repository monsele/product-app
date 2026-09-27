-- ST-105 (ADR-013): prompt-to-video runs. Additive only; no existing row changes.
ALTER TYPE "public"."audit_actor_type" ADD VALUE IF NOT EXISTS 'one_shot_run';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'one_shot.run_started';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'one_shot.stage_approved';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'one_shot.render_approved';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'one_shot.run_resumed';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'one_shot.run_cancelled';--> statement-breakpoint
CREATE TYPE "public"."one_shot_run_status" AS ENUM('queued', 'running', 'awaiting_render_approval', 'rendering', 'completed', 'needs_attention', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "one_shot_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"focus_prompt" text NOT NULL,
	"audience" jsonb NOT NULL,
	"target_duration_seconds" integer NOT NULL,
	"accepted_estimate_usd" numeric(12, 6) NOT NULL,
	"actual_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"status" "public"."one_shot_run_status" DEFAULT 'queued' NOT NULL,
	"current_step" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"needs_attention_stage" text,
	"error_code" text,
	"error_message" text,
	"focus_coverage" jsonb,
	"resume_count" integer DEFAULT 0 NOT NULL,
	"tick_sequence" integer DEFAULT 0 NOT NULL,
	"tick_lease_expires_at" timestamp with time zone,
	"tick_job_id" uuid,
	"last_progress_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lesson_version_id" uuid,
	"render_job_id" uuid,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_shot_runs_focus_prompt_length" CHECK (char_length("focus_prompt") BETWEEN 1 AND 1000 AND "focus_prompt" = btrim("focus_prompt")),
	CONSTRAINT "one_shot_runs_target_duration" CHECK ("target_duration_seconds" IN (180, 300, 420)),
	CONSTRAINT "one_shot_runs_costs_nonnegative" CHECK ("accepted_estimate_usd" >= 0 AND "actual_cost_usd" >= 0)
);
--> statement-breakpoint
ALTER TABLE "one_shot_runs" ADD CONSTRAINT "one_shot_runs_lesson_version_id_lesson_versions_id_fk" FOREIGN KEY ("lesson_version_id") REFERENCES "public"."lesson_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_shot_runs" ADD CONSTRAINT "one_shot_runs_render_job_id_render_jobs_id_fk" FOREIGN KEY ("render_job_id") REFERENCES "public"."render_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_shot_runs_request_unique" ON "one_shot_runs" USING btree ("owner_user_id","project_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "one_shot_runs_one_active_per_project" ON "one_shot_runs" USING btree ("project_id") WHERE "one_shot_runs"."status" in ('queued', 'running', 'awaiting_render_approval', 'rendering', 'needs_attention', 'failed');--> statement-breakpoint
CREATE INDEX "one_shot_runs_owner_created_idx" ON "one_shot_runs" USING btree ("owner_user_id","created_at");
