export type OptimisticConcurrencyDetails = {
  entity: string;
  entityId: string;
  expectedRevision: number;
};

export class OptimisticConcurrencyError extends Error {
  public readonly code = "optimistic_concurrency_conflict" as const;
  public readonly details: OptimisticConcurrencyDetails;

  public constructor(details: OptimisticConcurrencyDetails) {
    super(
      `The ${details.entity} revision changed before this update completed.`,
    );
    this.name = "OptimisticConcurrencyError";
    this.details = details;
  }
}

/**
 * Repositories update with `WHERE id = ? AND revision = ?`, increment revision
 * in the same statement, and pass the returned rows here. Zero rows means the
 * caller used a stale revision (or an inaccessible/missing entity).
 */
export function requireOptimisticUpdate<T>(
  updatedRows: readonly T[],
  details: OptimisticConcurrencyDetails,
): T {
  const row = updatedRows[0];
  if (row === undefined) throw new OptimisticConcurrencyError(details);
  return row;
}

export const nextRevision = (expectedRevision: number): number => {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
    throw new RangeError("Expected revision must be a positive safe integer.");
  return expectedRevision + 1;
};
