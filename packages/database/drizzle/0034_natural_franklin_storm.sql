CREATE TYPE "public"."narration_set_status" AS ENUM('draft', 'approved', 'superseded');--> statement-breakpoint
CREATE TABLE "narration_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"outline_item_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"text" text NOT NULL,
	"estimated_words" integer NOT NULL,
	"target_seconds" integer NOT NULL,
	"source_refs" jsonb NOT NULL,
	"generated_additions" jsonb NOT NULL,
	"generated" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "narration_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"source_snapshot_id" uuid NOT NULL,
	"source_snapshot_content_hash" text NOT NULL,
	"outline_set_id" uuid NOT NULL,
	"outline_set_content_hash" text NOT NULL,
	"configuration_version" integer NOT NULL,
	"prompt_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"model_call_id" uuid NOT NULL,
	"status" "narration_set_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"total_estimated_seconds" integer NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "narration_blocks" ADD CONSTRAINT "narration_blocks_set_id_narration_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."narration_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narration_blocks" ADD CONSTRAINT "narration_blocks_outline_item_id_lesson_outline_items_id_fk" FOREIGN KEY ("outline_item_id") REFERENCES "public"."lesson_outline_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narration_sets" ADD CONSTRAINT "narration_sets_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narration_sets" ADD CONSTRAINT "narration_sets_outline_set_id_lesson_outline_sets_id_fk" FOREIGN KEY ("outline_set_id") REFERENCES "public"."lesson_outline_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narration_sets" ADD CONSTRAINT "narration_sets_model_call_id_model_calls_id_fk" FOREIGN KEY ("model_call_id") REFERENCES "public"."model_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "narration_blocks_set_order_unique" ON "narration_blocks" USING btree ("set_id","order");--> statement-breakpoint
CREATE INDEX "narration_blocks_set_idx" ON "narration_blocks" USING btree ("set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "narration_sets_tenant_idempotency_unique" ON "narration_sets" USING btree ("owner_user_id","project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "narration_sets_owner_project_generated_idx" ON "narration_sets" USING btree ("owner_user_id","project_id","generated_at");