CREATE TYPE "public"."share_link_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "share_links" (
  "id" uuid PRIMARY KEY NOT NULL,
  "project_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "rendered_video_id" uuid NOT NULL REFERENCES "rendered_videos"("id") ON DELETE restrict,
  "lesson_version_id" uuid NOT NULL REFERENCES "lesson_versions"("id") ON DELETE restrict,
  "token_hash" text NOT NULL,
  "status" "share_link_status" NOT NULL DEFAULT 'active',
  "expires_at" timestamp with time zone,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_token_hash_unique" ON "share_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "share_links_owner_project_created_idx" ON "share_links" USING btree ("owner_user_id", "project_id", "created_at");--> statement-breakpoint
CREATE INDEX "share_links_public_lookup_idx" ON "share_links" USING btree ("token_hash", "status", "expires_at");
