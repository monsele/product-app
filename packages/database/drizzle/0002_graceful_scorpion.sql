CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TYPE "public"."audit_event_type" AS ENUM('auth.registration', 'auth.login', 'auth.login_failed', 'auth.logout', 'auth.password_reset_requested', 'auth.password_changed', 'document.uploaded', 'document.deleted', 'share.created', 'share.revoked', 'lesson.approved', 'ai.generated', 'version.restored', 'render.initiated', 'job.admin_retried');--> statement-breakpoint
CREATE TYPE "public"."usage_operation_type" AS ENUM('document.ingestion', 'ai.objectives', 'ai.outline', 'ai.narration', 'ai.storyboard', 'ai.scene_regeneration', 'image.generation', 'tts.generation', 'video.render');--> statement-breakpoint
CREATE TYPE "public"."usage_status" AS ENUM('succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"project_id" uuid,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_user_id" uuid,
	"event_type" "audit_event_type" NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"operation_type" "usage_operation_type" NOT NULL,
	"provider" text,
	"model" text,
	"unit" text NOT NULL,
	"quantity" numeric(20, 4) NOT NULL,
	"input_units" integer,
	"output_units" integer,
	"estimated_cost_usd" numeric(14, 6) NOT NULL,
	"latency_ms" integer,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"status" "usage_status" NOT NULL,
	"correlation_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_events_project_occurred_idx" ON "audit_events" USING btree ("owner_user_id","project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_occurred_idx" ON "audit_events" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "usage_records_project_operation_idx" ON "usage_records" USING btree ("owner_user_id","project_id","operation_type","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_records_user_operation_idx" ON "usage_records" USING btree ("owner_user_id","operation_type","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_records_correlation_idx" ON "usage_records" USING btree ("correlation_id");