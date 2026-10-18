CREATE TABLE lesson_recovery_signals (
  project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- A notification is not authorization. Only an existing, un-stopped preparation
-- session is eligible, and its allowance is unchanged. Upserts coalesce edits.
CREATE FUNCTION notify_lesson_recovery() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dependency record;
BEGIN
  IF TG_OP = 'DELETE' THEN dependency := OLD; ELSE dependency := NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM lesson_recovery_runs
    WHERE project_id = dependency.project_id
      AND owner_user_id = dependency.owner_user_id AND stopped_at IS NULL
  ) THEN
    INSERT INTO lesson_recovery_signals (project_id, owner_user_id, changed_at)
    VALUES (dependency.project_id, dependency.owner_user_id, date_trunc('milliseconds', clock_timestamp()))
    ON CONFLICT (project_id) DO UPDATE SET changed_at = EXCLUDED.changed_at;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER recovery_spec_change AFTER INSERT OR UPDATE OF revision, content_hash ON lesson_specs
FOR EACH ROW EXECUTE FUNCTION notify_lesson_recovery();
CREATE TRIGGER recovery_voice_change AFTER INSERT OR UPDATE OR DELETE ON voice_configurations
FOR EACH ROW EXECUTE FUNCTION notify_lesson_recovery();
CREATE TRIGGER recovery_pronunciation_change AFTER INSERT OR UPDATE OR DELETE ON pronunciation_entries
FOR EACH ROW EXECUTE FUNCTION notify_lesson_recovery();
CREATE TRIGGER recovery_audio_change AFTER INSERT OR UPDATE OF status, storage_key, duration_ms ON scene_audio
FOR EACH ROW EXECUTE FUNCTION notify_lesson_recovery();
CREATE TRIGGER recovery_captions_change AFTER INSERT OR UPDATE OR DELETE ON caption_tracks
FOR EACH ROW EXECUTE FUNCTION notify_lesson_recovery();
CREATE TRIGGER recovery_asset_change AFTER INSERT OR UPDATE OR DELETE ON project_assets
FOR EACH ROW EXECUTE FUNCTION notify_lesson_recovery();
CREATE TRIGGER recovery_grounding_change AFTER INSERT OR UPDATE OR DELETE ON grounding_checks
FOR EACH ROW EXECUTE FUNCTION notify_lesson_recovery();
CREATE TRIGGER recovery_job_settled AFTER UPDATE OF state ON jobs
FOR EACH ROW WHEN (NEW.job_type <> 'lesson.recovery.advance' AND NEW.state IS DISTINCT FROM OLD.state
  AND NEW.state IN ('succeeded', 'failed', 'cancelled'))
EXECUTE FUNCTION notify_lesson_recovery();
