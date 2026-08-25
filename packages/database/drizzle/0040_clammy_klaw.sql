CREATE TABLE "project_asset_upload_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"original_name" text NOT NULL,
	"expected_media_type" text NOT NULL,
	"expected_size_bytes" integer NOT NULL,
	"expected_sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"media_type" text NOT NULL,
	"original_name" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"storage_key" text NOT NULL,
	"thumbnail_storage_key" text NOT NULL,
	"provenance" text DEFAULT 'teacher_uploaded' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "project_asset_upload_sessions_asset_unique" ON "project_asset_upload_sessions" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "project_asset_upload_sessions_tenant_expiry_idx" ON "project_asset_upload_sessions" USING btree ("owner_user_id","project_id","expires_at");--> statement-breakpoint
CREATE INDEX "project_assets_owner_project_created_idx" ON "project_assets" USING btree ("owner_user_id","project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_assets_tenant_sha256_unique" ON "project_assets" USING btree ("owner_user_id","project_id","sha256");