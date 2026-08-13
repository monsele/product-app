CREATE TYPE "public"."source_document_status" AS ENUM('active');--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"original_name" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"status" "source_document_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
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
CREATE UNIQUE INDEX "source_documents_project_active_unique" ON "source_documents" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "source_documents_storage_key_unique" ON "source_documents" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "source_documents_owner_checksum_idx" ON "source_documents" USING btree ("owner_user_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "upload_sessions_document_unique" ON "upload_sessions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_owner_project_expiry_idx" ON "upload_sessions" USING btree ("owner_user_id","project_id","expires_at");
