ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'project_asset.validation_requested';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'project_asset.deleted';
