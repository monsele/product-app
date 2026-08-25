import type { Identifier } from "@avlp/config";

/**
 * Quota guard invoked before every paid generation operation. Implementations
 * enforce per-project/per-user cost or call-count limits and reject with
 * {@link QuotaExceededError} when a limit is reached.
 */
export interface QuotaGuard {
  assertCanGenerate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    operationType: string;
    now?: Date;
  }): Promise<void>;
}

export class QuotaExceededError extends Error {
  public readonly code = "AI_QUOTA_EXCEEDED" as const;
  public readonly retryable = true;

  public constructor(message = "The AI generation quota has been exceeded.") {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export type InMemoryQuotaLimit = {
  operationType?: string;
  maxCalls: number;
  windowMs: number;
};

/**
 * Deterministic in-memory quota guard for tests and local development. Counts
 * calls per (owner, project, optional operationType) within a sliding window
 * and rejects when a limit is exceeded.
 */
export class InMemoryQuotaGuard implements QuotaGuard {
  private readonly calls: Array<{
    ownerUserId: string;
    projectId: string;
    operationType: string;
    at: number;
  }> = [];

  public constructor(
    private readonly limits: readonly InMemoryQuotaLimit[],
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async assertCanGenerate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    operationType: string;
    now?: Date;
  }): Promise<void> {
    const at = (input.now ?? this.now()).getTime();
    this.calls.push({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      operationType: input.operationType,
      at,
    });
    for (const limit of this.limits) {
      if (
        limit.operationType !== undefined &&
        limit.operationType !== input.operationType
      )
        continue;
      const recent = this.calls.filter(
        (call) =>
          call.ownerUserId === input.ownerUserId &&
          call.projectId === input.projectId &&
          (limit.operationType === undefined ||
            call.operationType === limit.operationType) &&
          call.at >= at - limit.windowMs,
      ).length;
      if (recent > limit.maxCalls) throw new QuotaExceededError();
    }
  }
}
