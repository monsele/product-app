CREATE TABLE design_system_interpretations (
  id uuid PRIMARY KEY, owner_user_id uuid NOT NULL, system_id uuid NOT NULL,
  project_id uuid NOT NULL, job_id uuid NOT NULL,
  input_revision integer NOT NULL CHECK (input_revision > 0), input_hash text NOT NULL,
  input jsonb NOT NULL, dispatch_state text NOT NULL DEFAULT 'pending'
    CHECK (dispatch_state IN ('pending','calling','received','failed')),
  response jsonb, proposal jsonb, accepted_revision integer,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_user_id, system_id) REFERENCES design_systems(owner_user_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX design_interpretations_input_unique ON design_system_interpretations(owner_user_id,system_id,input_hash);
CREATE UNIQUE INDEX design_interpretations_job_unique ON design_system_interpretations(job_id);
