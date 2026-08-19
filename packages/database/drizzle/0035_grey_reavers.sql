ALTER TYPE "public"."audit_event_type" ADD VALUE 'narration.edited' BEFORE 'version.restored';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'narration.block_candidate_accepted' BEFORE 'version.restored';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'narration.block_candidate_rejected' BEFORE 'version.restored';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'narration.block_restored' BEFORE 'version.restored';--> statement-breakpoint
CREATE TABLE "narration_block_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"text" text NOT NULL,
	"estimated_words" integer NOT NULL,
	"source_refs" jsonb NOT NULL,
	"generated_additions" jsonb NOT NULL,
	"generated" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"block_revision" integer NOT NULL,
	"model_call_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "narration_block_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"text" text NOT NULL,
	"estimated_words" integer NOT NULL,
	"source_refs" jsonb NOT NULL,
	"generated_additions" jsonb NOT NULL,
	"generated" boolean DEFAULT true NOT NULL,
	"origin" text NOT NULL,
	"model_call_id" uuid,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "narration_blocks" ADD COLUMN "origin" text DEFAULT 'generated' NOT NULL;--> statement-breakpoint
ALTER TABLE "narration_block_candidates" ADD CONSTRAINT "narration_block_candidates_set_id_narration_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."narration_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narration_block_candidates" ADD CONSTRAINT "narration_block_candidates_block_id_narration_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."narration_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narration_block_candidates" ADD CONSTRAINT "narration_block_candidates_model_call_id_model_calls_id_fk" FOREIGN KEY ("model_call_id") REFERENCES "public"."model_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narration_block_revisions" ADD CONSTRAINT "narration_block_revisions_set_id_narration_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."narration_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narration_block_revisions" ADD CONSTRAINT "narration_block_revisions_block_id_narration_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."narration_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narration_block_revisions" ADD CONSTRAINT "narration_block_revisions_model_call_id_model_calls_id_fk" FOREIGN KEY ("model_call_id") REFERENCES "public"."model_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "narration_candidates_block_idempotency_unique" ON "narration_block_candidates" USING btree ("owner_user_id","project_id","block_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "narration_candidates_set_block_status_idx" ON "narration_block_candidates" USING btree ("set_id","block_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "narration_block_revisions_block_revision_unique" ON "narration_block_revisions" USING btree ("block_id","revision");--> statement-breakpoint
CREATE INDEX "narration_block_revisions_set_idx" ON "narration_block_revisions" USING btree ("set_id");