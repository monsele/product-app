import { and, eq, sql } from "drizzle-orm";
import { recoveryCallsSchema as callsSchema } from "@avlp/schemas";
import type { DatabaseClient } from "./client.js";
import { lessonRecoveryRuns, lessonRecoveryTasks, projects } from "./schema.js";

export class RecoveryAuthorityError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/** Called immediately before each paid provider dispatch, never across the call.
 * Calls are reserved pessimistically: failed/uncertain dispatches keep their debit. */
export async function authorizeRecoveryCall(
  database: DatabaseClient,
  input: {
    ownerUserId: string;
    projectId: string;
    taskId: string;
    jobId: string;
    attempt: number;
    phase: string;
    maximumCostUsd: number;
  },
): Promise<void> {
  if (!Number.isFinite(input.maximumCostUsd) || input.maximumCostUsd < 0)
    throw new RecoveryAuthorityError("RECOVERY_PRICE_UNAVAILABLE");
  await database.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${input.projectId}))`,
    );
    const [task] = await tx
      .select()
      .from(lessonRecoveryTasks)
      .where(
        and(
          eq(lessonRecoveryTasks.id, input.taskId),
          eq(lessonRecoveryTasks.ownerUserId, input.ownerUserId),
          eq(lessonRecoveryTasks.projectId, input.projectId),
        ),
      )
      .for("update");
    if (
      !task ||
      task.jobId !== input.jobId ||
      ["cancelled", "superseded", "failed"].includes(task.state)
    )
      throw new RecoveryAuthorityError("RECOVERY_INPUT_SUPERSEDED");
    const [run] = await tx
      .select()
      .from(lessonRecoveryRuns)
      .where(
        and(
          eq(lessonRecoveryRuns.id, task.runId),
          eq(lessonRecoveryRuns.ownerUserId, input.ownerUserId),
          eq(lessonRecoveryRuns.projectId, input.projectId),
        ),
      )
      .for("update");
    const [project] = await tx
      .select({ deletedAt: projects.deletedAt })
      .from(projects)
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.ownerUserId, input.ownerUserId),
        ),
      );
    if (
      !run ||
      run.stoppedAt !== null ||
      !project ||
      project.deletedAt !== null
    )
      throw new RecoveryAuthorityError("RECOVERY_CANCELLED");
    if (input.attempt + task.priorAttempts > 3)
      throw new RecoveryAuthorityError("RECOVERY_ATTEMPTS_EXHAUSTED");
    const calls = callsSchema.parse(task.calls);
    const key = `${input.jobId}:${input.attempt}:${input.phase}`;
    // A replayed dispatch cannot silently spend twice. Worker retry gets a new attempt.
    if (calls[key] !== undefined)
      throw new RecoveryAuthorityError("RECOVERY_DISPATCH_ALREADY_RESERVED");
    const cost = Math.ceil(input.maximumCostUsd * 1_000_000) / 1_000_000;
    const total =
      Object.values(calls).reduce((sum, value) => sum + value, 0) + cost;
    if (total > Number(task.reservedUsd) + 0.0000001)
      throw new RecoveryAuthorityError("RECOVERY_ALLOWANCE_EXHAUSTED");
    await tx
      .update(lessonRecoveryTasks)
      .set({
        calls: { ...calls, [key]: cost },
        attempts: input.attempt + task.priorAttempts,
        updatedAt: new Date(),
      })
      .where(eq(lessonRecoveryTasks.id, task.id));
  });
}
