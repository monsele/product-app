-- ST-103: curated background sound-bed catalog, lesson configuration choice,
-- and one post-render review report per render job.
CREATE TABLE "sound_bed_tracks" (
  "track_id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "mood_tags" jsonb NOT NULL,
  "duration_ms" integer NOT NULL,
  "loops" boolean NOT NULL,
  "integrated_loudness_lufs" real NOT NULL,
  "peak_dbfs" real NOT NULL,
  "checksum_sha256" text NOT NULL,
  "storage_key" text NOT NULL,
  "content_type" text NOT NULL,
  "license_id" text NOT NULL,
  "source_url" text NOT NULL,
  "attribution_text" text,
  "status" text NOT NULL DEFAULT 'active',
  "sort_order" integer NOT NULL,
  "registered_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "sound_bed_tracks_storage_key_unique" UNIQUE("storage_key"),
  CONSTRAINT "sound_bed_tracks_status_check" CHECK ("status" IN ('active', 'retired')),
  CONSTRAINT "sound_bed_tracks_checksum_check" CHECK ("checksum_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "sound_bed_tracks_license_check" CHECK ("license_id" IN ('CC0-1.0'))
);
--> statement-breakpoint
INSERT INTO "sound_bed_tracks" ("track_id", "title", "mood_tags", "duration_ms", "loops", "integrated_loudness_lufs", "peak_dbfs", "checksum_sha256", "storage_key", "content_type", "license_id", "source_url", "attribution_text", "status", "sort_order") VALUES
  ('morning-pad', 'Morning Pad', '["calm","warm"]'::jsonb, 16000, true, -20, -8.4, 'a38c5d2e4807d0a92f4c0e12864af80f6cd0c59cc6c398ce561b974ff638e025', 'catalog/sound-beds/morning-pad/a38c5d2e4807d0a92f4c0e12864af80f6cd0c59cc6c398ce561b974ff638e025.wav', 'audio/wav', 'CC0-1.0', 'https://creativecommons.org/publicdomain/zero/1.0/#avlp-sound-bed-morning-pad', NULL, 'active', 1),
  ('quiet-pulse', 'Quiet Pulse', '["focused","calm"]'::jsonb, 16000, true, -20, -6.2, '01ce1376fe1393bbaa83d3f0278928452f7ec449b4a3ef9e63306a095147fab0', 'catalog/sound-beds/quiet-pulse/01ce1376fe1393bbaa83d3f0278928452f7ec449b4a3ef9e63306a095147fab0.wav', 'audio/wav', 'CC0-1.0', 'https://creativecommons.org/publicdomain/zero/1.0/#avlp-sound-bed-quiet-pulse', NULL, 'active', 2),
  ('soft-plucks', 'Soft Plucks', '["bright","playful"]'::jsonb, 16000, true, -20, -5.7, '7e89596eb29a8957cf485de98ae0890582b3401fa4bd2df7d411a3272f5434d6', 'catalog/sound-beds/soft-plucks/7e89596eb29a8957cf485de98ae0890582b3401fa4bd2df7d411a3272f5434d6.wav', 'audio/wav', 'CC0-1.0', 'https://creativecommons.org/publicdomain/zero/1.0/#avlp-sound-bed-soft-plucks', NULL, 'active', 3),
  ('warm-drift', 'Warm Drift', '["warm","reflective"]'::jsonb, 16000, true, -20, -7.2, '8fed8e0d79250904a78980742eac9f16610eef6c5f25e943c856c2dd54a3d6c5', 'catalog/sound-beds/warm-drift/8fed8e0d79250904a78980742eac9f16610eef6c5f25e943c856c2dd54a3d6c5.wav', 'audio/wav', 'CC0-1.0', 'https://creativecommons.org/publicdomain/zero/1.0/#avlp-sound-bed-warm-drift', NULL, 'active', 4),
  ('bright-steps', 'Bright Steps', '["bright","playful"]'::jsonb, 16000, true, -20, -5.8, '7d690296bbc1cee1ac7003b9f66c3826e896622f73d81ad6afa7322d54f75ce8', 'catalog/sound-beds/bright-steps/7d690296bbc1cee1ac7003b9f66c3826e896622f73d81ad6afa7322d54f75ce8.wav', 'audio/wav', 'CC0-1.0', 'https://creativecommons.org/publicdomain/zero/1.0/#avlp-sound-bed-bright-steps', NULL, 'active', 5),
  ('night-glass', 'Night Glass', '["reflective","calm"]'::jsonb, 16000, true, -20, -8, 'aca66c7914dd40b2f8a35e77293bd66429d1a977ce78baab43ab539a516fba88', 'catalog/sound-beds/night-glass/aca66c7914dd40b2f8a35e77293bd66429d1a977ce78baab43ab539a516fba88.wav', 'audio/wav', 'CC0-1.0', 'https://creativecommons.org/publicdomain/zero/1.0/#avlp-sound-bed-night-glass', NULL, 'active', 6);
--> statement-breakpoint
ALTER TABLE "lesson_configurations" ADD COLUMN "sound_bed_track_id" text;
--> statement-breakpoint
ALTER TABLE "lesson_configurations" ADD CONSTRAINT "lesson_configurations_sound_bed_track_fk" FOREIGN KEY ("sound_bed_track_id") REFERENCES "sound_bed_tracks"("track_id") ON DELETE restrict;
--> statement-breakpoint
CREATE TABLE "render_review_reports" (
  "id" uuid PRIMARY KEY NOT NULL,
  "project_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "render_job_id" uuid NOT NULL,
  "review_version" text NOT NULL,
  "outcome" text NOT NULL,
  "attempt" integer NOT NULL,
  "report" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "render_review_reports_render_job_fk" FOREIGN KEY ("render_job_id") REFERENCES "render_jobs"("id") ON DELETE restrict,
  CONSTRAINT "render_review_reports_outcome_check" CHECK ("outcome" IN ('passed', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "render_review_reports_render_job_unique" ON "render_review_reports" ("render_job_id");
--> statement-breakpoint
CREATE INDEX "render_review_reports_owner_project_idx" ON "render_review_reports" ("owner_user_id", "project_id");
