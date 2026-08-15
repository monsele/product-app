ALTER TYPE "public"."audit_event_type" ADD VALUE 'source.block_corrected' BEFORE 'share.created';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'source.block_restored' BEFORE 'share.created';--> statement-breakpoint
CREATE TABLE "content_block_corrections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"parsed_document_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"corrected_text" text,
	"corrected_items" jsonb,
	"corrected_latex" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_content_invalidations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"parsed_document_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"block_revision" integer NOT NULL,
	"scope" text DEFAULT 'unapproved_drafts' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_block_corrections" ADD CONSTRAINT "content_block_corrections_parsed_document_id_parsed_documents_id_fk" FOREIGN KEY ("parsed_document_id") REFERENCES "public"."parsed_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_block_corrections" ADD CONSTRAINT "content_block_corrections_section_id_parsed_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."parsed_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_block_corrections" ADD CONSTRAINT "content_block_corrections_block_id_content_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."content_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_content_invalidations" ADD CONSTRAINT "source_content_invalidations_parsed_document_id_parsed_documents_id_fk" FOREIGN KEY ("parsed_document_id") REFERENCES "public"."parsed_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_content_invalidations" ADD CONSTRAINT "source_content_invalidations_section_id_parsed_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."parsed_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_content_invalidations" ADD CONSTRAINT "source_content_invalidations_block_id_content_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."content_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_block_corrections_project_block_unique" ON "content_block_corrections" USING btree ("project_id","block_id");--> statement-breakpoint
CREATE INDEX "content_block_corrections_project_document_idx" ON "content_block_corrections" USING btree ("owner_user_id","project_id","parsed_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_content_invalidations_project_block_revision_unique" ON "source_content_invalidations" USING btree ("project_id","block_id","block_revision");--> statement-breakpoint
CREATE INDEX "source_content_invalidations_project_created_idx" ON "source_content_invalidations" USING btree ("owner_user_id","project_id","created_at");