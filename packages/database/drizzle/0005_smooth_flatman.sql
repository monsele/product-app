DROP INDEX "jobs_idempotency_key_unique";--> statement-breakpoint
DROP INDEX "usage_records_idempotency_key_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_tenant_idempotency_unique" ON "jobs" USING btree ("owner_user_id","project_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_records_tenant_idempotency_unique" ON "usage_records" USING btree ("owner_user_id","project_id","idempotency_key");