ALTER TABLE "caption_tracks" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "caption_tracks" ADD COLUMN "language" text NOT NULL DEFAULT 'en';--> statement-breakpoint
UPDATE "caption_tracks" SET "content_hash" = 'legacy:' || "id"::text, "status" = 'stale' WHERE "content_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "caption_tracks" ALTER COLUMN "content_hash" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "caption_tracks_audio_content_hash_unique" ON "caption_tracks" USING btree ("scene_audio_id", "content_hash");--> statement-breakpoint
CREATE TABLE "caption_cues" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "track_id" uuid NOT NULL REFERENCES "caption_tracks"("id") ON DELETE cascade,
  "position" integer NOT NULL,
  "start_ms" integer NOT NULL,
  "end_ms" integer NOT NULL,
  "text" text NOT NULL,
  "words" jsonb,
  "created_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "caption_cues_track_position_unique" ON "caption_cues" USING btree ("track_id", "position");--> statement-breakpoint
CREATE INDEX "caption_cues_owner_project_track_idx" ON "caption_cues" USING btree ("owner_user_id", "project_id", "track_id");
