DROP INDEX "creative_design_snapshots_hash_unique";
CREATE UNIQUE INDEX "creative_design_snapshots_lesson_revision_hash_unique"
  ON "creative_design_snapshots" ("owner_user_id", "project_id", "lesson_spec_id", "lesson_spec_revision", "manifest_hash");
