/**
 * ST-095 — state, conservation and determinism.
 *
 * The determinism tests here are the ones that would catch the failure mode
 * this runtime was designed to avoid: a frame whose value depends on which
 * frames were computed before it. They evaluate the same frames forward,
 * backward, shuffled and interleaved between two plans, and require byte-equal
 * results every time.
 */

import { describe, expect, it } from "vitest";
import type { DemonstrationPlan } from "@avlp/schemas/demonstration-proof";
import { toDemonstrationNarrationTrack } from "./narration.js";
import {
  compileDemonstrationPlan,
  evaluateDemonstrationState,
  evaluatePlanAtFrame,
  seededJitter,
} from "./state.js";
import {
  evaporationDemonstrationFixture,
  savingsDemonstrationFixture,
} from "./fixtures.js";
import { validateDemonstrationPlan } from "./validation.js";

const savingsPlans = savingsDemonstrationFixture.scenes.map(
  (scene) => scene.plan,
);
const evaporationPlans = evaporationDemonstrationFixture.scenes.map(
  (scene) => scene.plan,
);
const allPlans = [...savingsPlans, ...evaporationPlans];

/** A deterministic shuffle, so a failure is reproducible. */
function shuffled(values: readonly number[], seed: number): number[] {
  const result = [...values];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const swap = state % (index + 1);
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

function sampleFrames(plan: DemonstrationPlan): number[] {
  const frames = new Set<number>([0, plan.durationInFrames - 1]);
  for (const event of plan.events) {
    frames.add(event.startFrame);
    frames.add(event.startFrame + 1);
    frames.add(event.startFrame + Math.floor(event.durationFrames / 2));
    frames.add(event.startFrame + event.durationFrames - 1);
    frames.add(
      Math.min(plan.durationInFrames - 1, event.startFrame + event.durationFrames),
    );
    frames.add(
      Math.min(
        plan.durationInFrames - 1,
        event.startFrame + event.durationFrames + event.holdFrames,
      ),
    );
  }
  return [...frames].filter(
    (frame) => frame >= 0 && frame < plan.durationInFrames,
  );
}

describe("deterministic evaluation", () => {
  it.each(allPlans.map((plan, index) => [index, plan] as const))(
    "plan %i agrees forward, backward and shuffled",
    (_index, plan) => {
      const compiled = compileDemonstrationPlan(plan);
      const frames = sampleFrames(plan);
      const forward = new Map(
        frames.map((frame) => [
          frame,
          JSON.stringify(evaluateDemonstrationState(compiled, frame)),
        ]),
      );
      for (const frame of [...frames].reverse())
        expect(JSON.stringify(evaluateDemonstrationState(compiled, frame))).toBe(
          forward.get(frame),
        );
      for (const frame of shuffled(frames, 1_234))
        expect(JSON.stringify(evaluateDemonstrationState(compiled, frame))).toBe(
          forward.get(frame),
        );
    },
  );

  it("is unaffected by interleaving two plans, as a render farm would", () => {
    const [first, second] = [savingsPlans[2]!, evaporationPlans[2]!];
    const compiledFirst = compileDemonstrationPlan(first);
    const compiledSecond = compileDemonstrationPlan(second);
    const frames = sampleFrames(first).slice(0, 12);
    const isolated = frames.map((frame) =>
      JSON.stringify(evaluateDemonstrationState(compiledFirst, frame)),
    );
    frames.forEach((frame, index) => {
      evaluateDemonstrationState(compiledSecond, frame % second.durationInFrames);
      expect(JSON.stringify(evaluateDemonstrationState(compiledFirst, frame))).toBe(
        isolated[index],
      );
    });
  });

  it("compiles to the same result whether hoisted or not", () => {
    const plan = savingsPlans[1]!;
    const compiled = compileDemonstrationPlan(plan);
    for (const frame of sampleFrames(plan))
      expect(JSON.stringify(evaluatePlanAtFrame(plan, frame))).toBe(
        JSON.stringify(evaluateDemonstrationState(compiled, frame)),
      );
  });

  it("clamps out-of-range frames rather than producing a new state", () => {
    const plan = savingsPlans[0]!;
    const compiled = compileDemonstrationPlan(plan);
    expect(JSON.stringify(evaluateDemonstrationState(compiled, -50))).toBe(
      JSON.stringify(evaluateDemonstrationState(compiled, 0)),
    );
    expect(
      JSON.stringify(evaluateDemonstrationState(compiled, 10_000)),
    ).toBe(
      JSON.stringify(
        evaluateDemonstrationState(compiled, plan.durationInFrames - 1),
      ),
    );
  });

  it("seeds decorative offsets from the plan, never from the frame", () => {
    const first = seededJitter(42, "note-01", "token");
    expect(seededJitter(42, "note-01", "token")).toEqual(first);
    expect(seededJitter(43, "note-01", "token")).not.toEqual(first);
    expect(seededJitter(42, "note-02", "token")).not.toEqual(first);
    for (const value of [first.x, first.y]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThanOrEqual(1);
    }
  });
});

describe("money conservation", () => {
  it.each(savingsPlans.map((plan, index) => [index, plan] as const))(
    "savings scene %i keeps the total invariant at every sampled frame",
    (_index, plan) => {
      const compiled = compileDemonstrationPlan(plan);
      const expected = evaluateDemonstrationState(compiled, 0).ledger.totalMinor;
      for (let frame = 0; frame < plan.durationInFrames; frame += 3)
        expect(
          evaluateDemonstrationState(compiled, frame).ledger.totalMinor,
        ).toBe(expected);
    },
  );

  it("counts in-transit money once, in neither container", () => {
    const plan = savingsPlans[1]!;
    const compiled = compileDemonstrationPlan(plan);
    const move = plan.events.find((event) => event.action === "transfer")!;
    const midway = evaluateDemonstrationState(
      compiled,
      move.startFrame + Math.floor(move.durationFrames / 2),
    );
    expect(midway.ledger.inTransitMinor).toBeGreaterThan(0);
    const settled = Object.values(midway.ledger.settledByContainer).reduce(
      (sum, value) => sum + value,
      0,
    );
    expect(settled + midway.ledger.inTransitMinor).toBe(
      midway.ledger.totalMinor,
    );
    // The amount in transit is not also sitting in either balance.
    expect(midway.ledger.settledByContainer.income).toBe(800_000);
    expect(midway.ledger.settledByContainer.savings).toBe(0);
  });

  it("attributes in-transit money to the tray it is heading for", () => {
    /**
     * The total alone is not enough to draw with. A recipe showing "arriving"
     * against the wrong tray would state something false about money the
     * learner can watch moving, so the destination breakdown has to add up to
     * the total and name only real containers.
     */
    const plan = savingsPlans[2]!;
    const compiled = compileDemonstrationPlan(plan);
    const containerIds = new Set(
      plan.initialState.objects
        .filter((object) => object.kind === "container")
        .map((object) => object.id),
    );
    let sawTransit = false;
    for (let frame = 0; frame < plan.durationInFrames; frame += 2) {
      const { ledger } = evaluateDemonstrationState(compiled, frame);
      const byDestination = Object.values(ledger.inTransitByDestination).reduce(
        (sum, value) => sum + value,
        0,
      );
      expect(byDestination).toBe(ledger.inTransitMinor);
      for (const containerId of Object.keys(ledger.inTransitByDestination))
        expect(containerIds.has(containerId)).toBe(true);
      if (ledger.inTransitMinor > 0) sawTransit = true;
    }
    expect(sawTransit).toBe(true);
  });

  it("agrees between the visible tokens and the displayed balance", () => {
    for (const plan of savingsPlans) {
      const compiled = compileDemonstrationPlan(plan);
      for (let frame = 0; frame < plan.durationInFrames; frame += 7) {
        const state = evaluateDemonstrationState(compiled, frame);
        for (const [containerId, balance] of Object.entries(
          state.ledger.settledByContainer,
        )) {
          const drawn = state.tokens
            .filter(
              (token) =>
                token.holderId === containerId && token.transit === undefined,
            )
            .reduce((sum, token) => sum + token.amountMinor, 0);
          expect(drawn).toBe(balance);
        }
      }
    }
  });

  it("reaches exactly the declared final totals", () => {
    for (const plan of savingsPlans) {
      const compiled = compileDemonstrationPlan(plan);
      const final = evaluateDemonstrationState(
        compiled,
        plan.durationInFrames - 1,
      );
      for (const expected of plan.expectedFinalState.containerTotals)
        expect(final.ledger.settledByContainer[expected.containerId]).toBe(
          expected.totalMinor,
        );
    }
  });
});

describe("object continuity", () => {
  it("never creates or destroys a token or a particle mid-clip", () => {
    for (const plan of allPlans) {
      const compiled = compileDemonstrationPlan(plan);
      const first = evaluateDemonstrationState(compiled, 0);
      for (let frame = 0; frame < plan.durationInFrames; frame += 5) {
        const state = evaluateDemonstrationState(compiled, frame);
        expect(state.tokens.map((token) => token.id).sort()).toEqual(
          first.tokens.map((token) => token.id).sort(),
        );
        expect(state.particles.map((entry) => entry.id).sort()).toEqual(
          first.particles.map((entry) => entry.id).sort(),
        );
      }
    }
  });

  it("keeps a token in one slot per container for the whole clip", () => {
    const plan = savingsPlans[2]!;
    const compiled = compileDemonstrationPlan(plan);
    const seen = new Map<string, number>();
    for (let frame = 0; frame < plan.durationInFrames; frame += 3)
      for (const token of evaluateDemonstrationState(compiled, frame).tokens) {
        if (token.transit !== undefined) continue;
        const key = `${token.holderId}:${token.id}`;
        const previous = seen.get(key);
        if (previous !== undefined) expect(token.slot).toBe(previous);
        seen.set(key, token.slot);
      }
    expect(seen.size).toBeGreaterThan(0);
  });

  it("keeps every water particle water, whatever its phase", () => {
    for (const plan of evaporationPlans) {
      const compiled = compileDemonstrationPlan(plan);
      for (let frame = 0; frame < plan.durationInFrames; frame += 5)
        for (const particle of evaluateDemonstrationState(compiled, frame)
          .particles)
          expect(particle.substance).toBe("water");
    }
  });

  it("conserves the particle count across the phase change", () => {
    for (const plan of evaporationPlans) {
      const compiled = compileDemonstrationPlan(plan);
      const total = evaluateDemonstrationState(compiled, 0).particles.length;
      const final = evaluateDemonstrationState(
        compiled,
        plan.durationInFrames - 1,
      );
      const byPhase = new Map<string, number>();
      for (const particle of final.particles)
        byPhase.set(particle.phase, (byPhase.get(particle.phase) ?? 0) + 1);
      expect(
        (byPhase.get("liquid") ?? 0) + (byPhase.get("vapour") ?? 0),
      ).toBe(total);
      for (const expected of plan.expectedFinalState.particlePhases)
        expect(byPhase.get(expected.phase) ?? 0).toBe(expected.count);
    }
  });
});

describe("emphasis reaches every object kind", () => {
  /**
   * Regression guard. `emphasise` accepts container and region IDs, and those
   * appear in neither the token nor the particle list, so an event naming one
   * validated cleanly and then drew nothing at all — an authored beat with no
   * visible effect, which is worse than a rejected one.
   */
  it("records emphasis for a container an emphasise event names", () => {
    const plan = savingsPlans[1]!;
    const compiled = compileDemonstrationPlan(plan);
    const event = plan.events.find(
      (entry) => entry.action === "emphasise" && entry.objectIds.includes("savings"),
    );
    expect(event).toBeDefined();
    const state = evaluateDemonstrationState(
      compiled,
      event!.startFrame + Math.floor(event!.durationFrames / 2),
    );
    expect(state.emphasisByObjectId.savings).toBeGreaterThan(0);
    expect(state.emphasisByObjectId.income).toBeGreaterThan(0);
  });

  it("agrees with the emphasis a token carries on its own", () => {
    for (const plan of allPlans) {
      const compiled = compileDemonstrationPlan(plan);
      for (let frame = 0; frame < plan.durationInFrames; frame += 11) {
        const state = evaluateDemonstrationState(compiled, frame);
        for (const token of state.tokens)
          if (token.emphasis > 0)
            expect(state.emphasisByObjectId[token.id]).toBeCloseTo(
              token.emphasis,
              6,
            );
        for (const particle of state.particles)
          if (particle.emphasis > 0)
            expect(state.emphasisByObjectId[particle.id]).toBeCloseTo(
              particle.emphasis,
              6,
            );
      }
    }
  });

  it("falls back to zero for an object no event names", () => {
    const plan = savingsPlans[0]!;
    const state = evaluateDemonstrationState(
      compileDemonstrationPlan(plan),
      0,
    );
    expect(state.emphasisByObjectId["not-an-object"]).toBeUndefined();
  });
});

describe("cause before consequence", () => {
  it("shows a particle dispersing only after it has left the liquid", () => {
    const plan = evaporationPlans[2]!;
    const compiled = compileDemonstrationPlan(plan);
    for (let frame = 0; frame < plan.durationInFrames; frame += 2)
      for (const particle of evaluateDemonstrationState(compiled, frame)
        .particles)
        if (particle.phase === "liquid" && particle.transit === undefined)
          expect(particle.dispersion).toBe(0);
  });

  it("leaves every state-changing event a settled hold before the next one", () => {
    for (const plan of allPlans) {
      const narration = toDemonstrationNarrationTrack([
          ...savingsDemonstrationFixture.narrationTracks,
          ...evaporationDemonstrationFixture.narrationTracks,
        ].find((entry) => entry.sceneId === plan.sceneId)!);
      expect(
        validateDemonstrationPlan(plan, narration).filter(
          (issue) =>
            issue.code === "insufficient_hold" ||
            issue.code === "conflicting_events",
        ),
      ).toEqual([]);
    }
  });
});
