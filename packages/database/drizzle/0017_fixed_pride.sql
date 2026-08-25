ALTER TYPE "public"."audit_event_type" ADD VALUE 'document.ingestion_reused' BEFORE 'share.created';--> statement-breakpoint
CREATE TABLE "source_document_ingestion_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"parser_version" text NOT NULL,
	"normalized_schema_version" text NOT NULL,
	"canonical_storage_key" text NOT NULL,
	"normalized_storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_document_ingestion_reuses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"ingestion_artifact_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "duplicate_detected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "source_document_ingestion_artifacts" ADD CONSTRAINT "source_document_ingestion_artifacts_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_document_ingestion_reuses" ADD CONSTRAINT "source_document_ingestion_reuses_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_document_ingestion_reuses" ADD CONSTRAINT "source_document_ingestion_reuses_ingestion_artifact_id_source_document_ingestion_artifacts_id_fk" FOREIGN KEY ("ingestion_artifact_id") REFERENCES "public"."source_document_ingestion_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "source_document_ingestion_artifacts_version_unique" ON "source_document_ingestion_artifacts" USING btree ("source_document_id","parser_version","normalized_schema_version");--> statement-breakpoint
CREATE INDEX "source_document_ingestion_artifacts_owner_versions_idx" ON "source_document_ingestion_artifacts" USING btree ("owner_user_id","parser_version","normalized_schema_version");--> statement-breakpoint
CREATE UNIQUE INDEX "source_document_ingestion_reuses_document_unique" ON "source_document_ingestion_reuses" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "source_document_ingestion_reuses_project_created_idx" ON "source_document_ingestion_reuses" USING btree ("owner_user_id","project_id","created_at");