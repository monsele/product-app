CREATE TYPE "public"."learning_objective_set_status" AS ENUM('draft', 'approved');--> statement-breakpoint
CREATE TABLE "learning_objective_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"source_snapshot_id" uuid NOT NULL,
	"source_snapshot_content_hash" text NOT NULL,
	"configuration_version" integer NOT NULL,
	"prompt_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"model_call_id" uuid NOT NULL,
	"status" "learning_objective_set_status" DEFAULT 'draft' NOT NULL,
	"idempotency_key" text NOT NULL,
	"key_concepts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prerequisite_knowledge" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"vocabulary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"misconceptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assessment_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_objectives" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"statement" text NOT NULL,
	"verb" text NOT NULL,
	"confidence" real NOT NULL,
	"source_refs" jsonb NOT NULL,
	"generated" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_objective_sets" ADD CONSTRAINT "learning_objective_sets_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_objective_sets" ADD CONSTRAINT "learning_objective_sets_model_call_id_model_calls_id_fk" FOREIGN KEY ("model_call_id") REFERENCES "public"."model_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_objectives" ADD CONSTRAINT "learning_objectives_set_id_learning_objective_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."learning_objective_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "learning_objective_sets_tenant_idempotency_unique" ON "learning_objective_sets" USING btree ("owner_user_id","project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "learning_objective_sets_owner_project_generated_idx" ON "learning_objective_sets" USING btree ("owner_user_id","project_id","generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_objectives_set_order_unique" ON "learning_objectives" USING btree ("set_id","order");--> statement-breakpoint
CREATE INDEX "learning_objectives_set_idx" ON "learning_objectives" USING btree ("set_id");