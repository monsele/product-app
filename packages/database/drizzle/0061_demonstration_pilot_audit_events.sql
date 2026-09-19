ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'demonstration.comparison_created';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'demonstration.variant_requested';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'demonstration.variant_retried';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'demonstration.feedback_saved';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE IF NOT EXISTS 'demonstration.test_lesson_created';
