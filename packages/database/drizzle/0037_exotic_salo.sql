ALTER TYPE "public"."audit_event_type" ADD VALUE 'storyboard.scene_candidate_accepted';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'storyboard.scene_candidate_rejected';--> statement-breakpoint
CREATE TABLE "scene_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"lesson_spec_id" uuid NOT NULL,
	"scene_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"before_scene" jsonb NOT NULL,
	"after_scene" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"scene_revision" integer NOT NULL,
	"model_call_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scene_candidates" ADD CONSTRAINT "scene_candidates_lesson_spec_id_lesson_specs_id_fk" FOREIGN KEY ("lesson_spec_id") REFERENCES "public"."lesson_specs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_candidates" ADD CONSTRAINT "scene_candidates_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_candidates" ADD CONSTRAINT "scene_candidates_model_call_id_model_calls_id_fk" FOREIGN KEY ("model_call_id") REFERENCES "public"."model_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scene_candidates_tenant_idempotency_unique" ON "scene_candidates" USING btree ("owner_user_id","project_id","scene_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "scene_candidates_lesson_spec_scene_status_idx" ON "scene_candidates" USING btree ("lesson_spec_id","scene_id","status");