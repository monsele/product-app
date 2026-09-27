-- ST-104: optional lesson focus, objectives focus coverage, and the
-- ai.lesson-intent usage operation. Additive only; no existing row changes.
ALTER TYPE "usage_operation_type" ADD VALUE IF NOT EXISTS 'ai.lesson-intent';--> statement-breakpoint
ALTER TABLE "lesson_configurations" ADD COLUMN "focus_prompt" text;--> statement-breakpoint
ALTER TABLE "lesson_configurations" ADD CONSTRAINT "lesson_configurations_focus_prompt_length" CHECK ("focus_prompt" IS NULL OR (char_length("focus_prompt") BETWEEN 1 AND 1000 AND "focus_prompt" = btrim("focus_prompt")));--> statement-breakpoint
ALTER TABLE "learning_objective_sets" ADD COLUMN "focus_coverage" jsonb;
