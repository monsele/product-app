ALTER TABLE "project_assets" ALTER COLUMN "width" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_assets" ALTER COLUMN "height" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_assets" ALTER COLUMN "thumbnail_storage_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_asset_upload_sessions" ADD COLUMN "validation_job_id" uuid;--> statement-breakpoint
ALTER TABLE "project_assets" ADD COLUMN "status" text DEFAULT 'pending_validation' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_assets" ADD COLUMN "validation_code" text;