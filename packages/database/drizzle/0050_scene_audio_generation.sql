ALTER TYPE "public"."scene_audio_status" ADD VALUE IF NOT EXISTS 'queued';--> statement-breakpoint
ALTER TYPE "public"."scene_audio_status" ADD VALUE IF NOT EXISTS 'generating';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'audio.generation_requested';--> statement-breakpoint
ALTER TABLE "scene_audio" ADD COLUMN "narration_hash" text;--> statement-breakpoint
ALTER TABLE "scene_audio" ADD COLUMN "voice_configuration_hash" text;--> statement-breakpoint
ALTER TABLE "scene_audio" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "scene_audio" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "scene_audio" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "scene_audio" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "scene_audio" ADD COLUMN "timing" jsonb;--> statement-breakpoint
ALTER TABLE "scene_audio" ADD COLUMN "planned_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "scene_audio" ADD COLUMN "fit_warning" text;--> statement-breakpoint
ALTER TABLE "scene_audio" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "scene_audio" ADD COLUMN "failure_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "scene_audio_tenant_content_hash_unique" ON "scene_audio" USING btree ("owner_user_id", "project_id", "scene_id", "content_hash");
