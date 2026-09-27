import type { Identifier } from "@avlp/config";
import type { AuditActor } from "@avlp/observability";

/**
 * Who a service call's audit event names as the actor.
 *
 * ST-105 (ADR-013): a prompt-to-video run approves, saves and generates on
 * its owner's behalf. Those events must name the run, never claim the teacher
 * acted, so the audit trail can tell a human approval from an automatic one.
 * Without a run the caller is the signed-in owner, as before.
 */
export function requestActor(input: {
  ownerUserId: Identifier;
  oneShotRunId?: Identifier | undefined;
}): AuditActor {
  return input.oneShotRunId === undefined
    ? { type: "user", userId: input.ownerUserId }
    : {
        type: "one_shot_run",
        runId: input.oneShotRunId,
        userId: input.ownerUserId,
      };
}
