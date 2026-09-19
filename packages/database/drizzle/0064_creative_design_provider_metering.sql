ALTER TYPE "usage_operation_type" ADD VALUE IF NOT EXISTS 'ai.creative_design';

CREATE TABLE "creative_design_proposals" (
  "id" uuid PRIMARY KEY NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "draft_id" uuid NOT NULL REFERENCES "creative_design_drafts"("id") ON DELETE cascade,
  "draft_revision" integer NOT NULL,
  "model_call_id" uuid NOT NULL REFERENCES "model_calls"("id") ON DELETE restrict,
  "patch" jsonb NOT NULL,
  "unsupported" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "creative_design_proposals_model_call_unique" ON "creative_design_proposals" ("model_call_id");
CREATE INDEX "creative_design_proposals_draft_idx" ON "creative_design_proposals" ("owner_user_id", "project_id", "draft_id", "created_at");
