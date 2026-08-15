ALTER TYPE "public"."audit_event_type" ADD VALUE 'source.selection_updated' BEFORE 'share.created';--> statement-breakpoint
CREATE TABLE "source_section_overlays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"parsed_document_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"included" boolean DEFAULT true NOT NULL,
	"display_heading" text,
	"review_order" integer,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_section_overlays" ADD CONSTRAINT "source_section_overlays_parsed_document_id_parsed_documents_id_fk" FOREIGN KEY ("parsed_document_id") REFERENCES "public"."parsed_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_section_overlays" ADD CONSTRAINT "source_section_overlays_section_id_parsed_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."parsed_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "source_section_overlays_project_section_unique" ON "source_section_overlays" USING btree ("project_id","section_id");--> statement-breakpoint
CREATE INDEX "source_section_overlays_project_document_idx" ON "source_section_overlays" USING btree ("owner_user_id","project_id","parsed_document_id");