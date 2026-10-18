import { metrics, type Meter } from "@opentelemetry/api";
import { sql } from "drizzle-orm";
import type { DatabaseClient } from "@avlp/database";

/** System-only aggregate telemetry. No tenant identifiers, teaching content or
 * media URLs are exported. User-facing reads remain scoped to owner/project. */
export function registerRecoveryReleaseMetrics(
  database: DatabaseClient,
  enabled: boolean,
  meter: Meter = metrics.getMeter("@avlp/recovery"),
) {
  if (!enabled) return;
  const instruments = {
    editable: meter.createObservableGauge(
      "avlp.preparation.time_to_edit.mean",
      { unit: "ms" },
    ),
    preview: meter.createObservableGauge(
      "avlp.preparation.time_to_preview.mean",
      { unit: "ms" },
    ),
    succeeded: meter.createObservableGauge("avlp.recovery.successful_tasks"),
    unresolved: meter.createObservableGauge("avlp.recovery.unresolved_tasks"),
    retries: meter.createObservableGauge("avlp.recovery.retries"),
    cost: meter.createObservableGauge("avlp.recovery.recorded_cost", {
      unit: "USD",
    }),
  };
  meter.addBatchObservableCallback(async (result) => {
    const [row] = await database.execute<{
      editable: string;
      preview: string;
      succeeded: string;
      unresolved: string;
      retries: string;
      cost: string;
    }>(sql`select
      (select coalesce(avg(greatest(0, extract(epoch from first_editable_at - generated_at) * 1000)), 0) from lesson_preparation_milestones) as editable,
      (select coalesce(avg(greatest(0, extract(epoch from first_preview_at - generated_at) * 1000)), 0) from lesson_preparation_milestones where first_preview_at is not null) as preview,
      count(*) filter (where state = 'succeeded') as succeeded,
      count(*) filter (where state in ('queued','running','retry_wait','needs_action','failed')) as unresolved,
      coalesce(sum(greatest(0, attempts - 1)), 0) as retries,
      (select coalesce(sum(u.estimated_cost_usd), 0) from usage_records u where exists (
        select 1 from lesson_recovery_tasks t where t.owner_user_id = u.owner_user_id and t.project_id = u.project_id
        and t.job_id::text = u.metadata->'providerSelection'->>'approvalReference'
      )) as cost from lesson_recovery_tasks`);
    if (!row) return;
    for (const key of Object.keys(instruments) as (keyof typeof instruments)[])
      result.observe(instruments[key], Number(row[key]));
  }, Object.values(instruments));
}
