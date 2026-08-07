import { describe, expect, it } from "vitest";
import {
  nextRevision,
  OptimisticConcurrencyError,
  requireOptimisticUpdate,
} from "./concurrency.js";

describe("optimistic concurrency utilities", () => {
  it("returns the updated row and increments valid revisions", () => {
    const row = { revision: 2 };
    expect(
      requireOptimisticUpdate([row], {
        entity: "database metadata",
        entityId: "schema",
        expectedRevision: 1,
      }),
    ).toBe(row);
    expect(nextRevision(1)).toBe(2);
  });

  it("classifies a zero-row update as stale", () => {
    expect(() =>
      requireOptimisticUpdate([], {
        entity: "database metadata",
        entityId: "schema",
        expectedRevision: 1,
      }),
    ).toThrow(OptimisticConcurrencyError);
  });

  it("rejects invalid revision values", () => {
    expect(() => nextRevision(0)).toThrow(RangeError);
    expect(() => nextRevision(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});
