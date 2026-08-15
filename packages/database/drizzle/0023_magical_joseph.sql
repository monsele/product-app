CREATE TABLE "ingestion_quality_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parsed_document_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"status" text NOT NULL,
	"findings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "source_document_ingestion_artifacts_version_unique";--> statement-breakpoint
ALTER TABLE "source_document_ingestion_artifacts" ADD COLUMN "requested_configuration_version" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_quality_reports" ADD CONSTRAINT "ingestion_quality_reports_parsed_document_id_parsed_documents_id_fk" FOREIGN KEY ("parsed_document_id") REFERENCES "public"."parsed_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_quality_reports_document_unique" ON "ingestion_quality_reports" USING btree ("parsed_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_document_ingestion_artifacts_version_unique" ON "source_document_ingestion_artifacts" USING btree ("source_document_id","parser_version","normalized_schema_version","requested_configuration_version");