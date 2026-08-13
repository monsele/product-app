CREATE TABLE "project_clone_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"duplicate_project_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "project_clone_requests_source_key_unique" ON "project_clone_requests" USING btree ("owner_user_id","project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "project_clone_requests_duplicate_idx" ON "project_clone_requests" USING btree ("owner_user_id","duplicate_project_id");