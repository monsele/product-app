-- ST-115: conversational storyboard editing. Additive only; no existing row
-- changes.
ALTER TYPE "public"."usage_operation_type" ADD VALUE IF NOT EXISTS 'ai.edit-plan';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'edit_thread.message_posted';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'edit_thread.plan_applied';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'edit_thread.plan_dismissed';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'edit_thread.plan_undone';--> statement-breakpoint
CREATE TABLE "lesson_edit_threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"message_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_edit_threads_sequence_nonnegative" CHECK ("message_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "lesson_edit_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"reply_to_id" uuid,
	"text" text,
	"scope" jsonb NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text,
	"request_hash" text,
	"job_id" uuid,
	"model_call_id" uuid,
	"plan" jsonb,
	"operation_states" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applied_operation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"before_revision" integer,
	"after_revision" integer,
	"undo_snapshot" jsonb,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_edit_messages_seq_positive" CHECK ("seq" >= 1),
	CONSTRAINT "lesson_edit_messages_role" CHECK ("role" IN ('teacher', 'assistant')),
	CONSTRAINT "lesson_edit_messages_status" CHECK ("status" IN ('sent', 'planning', 'proposed', 'answered', 'applying', 'applied', 'partly_applied', 'dismissed', 'undone', 'failed')),
	CONSTRAINT "lesson_edit_messages_text_length" CHECK ("text" IS NULL OR char_length("text") BETWEEN 1 AND 1000)
);
--> statement-breakpoint
ALTER TABLE "lesson_edit_messages" ADD CONSTRAINT "lesson_edit_messages_thread_id_lesson_edit_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."lesson_edit_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_edit_threads_project_unique" ON "lesson_edit_threads" USING btree ("owner_user_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_edit_messages_thread_seq_unique" ON "lesson_edit_messages" USING btree ("thread_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_edit_messages_request_unique" ON "lesson_edit_messages" USING btree ("owner_user_id","project_id","idempotency_key") WHERE "lesson_edit_messages"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "lesson_edit_messages_owner_project_created_idx" ON "lesson_edit_messages" USING btree ("owner_user_id","project_id","created_at");
