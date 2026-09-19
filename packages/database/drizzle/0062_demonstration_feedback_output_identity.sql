ALTER TABLE "demonstration_feedback"
  ADD COLUMN "rated_outputs" jsonb NOT NULL DEFAULT '[]'::jsonb;
