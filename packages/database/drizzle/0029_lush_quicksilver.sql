ALTER TYPE "public"."usage_operation_type" ADD VALUE 'ai.grounding' BEFORE 'image.generation';--> statement-breakpoint
CREATE TABLE "model_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"operation_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"prompt_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"input_units" integer NOT NULL,
	"output_units" integer NOT NULL,
	"estimated_cost_usd" numeric(14, 6) NOT NULL,
	"latency_ms" integer NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"validation_status" text NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "model_calls_tenant_idempotency_unique" ON "model_calls" USING btree ("owner_user_id","project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "model_calls_owner_project_created_idx" ON "model_calls" USING btree ("owner_user_id","project_id","created_at");--> statement-breakpoint
CREATE INDEX "model_calls_correlation_idx" ON "model_calls" USING btree ("correlation_id");