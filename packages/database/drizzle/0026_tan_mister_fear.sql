ALTER TYPE "public"."audit_event_type" ADD VALUE 'source.figure_updated' BEFORE 'share.created';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'source.figure_restored' BEFORE 'share.created';--> statement-breakpoint
CREATE TABLE "figure_inclusion_overlays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"parsed_document_id" uuid NOT NULL,
	"figure_id" uuid NOT NULL,
	"included" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_figure_invalidations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"parsed_document_id" uuid NOT NULL,
	"figure_id" uuid NOT NULL,
	"figure_revision" integer NOT NULL,
	"scope" text DEFAULT 'unapproved_drafts' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "figure_inclusion_overlays" ADD CONSTRAINT "figure_inclusion_overlays_parsed_document_id_parsed_documents_id_fk" FOREIGN KEY ("parsed_document_id") REFERENCES "public"."parsed_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_inclusion_overlays" ADD CONSTRAINT "figure_inclusion_overlays_figure_id_extracted_figures_id_fk" FOREIGN KEY ("figure_id") REFERENCES "public"."extracted_figures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_figure_invalidations" ADD CONSTRAINT "source_figure_invalidations_parsed_document_id_parsed_documents_id_fk" FOREIGN KEY ("parsed_document_id") REFERENCES "public"."parsed_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_figure_invalidations" ADD CONSTRAINT "source_figure_invalidations_figure_id_extracted_figures_id_fk" FOREIGN KEY ("figure_id") REFERENCES "public"."extracted_figures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "figure_inclusion_overlays_project_figure_unique" ON "figure_inclusion_overlays" USING btree ("project_id","figure_id");--> statement-breakpoint
CREATE INDEX "figure_inclusion_overlays_project_document_idx" ON "figure_inclusion_overlays" USING btree ("owner_user_id","project_id","parsed_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_figure_invalidations_project_figure_revision_unique" ON "source_figure_invalidations" USING btree ("project_id","figure_id","figure_revision");--> statement-breakpoint
CREATE INDEX "source_figure_invalidations_project_created_idx" ON "source_figure_invalidations" USING btree ("owner_user_id","project_id","created_at");