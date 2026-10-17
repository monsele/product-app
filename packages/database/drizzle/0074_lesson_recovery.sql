CREATE TABLE lesson_recovery_runs (
 id uuid PRIMARY KEY, project_id uuid NOT NULL, owner_user_id uuid NOT NULL,
 lesson_spec_id uuid NOT NULL, revision integer NOT NULL CHECK (revision > 0),
 idempotency_key text NOT NULL, state text NOT NULL DEFAULT 'queued',
 allowance_usd numeric(12,6) NOT NULL CHECK (allowance_usd >= 0),
 reserved_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0 AND reserved_usd <= allowance_usd),
 one_shot_run_id uuid, correlation_id uuid NOT NULL, validation_run_id uuid,
 sequence integer NOT NULL DEFAULT 0, lease_until timestamptz, lease_job_id uuid,
 stopped_at timestamptz, failure_code text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX recovery_run_request_unique ON lesson_recovery_runs(owner_user_id, project_id, idempotency_key);
CREATE UNIQUE INDEX recovery_run_active_unique ON lesson_recovery_runs(owner_user_id, project_id) WHERE stopped_at IS NULL;
--> statement-breakpoint
CREATE TABLE lesson_recovery_tasks (
 id uuid PRIMARY KEY, project_id uuid NOT NULL, owner_user_id uuid NOT NULL,
 run_id uuid NOT NULL REFERENCES lesson_recovery_runs(id) ON DELETE CASCADE,
 scene_id uuid, operation text NOT NULL, fingerprint text NOT NULL,
 issue_codes jsonb NOT NULL DEFAULT '[]', state text NOT NULL DEFAULT 'queued',
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 3),
 job_id uuid, failure_code text, reserved_usd numeric(12,6) NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT recovery_task_state CHECK (state IN ('queued','running','retry_wait','succeeded','needs_action','failed','superseded','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX recovery_task_operation_unique ON lesson_recovery_tasks(owner_user_id, project_id, operation, fingerprint);
CREATE INDEX recovery_task_run_idx ON lesson_recovery_tasks(run_id);
