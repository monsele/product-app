CREATE TYPE "public"."lesson_version_reason" AS ENUM('approval', 'explicit_save', 'before_render');--> statement-breakpoint
CREATE TABLE "lesson_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"parent_version_id" uuid,
	"reason" "lesson_version_reason" NOT NULL,
	"created_by" uuid NOT NULL,
	"lesson_spec_id" uuid NOT NULL,
	"lesson_spec_revision" integer NOT NULL,
	"source_snapshot_id" uuid NOT NULL,
	"configuration_version" integer NOT NULL,
	"objective_set_id" uuid NOT NULL,
	"outline_set_id" uuid NOT NULL,
	"narration_set_id" uuid NOT NULL,
	"schema_version" text NOT NULL,
	"scene_library_version" text NOT NULL,
	"prompt_versions" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_versions" ADD CONSTRAINT "lesson_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_versions" ADD CONSTRAINT "lesson_versions_lesson_spec_id_lesson_specs_id_fk" FOREIGN KEY ("lesson_spec_id") REFERENCES "public"."lesson_specs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_versions" ADD CONSTRAINT "lesson_versions_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_versions" ADD CONSTRAINT "lesson_versions_objective_set_id_learning_objective_sets_id_fk" FOREIGN KEY ("objective_set_id") REFERENCES "public"."learning_objective_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_versions" ADD CONSTRAINT "lesson_versions_outline_set_id_lesson_outline_sets_id_fk" FOREIGN KEY ("outline_set_id") REFERENCES "public"."lesson_outline_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_versions" ADD CONSTRAINT "lesson_versions_narration_set_id_narration_sets_id_fk" FOREIGN KEY ("narration_set_id") REFERENCES "public"."narration_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_versions_project_number_unique" ON "lesson_versions" USING btree ("project_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_versions_tenant_content_hash_unique" ON "lesson_versions" USING btree ("owner_user_id","project_id","content_hash");--> statement-breakpoint
CREATE INDEX "lesson_versions_owner_project_created_idx" ON "lesson_versions" USING btree ("owner_user_id","project_id","created_at");
--> statement-breakpoint
CREATE FUNCTION prevent_lesson_version_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'lesson_versions are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER lesson_versions_immutable
BEFORE UPDATE OR DELETE ON "lesson_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_lesson_version_mutation();
