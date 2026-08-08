CREATE TYPE "public"."job_error_classification" AS ENUM('retryable', 'terminal', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_state" AS ENUM('queued', 'running', 'retry_wait', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_type" text NOT NULL,
	"queue_name" text NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"input_version" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"payload_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"state" "job_state" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"retry_delay_ms" integer DEFAULT 5000 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"result_metadata" jsonb,
	"error_classification" "job_error_classification",
	"error_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"queue_name" text NOT NULL,
	"envelope" jsonb NOT NULL,
	"delivery_options" jsonb NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"claim_expires_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"dispatch_attempts" integer DEFAULT 0 NOT NULL,
	"last_error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency_key_unique" ON "jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_project_created_idx" ON "jobs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_stale_lease_idx" ON "jobs" USING btree ("state","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_job_event_unique" ON "outbox_events" USING btree ("job_id","event_type");--> statement-breakpoint
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" USING btree ("dispatched_at","available_at","claim_expires_at");