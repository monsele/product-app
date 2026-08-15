CREATE TABLE "content_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parsed_document_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"order" integer NOT NULL,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL,
	"bounding_box" jsonb,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parsed_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"ingestion_artifact_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"schema_version" text NOT NULL,
	"parser_version" text NOT NULL,
	"adapter_version" text NOT NULL,
	"normalized_storage_key" text NOT NULL,
	"title" text,
	"language" text NOT NULL,
	"page_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parsed_sections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parsed_document_id" uuid NOT NULL,
	"parent_section_id" uuid,
	"order" integer NOT NULL,
	"level" integer NOT NULL,
	"heading" text NOT NULL,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_blocks" ADD CONSTRAINT "content_blocks_parsed_document_id_parsed_documents_id_fk" FOREIGN KEY ("parsed_document_id") REFERENCES "public"."parsed_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parsed_documents" ADD CONSTRAINT "parsed_documents_ingestion_artifact_id_source_document_ingestion_artifacts_id_fk" FOREIGN KEY ("ingestion_artifact_id") REFERENCES "public"."source_document_ingestion_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parsed_documents" ADD CONSTRAINT "parsed_documents_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parsed_sections" ADD CONSTRAINT "parsed_sections_parsed_document_id_parsed_documents_id_fk" FOREIGN KEY ("parsed_document_id") REFERENCES "public"."parsed_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_blocks_document_section_order_idx" ON "content_blocks" USING btree ("parsed_document_id","section_id","order");--> statement-breakpoint
CREATE INDEX "content_blocks_document_page_idx" ON "content_blocks" USING btree ("parsed_document_id","page_start");--> statement-breakpoint
CREATE UNIQUE INDEX "parsed_documents_artifact_unique" ON "parsed_documents" USING btree ("ingestion_artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parsed_documents_source_parser_version_unique" ON "parsed_documents" USING btree ("source_document_id","parser_version","schema_version","version");--> statement-breakpoint
CREATE INDEX "parsed_documents_owner_project_created_idx" ON "parsed_documents" USING btree ("owner_user_id","project_id","created_at");--> statement-breakpoint
CREATE INDEX "parsed_sections_document_parent_order_idx" ON "parsed_sections" USING btree ("parsed_document_id","parent_section_id","order");