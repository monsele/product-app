ALTER TABLE one_shot_runs ADD COLUMN preparation_authorized boolean NOT NULL DEFAULT false;
ALTER TABLE one_shot_runs ADD COLUMN preparation_allowance_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK (preparation_allowance_usd >= 0);
CREATE TABLE lesson_preparation_grants (
  id uuid PRIMARY KEY, owner_user_id uuid NOT NULL, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL, fingerprint text NOT NULL, allowance_usd numeric(12,6) NOT NULL CHECK (allowance_usd >= 0),
  correlation_id uuid NOT NULL, job_id uuid, run_id uuid, stopped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id, project_id, idempotency_key)
);
CREATE INDEX preparation_grants_pending ON lesson_preparation_grants(created_at) WHERE run_id IS NULL AND stopped_at IS NULL;
