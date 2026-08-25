ALTER TYPE "public"."audit_event_type" ADD VALUE 'objectives.edited' BEFORE 'version.restored';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'objectives.approved' BEFORE 'version.restored';--> statement-breakpoint
ALTER TYPE "public"."learning_objective_set_status" ADD VALUE 'superseded';--> statement-breakpoint
ALTER TABLE "learning_objective_sets" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;