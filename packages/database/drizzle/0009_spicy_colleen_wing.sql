CREATE TYPE "public"."project_stage" AS ENUM('draft', 'uploading', 'ingesting', 'ingestion_review', 'lesson_configuration', 'objectives_review', 'outline_review', 'narration_storyboard_review', 'audio_generation', 'ready_for_validation', 'ready_to_render', 'rendering', 'completed');--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'project.created' BEFORE 'document.uploaded';--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"stage" "project_stage" DEFAULT 'draft' NOT NULL,
	"latest_failed_operation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_owner_active_updated_idx" ON "projects" USING btree ("owner_user_id","deleted_at","updated_at","id");