CREATE TYPE "public"."render_status" AS ENUM('queued', 'rendering', 'completed', 'failed', 'cancelled');--> statement-breakpoint
ALTER TABLE "scene_audio" ADD COLUMN "checksum_sha256" text;--> statement-breakpoint

CREATE TABLE "render_jobs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "project_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE restrict,
  "lesson_version_id" uuid NOT NULL REFERENCES "lesson_versions"("id") ON DELETE restrict,
  "validation_run_id" uuid NOT NULL REFERENCES "validation_runs"("id") ON DELETE restrict,
  "manifest" jsonb NOT NULL,
  "manifest_hash" text NOT NULL,
  "status" "render_status" NOT NULL DEFAULT 'queued',
  "progress" real NOT NULL DEFAULT 0,
  "attempt" integer NOT NULL DEFAULT 0,
  "error_code" text,
  "error_message" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "render_jobs_job_unique" ON "render_jobs" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "render_jobs_tenant_manifest_unique" ON "render_jobs" USING btree ("owner_user_id", "project_id", "manifest_hash");--> statement-breakpoint
CREATE INDEX "render_jobs_owner_project_created_idx" ON "render_jobs" USING btree ("owner_user_id", "project_id", "created_at");--> statement-breakpoint

CREATE TABLE "rendered_videos" (
  "id" uuid PRIMARY KEY NOT NULL,
  "project_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "render_job_id" uuid NOT NULL REFERENCES "render_jobs"("id") ON DELETE restrict,
  "storage_key" text NOT NULL,
  "checksum_sha256" text NOT NULL,
  "duration_ms" integer NOT NULL,
  "size_bytes" integer NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "fps" integer NOT NULL,
  "video_codec" text NOT NULL,
  "audio_codec" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "rendered_videos_render_job_unique" ON "rendered_videos" USING btree ("render_job_id");--> statement-breakpoint
CREATE INDEX "rendered_videos_owner_project_idx" ON "rendered_videos" USING btree ("owner_user_id", "project_id");--> statement-breakpoint

CREATE TABLE "render_thumbnails" (
  "id" uuid PRIMARY KEY NOT NULL,
  "project_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "rendered_video_id" uuid NOT NULL REFERENCES "rendered_videos"("id") ON DELETE restrict,
  "storage_key" text NOT NULL,
  "checksum_sha256" text NOT NULL,
  "timestamp_ms" integer NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "render_thumbnails_video_unique" ON "render_thumbnails" USING btree ("rendered_video_id");--> statement-breakpoint
CREATE INDEX "render_thumbnails_owner_project_idx" ON "render_thumbnails" USING btree ("owner_user_id", "project_id");
