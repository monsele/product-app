CREATE TABLE "extracted_figures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parsed_document_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL,
	"caption_block_id" uuid,
	"alt_text" text,
	"source_locator" text,
	"storage_key" text,
	"thumbnail_storage_key" text,
	"checksum_sha256" text,
	"content_type" text,
	"byte_length" integer,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_warnings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parsed_document_id" uuid NOT NULL,
	"code" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL,
	"section_id" uuid,
	"block_id" uuid,
	"figure_id" uuid,
	"table_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parsed_table_cells" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parsed_table_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"column_index" integer NOT NULL,
	"text" text NOT NULL,
	"row_span" integer DEFAULT 1 NOT NULL,
	"column_span" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parsed_tables" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parsed_document_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL,
	"caption_block_id" uuid,
	"columns" jsonb NOT NULL,
	"rows" jsonb NOT NULL,
	"raw_representation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extracted_figures" ADD CONSTRAINT "extracted_figures_parsed_document_id_parsed_documents_id_fk" FOREIGN KEY ("parsed_document_id") REFERENCES "public"."parsed_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_warnings" ADD CONSTRAINT "ingestion_warnings_parsed_document_id_parsed_documents_id_fk" FOREIGN KEY ("parsed_document_id") REFERENCES "public"."parsed_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parsed_table_cells" ADD CONSTRAINT "parsed_table_cells_parsed_table_id_parsed_tables_id_fk" FOREIGN KEY ("parsed_table_id") REFERENCES "public"."parsed_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parsed_tables" ADD CONSTRAINT "parsed_tables_parsed_document_id_parsed_documents_id_fk" FOREIGN KEY ("parsed_document_id") REFERENCES "public"."parsed_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extracted_figures_document_section_order_idx" ON "extracted_figures" USING btree ("parsed_document_id","section_id","order");--> statement-breakpoint
CREATE INDEX "extracted_figures_document_page_idx" ON "extracted_figures" USING btree ("parsed_document_id","page_start");--> statement-breakpoint
CREATE INDEX "ingestion_warnings_document_page_idx" ON "ingestion_warnings" USING btree ("parsed_document_id","page_start");--> statement-breakpoint
CREATE UNIQUE INDEX "parsed_table_cells_table_position_unique" ON "parsed_table_cells" USING btree ("parsed_table_id","row_index","column_index");--> statement-breakpoint
CREATE INDEX "parsed_tables_document_section_order_idx" ON "parsed_tables" USING btree ("parsed_document_id","section_id","order");