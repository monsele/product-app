CREATE TYPE "public"."lesson_spec_status" AS ENUM('draft', 'approved', 'superseded');--> statement-breakpoint
CREATE TABLE "lesson_specs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"schema_version" text NOT NULL,
	"based_on_narration_set_id" uuid NOT NULL,
	"narration_set_content_hash" text NOT NULL,
	"outline_set_id" uuid NOT NULL,
	"outline_set_content_hash" text NOT NULL,
	"configuration_version" integer NOT NULL,
	"prompt_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"model_call_id" uuid NOT NULL,
	"status" "lesson_spec_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"title" text NOT NULL,
	"subject" text NOT NULL,
	"target_duration_seconds" integer NOT NULL,
	"total_duration_seconds" integer NOT NULL,
	"objective_ids" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"lesson_spec_id" uuid NOT NULL,
	"stable_scene_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"template" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"narration_block_ids" jsonb NOT NULL,
	"asset_requirements" jsonb NOT NULL,
	"scene_json" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_specs" ADD CONSTRAINT "lesson_specs_based_on_narration_set_id_narration_sets_id_fk" FOREIGN KEY ("based_on_narration_set_id") REFERENCES "public"."narration_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_specs" ADD CONSTRAINT "lesson_specs_outline_set_id_lesson_outline_sets_id_fk" FOREIGN KEY ("outline_set_id") REFERENCES "public"."lesson_outline_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_specs" ADD CONSTRAINT "lesson_specs_model_call_id_model_calls_id_fk" FOREIGN KEY ("model_call_id") REFERENCES "public"."model_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_lesson_spec_id_lesson_specs_id_fk" FOREIGN KEY ("lesson_spec_id") REFERENCES "public"."lesson_specs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_specs_tenant_idempotency_unique" ON "lesson_specs" USING btree ("owner_user_id","project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "lesson_specs_owner_project_generated_idx" ON "lesson_specs" USING btree ("owner_user_id","project_id","generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scenes_lesson_spec_order_unique" ON "scenes" USING btree ("lesson_spec_id","order");--> statement-breakpoint
CREATE INDEX "scenes_lesson_spec_idx" ON "scenes" USING btree ("lesson_spec_id");