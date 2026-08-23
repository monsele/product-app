CREATE TABLE "illustration_generation_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"scene_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"asset_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"prompt_version" text NOT NULL,
	"provider" text NOT NULL,
	"provider_call_id" text,
	"moderation_status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "illustration_generation_candidates" ADD CONSTRAINT "illustration_generation_candidates_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "illustration_generation_candidates" ADD CONSTRAINT "illustration_generation_candidates_asset_id_project_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."project_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "illustration_candidates_tenant_idempotency_unique" ON "illustration_generation_candidates" USING btree ("owner_user_id","project_id","scene_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "illustration_candidates_scene_status_idx" ON "illustration_generation_candidates" USING btree ("scene_id","status");