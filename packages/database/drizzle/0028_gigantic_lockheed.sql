ALTER TYPE "public"."audit_event_type" ADD VALUE 'source.review_approved' BEFORE 'share.created';--> statement-breakpoint
CREATE TABLE "source_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"parsed_document_id" uuid NOT NULL,
	"parsed_document_version" integer NOT NULL,
	"snapshot_version" integer NOT NULL,
	"schema_version" text NOT NULL,
	"content_hash" text NOT NULL,
	"approved_by" uuid NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_parsed_document_id_parsed_documents_id_fk" FOREIGN KEY ("parsed_document_id") REFERENCES "public"."parsed_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "source_snapshots_project_version_unique" ON "source_snapshots" USING btree ("project_id","snapshot_version");--> statement-breakpoint
CREATE INDEX "source_snapshots_owner_project_parsed_idx" ON "source_snapshots" USING btree ("owner_user_id","project_id","parsed_document_id");--> statement-breakpoint
CREATE INDEX "source_snapshots_parsed_document_idx" ON "source_snapshots" USING btree ("parsed_document_id");