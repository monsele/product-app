import { describe, expect, it } from "vitest";
import {
  narrationWordCountRange,
  reconcileSceneDurations,
  reconciledLessonDurationToleranceSeconds,
  sceneAudioFitToleranceMs,
  sceneDurationReconciliationSchema,
  storyboardDurationToleranceSeconds,
  storyboardSceneMaximumSeconds,
  storyboardSceneMinimumSeconds,
} from "./index.js";

const sceneId = "01989a3d-8e00-7000-8000-000000000010";
const otherSceneId = "01989a3d-8e00-7000-8000-000000000011";

function scene(measuredAudioDurationMs: number, durationSeconds = 36) {
  return { stableSceneId: sceneId, durationSeconds, measuredAudioDurationMs };
}

describe("reconcileSceneDurations", () => {
  it("takes the scene duration from the measured audio, rounded to whole seconds", () => {
    expect(reconcileSceneDurations([scene(41_400)])[0]).toMatchObject({
      previousDurationSeconds: 36,
      measuredAudioDurationMs: 41_400,
      appliedDurationSeconds: 41,
      clampReason: null,
      unfittable: false,
    });
  });

  it("leaves at most half a second of residual drift, well inside the tolerance", () => {
    for (let measured = 20_000; measured <= 21_000; measured += 37) {
      const [outcome] = reconcileSceneDurations([scene(measured)]);
      const residual = Math.abs(
        outcome!.appliedDurationSeconds * 1_000 - measured,
      );
      expect(residual).toBeLessThanOrEqual(500);
      expect(residual).toBeLessThan(sceneAudioFitToleranceMs);
    }
  });

  it("is idempotent: reconciling an already-reconciled scene changes nothing", () => {
    const first = reconcileSceneDurations([scene(41_400)])[0]!;
    const second = reconcileSceneDurations([
      scene(41_400, first.appliedDurationSeconds),
    ])[0]!;
    expect(second.appliedDurationSeconds).toBe(first.appliedDurationSeconds);
    expect(second.appliedDurationSeconds).toBe(second.previousDurationSeconds);
  });

  it("clamps to the per-scene minimum and reports why", () => {
    expect(reconcileSceneDurations([scene(900, 5)])[0]).toMatchObject({
      appliedDurationSeconds: storyboardSceneMinimumSeconds,
      clampReason: "scene_minimum",
      // Audio shorter than the floor still fits inside the clamped scene.
      unfittable: false,
    });
  });

  it("clamps to the per-scene maximum and reports audio that cannot fit it", () => {
    expect(reconcileSceneDurations([scene(75_000)])[0]).toMatchObject({
      appliedDurationSeconds: storyboardSceneMaximumSeconds,
      clampReason: "scene_maximum",
      unfittable: true,
    });
  });

  it("does not call audio unfittable while the overrun stays inside the tolerance", () => {
    const withinBand = storyboardSceneMaximumSeconds * 1_000 +
      sceneAudioFitToleranceMs;
    expect(reconcileSceneDurations([scene(withinBand)])[0]).toMatchObject({
      appliedDurationSeconds: storyboardSceneMaximumSeconds,
      clampReason: "scene_maximum",
      unfittable: false,
    });
    expect(
      reconcileSceneDurations([scene(withinBand + 1)])[0],
    ).toMatchObject({ unfittable: true });
  });

  it("is deterministic and order-preserving across scenes", () => {
    const scenes = [
      scene(41_400),
      { ...scene(28_600), stableSceneId: otherSceneId },
    ];
    expect(reconcileSceneDurations(scenes)).toEqual(
      reconcileSceneDurations(scenes),
    );
    expect(
      reconcileSceneDurations(scenes).map((item) => item.stableSceneId),
    ).toEqual([sceneId, otherSceneId]);
  });

  it("produces outcomes that satisfy the persisted contract", () => {
    for (const measured of [900, 41_400, 75_000])
      expect(
        sceneDurationReconciliationSchema.safeParse(
          reconcileSceneDurations([scene(measured)])[0],
        ).success,
      ).toBe(true);
  });

  it("keeps an on-budget lesson inside the reconciled band, whatever the scene shape", () => {
    // Every scene of on-budget narration drifting the full tolerance the same
    // way is the worst case a conforming provider can produce. The lesson total
    // must land inside the band validation allows once scenes are re-timed.
    const check = (sceneCount: number, plannedSeconds: number) => {
      const target = sceneCount * plannedSeconds;
      const scenes = Array.from({ length: sceneCount }, (_, index) => ({
        stableSceneId: `01989a3d-8e00-7000-8000-${String(index + 10).padStart(12, "0")}`,
        durationSeconds: plannedSeconds,
        measuredAudioDurationMs: plannedSeconds * 1_000 + sceneAudioFitToleranceMs,
      }));
      const total = reconcileSceneDurations(scenes).reduce(
        (sum, outcome) => sum + outcome.appliedDurationSeconds,
        0,
      );
      expect(Math.abs(total - target)).toBeLessThanOrEqual(
        reconciledLessonDurationToleranceSeconds(target, sceneCount),
      );
    };
    check(5, 36);
    // Many short scenes: cumulative drift is 2s/scene, far past the flat 5%
    // band that the fixed tolerance would have allowed, which is exactly the
    // gap this scene-count-aware band closes.
    check(24, 10);
    check(50, 5);
  });

  it("scene-count band is never tighter than the storyboard-time band and covers the worst cumulative drift", () => {
    for (const [target, sceneCount] of [
      [180, 5],
      [240, 24],
      [250, 50],
      [3600, 60],
    ] as const) {
      const band = reconciledLessonDurationToleranceSeconds(target, sceneCount);
      expect(band).toBeGreaterThanOrEqual(
        storyboardDurationToleranceSeconds(target),
      );
      expect(band).toBeGreaterThanOrEqual(
        Math.ceil(
          (sceneCount * (sceneAudioFitToleranceMs + 500)) / 1_000,
        ),
      );
    }
  });

  it("keeps the narration word budget reachable at every planned duration", () => {
    // The budget model and the reconciliation arithmetic must agree, or a
    // script written exactly to budget reconciles to a different scene length.
    for (const plannedSeconds of [15, 30, 45, 60]) {
      expect(narrationWordCountRange(plannedSeconds).target).toBeGreaterThan(0);
      expect(
        reconcileSceneDurations([scene(plannedSeconds * 1_000, plannedSeconds)])[0]!
          .appliedDurationSeconds,
      ).toBe(plannedSeconds);
    }
  });
});
