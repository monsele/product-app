-- ST-117: table-cell correction overlays. Additive only; no existing row
-- changes and parsed_tables / parsed_table_cells stay immutable.
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'source.table_cell_corrected';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'source.table_cell_restored';--> statement-breakpoint
CREATE TABLE "table_cell_corrections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"parsed_document_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"column_index" integer NOT NULL,
	"original_text" text NOT NULL,
	"corrected_text" text,
	"edited_by" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_cell_corrections_position_nonnegative" CHECK ("row_index" >= 0 AND "column_index" >= 0),
	CONSTRAINT "table_cell_corrections_revision_positive" CHECK ("revision" >= 1),
	CONSTRAINT "table_cell_corrections_text_length" CHECK ("corrected_text" IS NULL OR char_length("corrected_text") <= 160)
);
--> statement-breakpoint
CREATE TABLE "source_table_invalidations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"parsed_document_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"column_index" integer NOT NULL,
	"cell_revision" integer NOT NULL,
	"scope" text DEFAULT 'unapproved_drafts' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "table_cell_corrections" ADD CONSTRAINT "table_cell_corrections_parsed_document_id_parsed_documents_id_fk" FOREIGN KEY ("parsed_document_id") REFERENCES "public"."parsed_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_cell_corrections" ADD CONSTRAINT "table_cell_corrections_section_id_parsed_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."parsed_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_cell_corrections" ADD CONSTRAINT "table_cell_corrections_table_id_parsed_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."parsed_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_table_invalidations" ADD CONSTRAINT "source_table_invalidations_parsed_document_id_parsed_documents_id_fk" FOREIGN KEY ("parsed_document_id") REFERENCES "public"."parsed_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_table_invalidations" ADD CONSTRAINT "source_table_invalidations_section_id_parsed_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."parsed_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_table_invalidations" ADD CONSTRAINT "source_table_invalidations_table_id_parsed_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."parsed_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "table_cell_corrections_project_cell_unique" ON "table_cell_corrections" USING btree ("project_id","table_id","row_index","column_index");--> statement-breakpoint
CREATE INDEX "table_cell_corrections_project_document_idx" ON "table_cell_corrections" USING btree ("owner_user_id","project_id","parsed_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_table_invalidations_project_cell_revision_unique" ON "source_table_invalidations" USING btree ("project_id","table_id","row_index","column_index","cell_revision");--> statement-breakpoint
CREATE INDEX "source_table_invalidations_project_created_idx" ON "source_table_invalidations" USING btree ("owner_user_id","project_id","created_at");
