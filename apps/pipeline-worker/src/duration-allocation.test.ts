import { describe, expect, it } from "vitest";
import { allocateDurationsToTarget } from "./duration-allocation.js";

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

describe("allocateDurationsToTarget", () => {
  it("rescales an over-long total to the exact target", () => {
    const durations = allocateDurationsToTarget({
      estimates: [20, 50, 50, 50, 10, 30],
      target: 180,
      minimum: 10,
      maximum: 240,
    });
    expect(durations).toBeDefined();
    expect(sum(durations!)).toBe(180);
  });

  it("rescales an under-long total to the exact target", () => {
    const durations = allocateDurationsToTarget({
      estimates: [10, 20, 20, 20, 10, 10],
      target: 180,
      minimum: 10,
      maximum: 240,
    });
    expect(sum(durations!)).toBe(180);
  });

  it("keeps every duration inside the bounds", () => {
    const durations = allocateDurationsToTarget({
      estimates: [1, 500, 30, 30],
      target: 200,
      minimum: 10,
      maximum: 120,
    })!;
    expect(sum(durations)).toBe(200);
    for (const duration of durations) {
      expect(duration).toBeGreaterThanOrEqual(10);
      expect(duration).toBeLessThanOrEqual(120);
    }
  });

  it("preserves the relative ordering of estimates", () => {
    const durations = allocateDurationsToTarget({
      estimates: [20, 60, 40],
      target: 240,
      minimum: 10,
      maximum: 240,
    })!;
    expect(durations[1]!).toBeGreaterThan(durations[2]!);
    expect(durations[2]!).toBeGreaterThan(durations[0]!);
  });

  it("returns undefined when the target is unreachable", () => {
    expect(
      allocateDurationsToTarget({
        estimates: Array.from({ length: 20 }, () => 20),
        target: 180,
        minimum: 10,
        maximum: 240,
      }),
    ).toBeUndefined();
    expect(
      allocateDurationsToTarget({
        estimates: [60, 60],
        target: 180,
        minimum: 3,
        maximum: 60,
      }),
    ).toBeUndefined();
  });

  it("is deterministic", () => {
    const input = {
      estimates: [23, 47, 51, 38, 12, 39],
      target: 180,
      minimum: 10,
      maximum: 240,
    };
    expect(allocateDurationsToTarget(input)).toEqual(
      allocateDurationsToTarget(input),
    );
  });
});
