ALTER TYPE "public"."audit_event_type" ADD VALUE 'project.duplicated' BEFORE 'document.uploaded';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'project.deleted' BEFORE 'document.uploaded';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "cleanup_after" timestamp with time zone;