ALTER TYPE "public"."audit_event_type" ADD VALUE 'lesson.configuration_saved' BEFORE 'lesson.approved';--> statement-breakpoint
CREATE TABLE "lesson_configurations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"age_band" text NOT NULL,
	"difficulty" text NOT NULL,
	"subject" text NOT NULL,
	"lesson_title" text NOT NULL,
	"target_duration_seconds" integer NOT NULL,
	"tone" text NOT NULL,
	"visual_theme" text DEFAULT 'mvp-default' NOT NULL,
	"include_recall_questions" boolean DEFAULT false NOT NULL,
	"source_parsed_document_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_configurations_project_unique" ON "lesson_configurations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "lesson_configurations_owner_updated_idx" ON "lesson_configurations" USING btree ("owner_user_id","project_id","updated_at");