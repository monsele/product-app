CREATE TABLE "citation_history_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"lesson_version_id" uuid NOT NULL,
	"lesson_spec_id" uuid NOT NULL,
	"lesson_spec_revision" integer NOT NULL,
	"source_snapshot_id" uuid NOT NULL,
	"source_snapshot_content_hash" text NOT NULL,
	"scene_citations" jsonb NOT NULL,
	"grounding_check_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grounding_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"lesson_spec_id" uuid NOT NULL,
	"lesson_spec_revision" integer NOT NULL,
	"lesson_spec_content_hash" text NOT NULL,
	"source_snapshot_id" uuid NOT NULL,
	"source_snapshot_content_hash" text NOT NULL,
	"scope" text NOT NULL,
	"scene_id" uuid,
	"claims" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"model_call_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "citation_history_snapshots" ADD CONSTRAINT "citation_history_snapshots_lesson_spec_id_lesson_specs_id_fk" FOREIGN KEY ("lesson_spec_id") REFERENCES "public"."lesson_specs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_history_snapshots" ADD CONSTRAINT "citation_history_snapshots_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_history_snapshots" ADD CONSTRAINT "citation_history_snapshots_grounding_check_id_grounding_checks_id_fk" FOREIGN KEY ("grounding_check_id") REFERENCES "public"."grounding_checks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grounding_checks" ADD CONSTRAINT "grounding_checks_lesson_spec_id_lesson_specs_id_fk" FOREIGN KEY ("lesson_spec_id") REFERENCES "public"."lesson_specs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grounding_checks" ADD CONSTRAINT "grounding_checks_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scenes_stable_scene_id_unique" ON "scenes" USING btree ("stable_scene_id");--> statement-breakpoint
ALTER TABLE "grounding_checks" ADD CONSTRAINT "grounding_checks_scene_id_scenes_stable_scene_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("stable_scene_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "citation_history_snapshots_tenant_version_unique" ON "citation_history_snapshots" USING btree ("owner_user_id","project_id","lesson_version_id");--> statement-breakpoint
CREATE INDEX "citation_history_snapshots_lesson_spec_idx" ON "citation_history_snapshots" USING btree ("lesson_spec_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grounding_checks_tenant_idempotency_unique" ON "grounding_checks" USING btree ("owner_user_id","project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "grounding_checks_lesson_spec_idx" ON "grounding_checks" USING btree ("lesson_spec_id");--> statement-breakpoint
CREATE INDEX "grounding_checks_scene_idx" ON "grounding_checks" USING btree ("scene_id");
