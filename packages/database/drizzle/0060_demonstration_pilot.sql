CREATE TYPE "public"."video_approach" AS ENUM('standard', 'demonstration');
--> statement-breakpoint
CREATE TYPE "public"."demonstration_variant_status" AS ENUM('pending', 'queued', 'generating', 'ready', 'failed', 'stale');
--> statement-breakpoint
ALTER TABLE "lesson_configurations" ADD COLUMN "video_approach" "public"."video_approach" DEFAULT 'standard' NOT NULL;
--> statement-breakpoint
CREATE TABLE "demonstration_comparisons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"baseline_lesson_version_id" uuid NOT NULL,
	"baseline_content_hash" text NOT NULL,
	"source_snapshot_id" uuid NOT NULL,
	"experiment_version" text NOT NULL,
	"theme_id" text DEFAULT 'mvp-default' NOT NULL,
	"scene_correspondence" jsonb NOT NULL,
	"media_identity" jsonb NOT NULL,
	"duration_in_frames" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demonstration_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"comparison_id" uuid NOT NULL,
	"approach" "public"."video_approach" NOT NULL,
	"status" "public"."demonstration_variant_status" DEFAULT 'pending' NOT NULL,
	"identity_sha256" text NOT NULL,
	"plan" jsonb,
	"plan_sha256" text,
	"render_job_id" uuid,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demonstration_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"comparison_id" uuid NOT NULL,
	"tester_user_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"ratings" jsonb NOT NULL,
	"preference" text,
	"comment" text,
	"rated_variant_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demonstration_comparisons" ADD CONSTRAINT "demonstration_comparisons_baseline_lesson_version_id_lesson_versions_id_fk" FOREIGN KEY ("baseline_lesson_version_id") REFERENCES "public"."lesson_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "demonstration_comparisons" ADD CONSTRAINT "demonstration_comparisons_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "demonstration_comparisons" ADD CONSTRAINT "demonstration_comparisons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "demonstration_variants" ADD CONSTRAINT "demonstration_variants_comparison_id_demonstration_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."demonstration_comparisons"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "demonstration_variants" ADD CONSTRAINT "demonstration_variants_render_job_id_render_jobs_id_fk" FOREIGN KEY ("render_job_id") REFERENCES "public"."render_jobs"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "demonstration_feedback" ADD CONSTRAINT "demonstration_feedback_comparison_id_demonstration_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."demonstration_comparisons"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "demonstration_feedback" ADD CONSTRAINT "demonstration_feedback_tester_user_id_users_id_fk" FOREIGN KEY ("tester_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "demonstration_comparisons_baseline_unique" ON "demonstration_comparisons" USING btree ("owner_user_id","project_id","baseline_lesson_version_id","experiment_version");
--> statement-breakpoint
CREATE INDEX "demonstration_comparisons_owner_project_created_idx" ON "demonstration_comparisons" USING btree ("owner_user_id","project_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "demonstration_variants_comparison_approach_unique" ON "demonstration_variants" USING btree ("comparison_id","approach");
--> statement-breakpoint
CREATE UNIQUE INDEX "demonstration_variants_tenant_identity_unique" ON "demonstration_variants" USING btree ("owner_user_id","project_id","identity_sha256");
--> statement-breakpoint
CREATE INDEX "demonstration_variants_owner_project_idx" ON "demonstration_variants" USING btree ("owner_user_id","project_id","comparison_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "demonstration_feedback_comparison_tester_unique" ON "demonstration_feedback" USING btree ("comparison_id","tester_user_id");
--> statement-breakpoint
CREATE INDEX "demonstration_feedback_owner_project_idx" ON "demonstration_feedback" USING btree ("owner_user_id","project_id","comparison_id");
