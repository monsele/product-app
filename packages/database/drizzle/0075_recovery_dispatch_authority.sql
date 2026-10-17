ALTER TABLE lesson_recovery_tasks ADD COLUMN calls jsonb NOT NULL DEFAULT '{}';
ALTER TABLE lesson_recovery_tasks ADD COLUMN prior_attempts integer NOT NULL DEFAULT 0 CHECK (prior_attempts >= 0 AND prior_attempts <= 3);
ALTER TABLE lesson_recovery_runs ADD COLUMN authorization_requests jsonb NOT NULL DEFAULT '{}';

ALTER TABLE lesson_recovery_runs DROP CONSTRAINT lesson_recovery_runs_revision_check;
ALTER TABLE lesson_recovery_runs ADD CONSTRAINT lesson_recovery_runs_revision_check CHECK (revision >= 0);
