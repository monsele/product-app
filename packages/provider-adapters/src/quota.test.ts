import { describe, expect, it } from "vitest";
import {
  InMemoryQuotaGuard,
  QuotaExceededError,
  type QuotaGuard,
} from "./quota.js";

const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const projectId = "019ffbf1-cccc-7000-8000-000000000001";
const otherProjectId = "019ffbf1-cccc-7000-8000-000000000002";

describe("quota guard", () => {
  it("allows calls within the configured limit", async () => {
    const guard = new InMemoryQuotaGuard([
      { operationType: "ai.objectives", maxCalls: 2, windowMs: 60_000 },
    ]);
    await guard.assertCanGenerate({
      ownerUserId,
      projectId,
      operationType: "ai.objectives",
      now: new Date("2026-08-16T10:00:00.000Z"),
    });
    await expect(
      guard.assertCanGenerate({
        ownerUserId,
        projectId,
        operationType: "ai.objectives",
        now: new Date("2026-08-16T10:00:01.000Z"),
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects calls beyond the configured limit", async () => {
    const guard = new InMemoryQuotaGuard([
      { operationType: "ai.objectives", maxCalls: 1, windowMs: 60_000 },
    ]);
    await guard.assertCanGenerate({
      ownerUserId,
      projectId,
      operationType: "ai.objectives",
      now: new Date("2026-08-16T10:00:00.000Z"),
    });
    await expect(
      guard.assertCanGenerate({
        ownerUserId,
        projectId,
        operationType: "ai.objectives",
        now: new Date("2026-08-16T10:00:01.000Z"),
      }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("does not count other operations or projects", async () => {
    const guard = new InMemoryQuotaGuard([
      { operationType: "ai.objectives", maxCalls: 1, windowMs: 60_000 },
    ]);
    await guard.assertCanGenerate({
      ownerUserId,
      projectId,
      operationType: "ai.outline",
      now: new Date("2026-08-16T10:00:00.000Z"),
    });
    await guard.assertCanGenerate({
      ownerUserId,
      projectId,
      operationType: "ai.objectives",
      now: new Date("2026-08-16T10:00:01.000Z"),
    });
    await guard.assertCanGenerate({
      ownerUserId,
      projectId: otherProjectId,
      operationType: "ai.objectives",
      now: new Date("2026-08-16T10:00:02.000Z"),
    });
    await expect(
      guard.assertCanGenerate({
        ownerUserId,
        projectId,
        operationType: "ai.objectives",
        now: new Date("2026-08-16T10:00:03.000Z"),
      }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("expires counters after the window", async () => {
    const guard = new InMemoryQuotaGuard([
      { operationType: "ai.objectives", maxCalls: 1, windowMs: 1_000 },
    ]);
    await guard.assertCanGenerate({
      ownerUserId,
      projectId,
      operationType: "ai.objectives",
      now: new Date("2026-08-16T10:00:00.000Z"),
    });
    await expect(
      guard.assertCanGenerate({
        ownerUserId,
        projectId,
        operationType: "ai.objectives",
        now: new Date("2026-08-16T10:00:02.000Z"),
      }),
    ).resolves.toBeUndefined();
  });

  it("satisfies the QuotaGuard contract shape", () => {
    const guard: QuotaGuard = new InMemoryQuotaGuard([]);
    expect(typeof guard.assertCanGenerate).toBe("function");
  });
});
