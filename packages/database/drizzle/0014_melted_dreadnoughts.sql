ALTER TABLE "projects" ALTER COLUMN "stage" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."project_stage" RENAME TO "project_stage_previous";--> statement-breakpoint
CREATE TYPE "public"."project_stage" AS ENUM('draft', 'uploading', 'validating_source', 'ingesting', 'ingestion_review', 'lesson_configuration', 'objectives_review', 'outline_review', 'narration_storyboard_review', 'audio_generation', 'ready_for_validation', 'ready_to_render', 'rendering', 'completed');--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "stage" TYPE "public"."project_stage" USING "stage"::text::"public"."project_stage";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "stage" SET DEFAULT 'draft';--> statement-breakpoint
DROP TYPE "public"."project_stage_previous";--> statement-breakpoint
ALTER TABLE "source_documents" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."source_document_status" RENAME TO "source_document_status_previous";--> statement-breakpoint
CREATE TYPE "public"."source_document_status" AS ENUM('pending_validation', 'validating', 'active', 'rejected', 'validation_error');--> statement-breakpoint
ALTER TABLE "source_documents" ALTER COLUMN "status" TYPE "public"."source_document_status" USING "status"::text::"public"."source_document_status";--> statement-breakpoint
ALTER TABLE "source_documents" ALTER COLUMN "status" SET DEFAULT 'pending_validation';--> statement-breakpoint
DROP TYPE "public"."source_document_status_previous";--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "page_count" integer;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "scan_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "validation_code" text;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "validation_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "validated_at" timestamp with time zone;
