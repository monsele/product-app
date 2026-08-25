ALTER TABLE "project_assets" ADD COLUMN "cleanup_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_assets" ADD COLUMN "cleanup_completed_at" timestamp with time zone;