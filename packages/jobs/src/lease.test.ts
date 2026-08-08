import { describe, expect, it } from "vitest";
import { staleLeaseAction } from "./repository.js";

describe("heartbeat and stale lease policy", () => {
  const now = new Date("2026-08-08T12:00:00.000Z");

  it("does not reap a lease renewed by a heartbeat", () => {
    expect(
      staleLeaseAction(
        {
          state: "running",
          leaseExpiresAt: new Date(now.getTime() + 1),
          attempts: 1,
          maxAttempts: 3,
        },
        now,
      ),
    ).toBe("not_stale");
  });

  it("requeues an expired lease until the attempt ceiling is reached", () => {
    expect(
      staleLeaseAction(
        {
          state: "running",
          leaseExpiresAt: new Date(now.getTime() - 1),
          attempts: 2,
          maxAttempts: 3,
        },
        now,
      ),
    ).toBe("requeue");
    expect(
      staleLeaseAction(
        {
          state: "running",
          leaseExpiresAt: new Date(now.getTime() - 1),
          attempts: 3,
          maxAttempts: 3,
        },
        now,
      ),
    ).toBe("fail");
  });
});
