import { describe, expect, it, vi } from "vitest";
import {
  StaleJobReaper,
  runStaleJobReaper,
  type StaleJobRepository,
  type StaleJobTelemetry,
} from "./lease-reaper.js";
import type { JobRow, StaleLeaseSweep } from "./repository.js";

function job(id: string, attempts: number): JobRow {
  return {
    id,
    jobType: "objectives.generate",
    queueName: "pipeline",
    projectId: "project-1",
    ownerUserId: "owner-1",
    correlationId: "correlation-1",
    attempts,
    maxAttempts: 3,
  } as unknown as JobRow;
}

function repository(sweep: StaleLeaseSweep): StaleJobRepository {
  return { requeueStaleJobs: vi.fn().mockResolvedValue(sweep) };
}

function telemetry(): StaleJobTelemetry & {
  requeued: ReturnType<typeof vi.fn>;
  abandoned: ReturnType<typeof vi.fn>;
} {
  return { requeued: vi.fn(), abandoned: vi.fn() };
}

describe("stale job reaper", () => {
  it("reports requeued and abandoned jobs from one sweep", async () => {
    const recorded = telemetry();
    const reaper = new StaleJobReaper(
      repository({ requeued: [job("a", 1)], failed: [job("b", 3)] }),
      { telemetry: recorded },
    );
    await expect(reaper.reapOnce()).resolves.toMatchObject({
      requeued: [{ id: "a" }],
      failed: [{ id: "b" }],
    });
    expect(recorded.requeued).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
    );
    expect(recorded.abandoned).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b" }),
    );
  });

  it("keeps sweeping after a failed cycle and stops when aborted", async () => {
    const controller = new AbortController();
    let cycles = 0;
    const reaper = new StaleJobReaper({
      requeueStaleJobs: vi.fn().mockImplementation(() => {
        cycles += 1;
        if (cycles === 1) return Promise.reject(new Error("connection lost"));
        controller.abort();
        return Promise.resolve({ requeued: [], failed: [] });
      }),
    });
    const onCycleError = vi.fn();
    await runStaleJobReaper(reaper, {
      signal: controller.signal,
      pollIntervalMs: 1_000,
      onCycleError,
    });
    expect(onCycleError).toHaveBeenCalledTimes(1);
    expect(cycles).toBe(2);
  });

  it("rejects an interval that would sweep the queue too aggressively", async () => {
    const reaper = new StaleJobReaper(repository({ requeued: [], failed: [] }));
    await expect(
      runStaleJobReaper(reaper, {
        signal: new AbortController().signal,
        pollIntervalMs: 100,
      }),
    ).rejects.toThrow(TypeError);
  });

  it("does not let telemetry failures interrupt lease recovery", async () => {
    const reaper = new StaleJobReaper(
      repository({ requeued: [job("a", 1)], failed: [] }),
      {
        telemetry: {
          requeued: () => {
            throw new Error("logger exploded");
          },
          abandoned: () => undefined,
        },
      },
    );
    await expect(reaper.reapOnce()).resolves.toMatchObject({
      requeued: [{ id: "a" }],
    });
  });
});
