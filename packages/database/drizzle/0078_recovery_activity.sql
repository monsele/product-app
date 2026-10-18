CREATE TABLE lesson_recovery_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES lesson_recovery_runs(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES lesson_recovery_tasks(id) ON DELETE CASCADE,
  scene_id uuid, operation text NOT NULL, state text NOT NULL, attempts integer NOT NULL,
  failure_code text, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recovery_activity_project_time ON lesson_recovery_activity(owner_user_id, project_id, occurred_at DESC);
--> statement-breakpoint
CREATE FUNCTION record_lesson_recovery_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.state IS DISTINCT FROM OLD.state THEN
    INSERT INTO lesson_recovery_activity (owner_user_id, project_id, run_id, task_id, scene_id, operation, state, attempts, failure_code)
    VALUES (NEW.owner_user_id, NEW.project_id, NEW.run_id, NEW.id, NEW.scene_id, NEW.operation, NEW.state, NEW.attempts, NEW.failure_code);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER recovery_task_activity AFTER INSERT OR UPDATE OF state ON lesson_recovery_tasks
FOR EACH ROW EXECUTE FUNCTION record_lesson_recovery_activity();
CREATE TABLE lesson_preparation_milestones (
  id uuid PRIMARY KEY, owner_user_id uuid NOT NULL, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lesson_spec_id uuid NOT NULL, generated_at timestamptz NOT NULL, first_editable_at timestamptz NOT NULL,
  first_preview_at timestamptz, UNIQUE(owner_user_id, project_id, lesson_spec_id)
);
CREATE INDEX recovery_signals_changed_at ON lesson_recovery_signals(changed_at);
CREATE UNIQUE INDEX recovery_task_job_unique ON lesson_recovery_tasks(owner_user_id, project_id, job_id) WHERE job_id IS NOT NULL;
