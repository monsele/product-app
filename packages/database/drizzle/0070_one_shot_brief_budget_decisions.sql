-- ST-107: prompt-to-video brief, run budget ledger, bounded self-repair and
-- decision log. Additive only; no existing row changes.
ALTER TYPE "public"."usage_operation_type" ADD VALUE IF NOT EXISTS 'ai.one-shot-brief';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'one_shot.brief_prepared';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'one_shot.budget_accepted';--> statement-breakpoint
ALTER TYPE "public"."one_shot_run_status" ADD VALUE IF NOT EXISTS 'brief_pending' BEFORE 'queued';--> statement-breakpoint
ALTER TYPE "public"."one_shot_run_status" ADD VALUE IF NOT EXISTS 'brief_ready' BEFORE 'queued';--> statement-breakpoint
ALTER TABLE "one_shot_runs" ADD COLUMN "brief_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "one_shot_runs" ADD COLUMN "confirmed_brief_revision" integer;--> statement-breakpoint
ALTER TABLE "one_shot_runs" ADD COLUMN "style_pack_id" text;--> statement-breakpoint
ALTER TABLE "one_shot_runs" ADD COLUMN "sound_bed" text;--> statement-breakpoint
ALTER TABLE "one_shot_runs" ADD COLUMN "reserved_usd" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "one_shot_runs" ADD COLUMN "cap_usd" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "one_shot_runs" ADD COLUMN "reservation_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "one_shot_runs" ADD COLUMN "budget_proposal_usd" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "one_shot_runs" ADD COLUMN "repair_state" jsonb;--> statement-breakpoint
ALTER TABLE "one_shot_runs" ADD COLUMN "coverage_gaps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "one_shot_runs" ADD COLUMN "decision_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "one_shot_runs" ADD CONSTRAINT "one_shot_runs_budget_nonnegative" CHECK (("reserved_usd" IS NULL OR "reserved_usd" >= 0) AND ("cap_usd" IS NULL OR "cap_usd" >= "reserved_usd") AND ("budget_proposal_usd" IS NULL OR "budget_proposal_usd" >= 0));--> statement-breakpoint
-- The brief statuses are active too: one run per project, from the first
-- brief to completion or cancellation. The predicate names the two inactive
-- statuses instead, so the enum values added above are never used as
-- literals in the transaction that adds them (and the predicate stays
-- IMMUTABLE, which a text cast would not be).
DROP INDEX IF EXISTS "one_shot_runs_one_active_per_project";--> statement-breakpoint
CREATE UNIQUE INDEX "one_shot_runs_one_active_per_project" ON "one_shot_runs" USING btree ("project_id") WHERE "one_shot_runs"."status" not in ('completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "one_shot_run_briefs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"focus_prompt" text NOT NULL,
	"audience" jsonb NOT NULL,
	"target_duration_seconds" integer NOT NULL,
	"brief" jsonb NOT NULL,
	"estimate" jsonb NOT NULL,
	"model_call_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_shot_run_briefs_revision_positive" CHECK ("revision" >= 1),
	CONSTRAINT "one_shot_run_briefs_focus_prompt_length" CHECK (char_length("focus_prompt") BETWEEN 1 AND 1000 AND "focus_prompt" = btrim("focus_prompt")),
	CONSTRAINT "one_shot_run_briefs_target_duration" CHECK ("target_duration_seconds" IN (180, 300, 420))
);
--> statement-breakpoint
CREATE TABLE "one_shot_run_ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"step" text NOT NULL,
	"estimate_usd" numeric(12, 6) NOT NULL,
	"actual_usd" numeric(12, 6) NOT NULL,
	"usage_record_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_shot_run_ledger_entries_costs_nonnegative" CHECK ("estimate_usd" >= 0 AND "actual_usd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "one_shot_run_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"reason" text,
	"model" text,
	"prompt_version" text,
	"cost_usd" numeric(12, 6),
	"related_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_shot_run_decisions_seq_positive" CHECK ("seq" >= 1),
	CONSTRAINT "one_shot_run_decisions_kind" CHECK ("kind" IN ('brief', 'style_pack', 'sound_bed', 'auto_approval', 'repair', 'budget_reservation', 'coverage_gap', 'render_review')),
	CONSTRAINT "one_shot_run_decisions_cost_nonnegative" CHECK ("cost_usd" IS NULL OR "cost_usd" >= 0)
);
--> statement-breakpoint
ALTER TABLE "one_shot_run_briefs" ADD CONSTRAINT "one_shot_run_briefs_run_id_one_shot_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."one_shot_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_shot_run_briefs" ADD CONSTRAINT "one_shot_run_briefs_model_call_id_model_calls_id_fk" FOREIGN KEY ("model_call_id") REFERENCES "public"."model_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_shot_run_ledger_entries" ADD CONSTRAINT "one_shot_run_ledger_entries_run_id_one_shot_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."one_shot_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_shot_run_decisions" ADD CONSTRAINT "one_shot_run_decisions_run_id_one_shot_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."one_shot_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_shot_run_briefs_run_revision_unique" ON "one_shot_run_briefs" USING btree ("run_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "one_shot_run_briefs_request_unique" ON "one_shot_run_briefs" USING btree ("owner_user_id","project_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "one_shot_run_ledger_entries_run_step_unique" ON "one_shot_run_ledger_entries" USING btree ("run_id","step");--> statement-breakpoint
CREATE UNIQUE INDEX "one_shot_run_decisions_run_seq_unique" ON "one_shot_run_decisions" USING btree ("run_id","seq");--> statement-breakpoint
CREATE FUNCTION prevent_one_shot_run_decision_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'one_shot_run_decisions are append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER one_shot_run_decisions_append_only
BEFORE UPDATE ON "one_shot_run_decisions"
FOR EACH ROW EXECUTE FUNCTION prevent_one_shot_run_decision_update();
