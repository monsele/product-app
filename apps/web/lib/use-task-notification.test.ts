import { describe, expect, it } from "vitest";
import { evaluateTaskStatusTransition } from "./use-task-notification";

describe("evaluateTaskStatusTransition", () => {
  it("marks as active without notifying when status is queued or running", () => {
    const res1 = evaluateTaskStatusTransition("idle", "queued", false);
    expect(res1).toEqual({ action: "none", wasActive: true });

    const res2 = evaluateTaskStatusTransition("queued", "running", true);
    expect(res2).toEqual({ action: "none", wasActive: true });

    const res3 = evaluateTaskStatusTransition("running", "generating", true);
    expect(res3).toEqual({ action: "none", wasActive: true });
  });

  it("triggers success when transitioning from active status to completed or ready", () => {
    const res1 = evaluateTaskStatusTransition("running", "completed", true);
    expect(res1).toEqual({ action: "success", wasActive: false });

    const res2 = evaluateTaskStatusTransition("validating", "ready", true);
    expect(res2).toEqual({ action: "success", wasActive: false });

    const res3 = evaluateTaskStatusTransition("queued", "active", true);
    expect(res3).toEqual({ action: "success", wasActive: false });
  });

  it("triggers error when transitioning from active status to failed or rejected", () => {
    const res1 = evaluateTaskStatusTransition("running", "failed", true);
    expect(res1).toEqual({ action: "error", wasActive: false });

    const res2 = evaluateTaskStatusTransition("validating", "rejected", true);
    expect(res2).toEqual({ action: "error", wasActive: false });

    const res3 = evaluateTaskStatusTransition("generating", "blocked", true);
    expect(res3).toEqual({ action: "error", wasActive: false });
  });

  it("does not trigger notifications if initial status was not active", () => {
    const res1 = evaluateTaskStatusTransition(undefined, "completed", false);
    expect(res1).toEqual({ action: "none", wasActive: false });

    const res2 = evaluateTaskStatusTransition("idle", "idle", false);
    expect(res2).toEqual({ action: "none", wasActive: false });

    const res3 = evaluateTaskStatusTransition("completed", "completed", false);
    expect(res3).toEqual({ action: "none", wasActive: false });
  });
});
