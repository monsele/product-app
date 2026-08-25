CREATE TYPE "public"."lesson_outline_set_status" AS ENUM('draft', 'approved', 'superseded');--> statement-breakpoint
CREATE TABLE "lesson_outline_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"estimated_seconds" integer NOT NULL,
	"source_refs" jsonb NOT NULL,
	"framing_note" text,
	"generated" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_outline_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"source_snapshot_id" uuid NOT NULL,
	"source_snapshot_content_hash" text NOT NULL,
	"objective_set_id" uuid NOT NULL,
	"objective_set_content_hash" text NOT NULL,
	"configuration_version" integer NOT NULL,
	"prompt_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"model_call_id" uuid NOT NULL,
	"status" "lesson_outline_set_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"total_estimated_seconds" integer NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outline_objective_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"outline_item_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_outline_items" ADD CONSTRAINT "lesson_outline_items_set_id_lesson_outline_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."lesson_outline_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_outline_sets" ADD CONSTRAINT "lesson_outline_sets_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_outline_sets" ADD CONSTRAINT "lesson_outline_sets_objective_set_id_learning_objective_sets_id_fk" FOREIGN KEY ("objective_set_id") REFERENCES "public"."learning_objective_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_outline_sets" ADD CONSTRAINT "lesson_outline_sets_model_call_id_model_calls_id_fk" FOREIGN KEY ("model_call_id") REFERENCES "public"."model_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outline_objective_links" ADD CONSTRAINT "outline_objective_links_outline_item_id_lesson_outline_items_id_fk" FOREIGN KEY ("outline_item_id") REFERENCES "public"."lesson_outline_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outline_objective_links" ADD CONSTRAINT "outline_objective_links_objective_id_learning_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."learning_objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_outline_items_set_order_unique" ON "lesson_outline_items" USING btree ("set_id","order");--> statement-breakpoint
CREATE INDEX "lesson_outline_items_set_idx" ON "lesson_outline_items" USING btree ("set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_outline_sets_tenant_idempotency_unique" ON "lesson_outline_sets" USING btree ("owner_user_id","project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "lesson_outline_sets_owner_project_generated_idx" ON "lesson_outline_sets" USING btree ("owner_user_id","project_id","generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outline_objective_links_item_objective_unique" ON "outline_objective_links" USING btree ("outline_item_id","objective_id");--> statement-breakpoint
CREATE INDEX "outline_objective_links_owner_project_item_idx" ON "outline_objective_links" USING btree ("owner_user_id","project_id","outline_item_id");