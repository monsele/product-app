/**
 * ST-095 — the deterministic demonstration state runtime.
 *
 * This is the one place that decides what is true at a given frame. Every value
 * it returns is derived from the validated initial state plus the event plan
 * plus the frame index — nothing else. There is no wall-clock time, no
 * unseeded randomness, no mutable counter carried between frames, and no
 * dependence on whether earlier frames have been rendered, so evaluating frame
 * N directly, after a backward scrub, or out of order on a render farm all
 * produce the same answer (CR-04).
 *
 * The division of labour matters: this module owns *meaning* — which container
 * holds what, which particles have left the liquid, how much money is in
 * transit — and the recipe components own *geometry*. State reports a
 * container ID, a stable slot index and a raw 0..1 progress; it never reports a
 * pixel, a path or an easing curve. That is what keeps the renderer in control
 * of layout while a plan stays free of coordinates (CR-01).
 */

import {
  demonstrationFps,
  type DemonstrationEvent,
  type DemonstrationPlan,
} from "@avlp/schemas/demonstration-proof";

// ---------------------------------------------------------------------------
// Seeded, frame-independent jitter
// ---------------------------------------------------------------------------

/**
 * A small deterministic offset per object.
 *
 * Deliberately a function of the plan seed and the object ID only — *not* of
 * the frame. A per-frame value would shimmer, and a value that changed between
 * renders would break frame comparison. Computed once per object, it lets ten
 * tokens settle without looking machine-stamped while staying byte-reproducible
 * (CR-04's "seed/version any permitted decorative randomness").
 */
export function seededJitter(
  seed: number,
  objectId: string,
  salt: string,
): Readonly<{ x: number; y: number }> {
  const hash = (input: string, offset: number): number => {
    let state = (seed + offset) >>> 0;
    for (let index = 0; index < input.length; index++) {
      state = (state ^ input.charCodeAt(index)) >>> 0;
      state = Math.imul(state, 0x01000193) >>> 0;
    }
    state ^= state >>> 15;
    state = Math.imul(state, 0x2545f491) >>> 0;
    state ^= state >>> 13;
    return (state >>> 0) / 4_294_967_296;
  };
  return Object.freeze({
    x: hash(`${objectId}:${salt}:x`, 0x9e3779b9) * 2 - 1,
    y: hash(`${objectId}:${salt}:y`, 0x85ebca6b) * 2 - 1,
  });
}

// ---------------------------------------------------------------------------
// Compiled plan
// ---------------------------------------------------------------------------

/**
 * Stable slot assignment.
 *
 * A token keeps the same slot in a given container for the whole clip, decided
 * once from the plan rather than from "how many tokens are in there now". The
 * alternative — indexing by current occupancy — makes the remaining tokens
 * shuffle sideways every time one leaves, which reads as the objects being
 * replaced rather than moved. Object continuity is an acceptance criterion, so
 * the slot is part of the compiled plan, not a render-time count.
 */
export type DemonstrationSlotMap = Readonly<Record<string, number>>;

export type CompiledDemonstrationPlan = Readonly<{
  plan: DemonstrationPlan;
  /** `${containerId}:${tokenId}` → slot index within that container. */
  tokenSlots: DemonstrationSlotMap;
  /** `${regionId}:${particleId}` → slot index within that region. */
  particleSlots: DemonstrationSlotMap;
  /** Container capacity, i.e. the most tokens it ever needs to lay out. */
  containerCapacity: Readonly<Record<string, number>>;
  /** Region capacity, i.e. the most particles it ever needs to lay out. */
  regionCapacity: Readonly<Record<string, number>>;
  /** Events ordered by start frame, then by ID so ties are deterministic. */
  orderedEvents: readonly DemonstrationEvent[];
}>;

function orderEvents(
  events: readonly DemonstrationEvent[],
): readonly DemonstrationEvent[] {
  return Object.freeze(
    [...events].sort((left, right) =>
      left.startFrame === right.startFrame
        ? left.id.localeCompare(right.id)
        : left.startFrame - right.startFrame,
    ),
  );
}

/**
 * Pure function of the plan. Hoist it out of the frame loop for speed, but
 * calling it per frame would change nothing about the result.
 */
export function compileDemonstrationPlan(
  plan: DemonstrationPlan,
): CompiledDemonstrationPlan {
  const orderedEvents = orderEvents(plan.events);

  // Which containers each token ever occupies, in the order it reaches them.
  const tokenHistory = new Map<string, string[]>();
  for (const object of plan.initialState.objects)
    if (object.kind === "token") tokenHistory.set(object.id, [object.containerId]);

  const particleHistory = new Map<string, string[]>();
  for (const object of plan.initialState.objects)
    if (object.kind === "particle")
      particleHistory.set(object.id, [object.regionId]);

  for (const event of orderedEvents) {
    if (event.action === "transfer" || event.action === "introduce")
      for (const tokenId of event.tokenIds) {
        const history = tokenHistory.get(tokenId);
        if (history !== undefined && history.at(-1) !== event.toContainerId)
          history.push(event.toContainerId);
      }
    if (event.action === "detach")
      for (const particleId of event.particleIds) {
        const history = particleHistory.get(particleId);
        if (history !== undefined && history.at(-1) !== event.toRegionId)
          history.push(event.toRegionId);
      }
  }

  const assign = (
    history: ReadonlyMap<string, readonly string[]>,
    declarationOrder: readonly string[],
  ): Readonly<{
    slots: Record<string, number>;
    capacity: Record<string, number>;
  }> => {
    const slots: Record<string, number> = {};
    const capacity: Record<string, number> = {};
    // Walk the containers in the order tokens first reach them, and within a
    // container in declaration order, so the layout is stable and readable.
    const arrivals = new Map<string, string[]>();
    for (const objectId of declarationOrder)
      for (const holderId of history.get(objectId) ?? []) {
        const list = arrivals.get(holderId) ?? [];
        if (!list.includes(objectId)) list.push(objectId);
        arrivals.set(holderId, list);
      }
    for (const [holderId, members] of arrivals) {
      capacity[holderId] = members.length;
      members.forEach((objectId, index) => {
        slots[`${holderId}:${objectId}`] = index;
      });
    }
    return { slots, capacity };
  };

  const tokens = assign(
    tokenHistory,
    plan.initialState.objects
      .filter((object) => object.kind === "token")
      .map((object) => object.id),
  );
  const particles = assign(
    particleHistory,
    plan.initialState.objects
      .filter((object) => object.kind === "particle")
      .map((object) => object.id),
  );

  return Object.freeze({
    plan,
    tokenSlots: Object.freeze(tokens.slots),
    particleSlots: Object.freeze(particles.slots),
    containerCapacity: Object.freeze(tokens.capacity),
    regionCapacity: Object.freeze(particles.capacity),
    orderedEvents,
  });
}

// ---------------------------------------------------------------------------
// Frame state
// ---------------------------------------------------------------------------

export type DemonstrationTransit = Readonly<{
  fromHolderId: string;
  fromSlot: number;
  toHolderId: string;
  toSlot: number;
  /** Raw 0..1. The recipe applies the easing; state never does. */
  progress: number;
}>;

export type DemonstrationTokenState = Readonly<{
  id: string;
  label: string;
  amountMinor: number;
  unit: string;
  /** The container whose settled balance this token currently counts toward.
   * While in transit it counts toward neither; see `transit`. */
  holderId: string;
  slot: number;
  transit?: DemonstrationTransit | undefined;
  emphasis: number;
  jitter: Readonly<{ x: number; y: number }>;
}>;

export type DemonstrationParticleState = Readonly<{
  id: string;
  label: string;
  substance: "water";
  phase: "liquid" | "vapour";
  holderId: string;
  slot: number;
  dispersion: number;
  transit?: DemonstrationTransit | undefined;
  emphasis: number;
  jitter: Readonly<{ x: number; y: number }>;
}>;

export type DemonstrationNoteState = Readonly<{
  id: string;
  text: string;
  anchorObjectId: string;
  /** 0 until the annotate event begins, 1 once it has fully revealed. */
  reveal: number;
}>;

export type DemonstrationPeriodState = Readonly<{
  id: string;
  label: string;
  periodLabel: string;
  /** 0..1 while the marker is changing, used for a restrained cross-fade. */
  change: number;
}>;

/**
 * The money ledger at a frame.
 *
 * `settledByContainer` is what the readouts display. In-transit money is
 * deliberately in neither container: showing it leave the source before it
 * arrives is the honest depiction, and attributing it to the destination early
 * would show a balance the learner has no reason to believe yet. Because it is
 * tracked explicitly in `inTransitMinor`, it is neither double-counted nor
 * lost, and `totalMinor` stays invariant across the whole clip.
 */
export type DemonstrationLedger = Readonly<{
  settledByContainer: Readonly<Record<string, number>>;
  inTransitMinor: number;
  /**
   * In-transit money keyed by where it is heading.
   *
   * The total alone is not enough to draw with: a recipe that showed "arriving"
   * against the wrong tray would be stating something false about money the
   * learner can see moving. Keyed by destination, the label can only appear on
   * the container the notes are actually going to.
   */
  inTransitByDestination: Readonly<Record<string, number>>;
  /** settled across every container + in transit. Constant by construction. */
  totalMinor: number;
}>;

export type DemonstrationFrameState = Readonly<{
  frame: number;
  tokens: readonly DemonstrationTokenState[];
  particles: readonly DemonstrationParticleState[];
  notes: readonly DemonstrationNoteState[];
  periods: readonly DemonstrationPeriodState[];
  ledger: DemonstrationLedger;
  /**
   * Attention weight 0..1 per object ID, for **every** object kind.
   *
   * Tokens and particles carry their own `emphasis`, but an `emphasise` event
   * may name a container or a region, and those are not in either list. Without
   * this map such an event validated and then drew nothing — an authored beat
   * with no visible effect, which is worse than a rejected one.
   */
  emphasisByObjectId: Readonly<Record<string, number>>;
  /** IDs of events currently animating, for the recipe's focal treatment. */
  activeEventIds: readonly string[];
  /** The single principal object set the frame is about, if any. */
  focusObjectIds: readonly string[];
}>;

type MutableToken = {
  id: string;
  label: string;
  amountMinor: number;
  unit: string;
  holderId: string;
  transit?: DemonstrationTransit | undefined;
  emphasis: number;
};

type MutableParticle = {
  id: string;
  label: string;
  phase: "liquid" | "vapour";
  holderId: string;
  dispersion: number;
  transit?: DemonstrationTransit | undefined;
  emphasis: number;
};

/** Raw linear progress of an event at a frame, clamped to 0..1. */
function eventProgress(event: DemonstrationEvent, frame: number): number {
  if (frame <= event.startFrame) return 0;
  if (frame >= event.startFrame + event.durationFrames) return 1;
  return (frame - event.startFrame) / event.durationFrames;
}

/**
 * Attention weight for an event at a frame: full while it animates, then
 * decaying across its hold so the resulting state stays legible without the
 * emphasis snapping off the instant the movement stops.
 */
function eventEmphasis(event: DemonstrationEvent, frame: number): number {
  const end = event.startFrame + event.durationFrames;
  if (frame < event.startFrame) return 0;
  if (frame < end) return 1;
  if (event.holdFrames === 0) return 0;
  const intoHold = (frame - end) / event.holdFrames;
  return intoHold >= 1 ? 0 : 1 - intoHold;
}

/**
 * The state of every object at `frame`.
 *
 * Note the shape of the loop: it starts from the initial state every time and
 * replays the events whose windows have opened. It does not accumulate into a
 * cache keyed by frame, and it never reads a previously computed frame. That is
 * what makes a backward seek and an out-of-order render agree, and it is cheap
 * enough to do per frame for the plan sizes this contract allows (at most 60
 * events).
 */
export function evaluateDemonstrationState(
  compiled: CompiledDemonstrationPlan,
  frame: number,
): DemonstrationFrameState {
  const { plan, tokenSlots, particleSlots, orderedEvents } = compiled;
  const current = Math.max(
    0,
    Math.min(Math.floor(frame), plan.durationInFrames - 1),
  );

  const tokens = new Map<string, MutableToken>();
  const particles = new Map<string, MutableParticle>();
  const noteReveal = new Map<string, number>();
  const periods = new Map<string, { label: string; periodLabel: string; change: number }>();

  for (const object of plan.initialState.objects) {
    if (object.kind === "token")
      tokens.set(object.id, {
        id: object.id,
        label: object.label,
        amountMinor: object.amountMinor,
        unit: object.unit,
        holderId: object.containerId,
        emphasis: 0,
      });
    if (object.kind === "particle")
      particles.set(object.id, {
        id: object.id,
        label: object.label,
        phase: object.phase,
        holderId: object.regionId,
        dispersion: object.dispersion,
        emphasis: 0,
      });
    if (object.kind === "note") noteReveal.set(object.id, 0);
    if (object.kind === "period-marker")
      periods.set(object.id, {
        label: object.label,
        periodLabel: object.periodLabel,
        change: 0,
      });
  }

  const activeEventIds: string[] = [];
  const focusObjectIds: string[] = [];
  const emphasisById = new Map<string, number>();
  const raiseEmphasis = (objectId: string, value: number): void => {
    emphasisById.set(objectId, Math.max(emphasisById.get(objectId) ?? 0, value));
  };

  for (const event of orderedEvents) {
    if (current < event.startFrame) continue;
    const progress = eventProgress(event, current);
    const emphasis = eventEmphasis(event, current);
    const animating = progress > 0 && progress < 1;
    if (animating) activeEventIds.push(event.id);

    switch (event.action) {
      case "transfer":
      case "introduce": {
        const from =
          event.action === "transfer"
            ? event.fromContainerId
            : event.fromOriginId;
        for (const tokenId of event.tokenIds) {
          const token = tokens.get(tokenId);
          if (token === undefined) continue;
          token.emphasis = Math.max(token.emphasis, emphasis);
          raiseEmphasis(tokenId, emphasis);
          if (progress >= 1) {
            token.holderId = event.toContainerId;
            token.transit = undefined;
          } else {
            // Mid-transfer: attributed to neither container. `holderId` stays
            // at the source so the source's tokens are still drawn there until
            // the move begins, and the ledger reads `transit` to decide.
            token.holderId = from;
            token.transit = Object.freeze({
              fromHolderId: from,
              fromSlot: tokenSlots[`${from}:${tokenId}`] ?? 0,
              toHolderId: event.toContainerId,
              toSlot: tokenSlots[`${event.toContainerId}:${tokenId}`] ?? 0,
              progress,
            });
          }
          if (emphasis > 0) focusObjectIds.push(tokenId);
        }
        break;
      }
      case "detach": {
        for (const particleId of event.particleIds) {
          const particle = particles.get(particleId);
          if (particle === undefined) continue;
          particle.emphasis = Math.max(particle.emphasis, emphasis);
          raiseEmphasis(particleId, emphasis);
          if (progress >= 1) {
            particle.holderId = event.toRegionId;
            particle.phase = "vapour";
            particle.transit = undefined;
          } else {
            particle.holderId = event.fromRegionId;
            // The phase flips only once the particle has actually left, so a
            // half-detached particle is still drawn as liquid-bound.
            particle.transit = Object.freeze({
              fromHolderId: event.fromRegionId,
              fromSlot: particleSlots[`${event.fromRegionId}:${particleId}`] ?? 0,
              toHolderId: event.toRegionId,
              toSlot: particleSlots[`${event.toRegionId}:${particleId}`] ?? 0,
              progress,
            });
          }
          if (emphasis > 0) focusObjectIds.push(particleId);
        }
        break;
      }
      case "disperse": {
        for (const particleId of event.particleIds) {
          const particle = particles.get(particleId);
          if (particle === undefined) continue;
          particle.emphasis = Math.max(particle.emphasis, emphasis);
          raiseEmphasis(particleId, emphasis);
          // Interpolating the dispersion level itself keeps the spread
          // continuous rather than stepping at the end of the event.
          particle.dispersion =
            particle.dispersion + (event.toDispersion - particle.dispersion) * progress;
          if (emphasis > 0) focusObjectIds.push(particleId);
        }
        break;
      }
      case "advance-period": {
        const marker = periods.get(event.markerId);
        if (marker === undefined) break;
        marker.change = progress < 1 ? progress : 0;
        raiseEmphasis(event.markerId, emphasis);
        if (progress >= 0.5) marker.periodLabel = event.toPeriodLabel;
        if (emphasis > 0) focusObjectIds.push(event.markerId);
        break;
      }
      case "emphasise": {
        for (const objectId of event.objectIds) {
          const token = tokens.get(objectId);
          if (token !== undefined) token.emphasis = Math.max(token.emphasis, emphasis);
          const particle = particles.get(objectId);
          if (particle !== undefined)
            particle.emphasis = Math.max(particle.emphasis, emphasis);
          // Recorded for every object ID, including containers and regions,
          // which have no entry in the token or particle lists.
          raiseEmphasis(objectId, emphasis);
          if (emphasis > 0) focusObjectIds.push(objectId);
        }
        break;
      }
      case "annotate": {
        noteReveal.set(event.noteId, progress);
        break;
      }
      default:
        break;
    }
  }

  // The ledger, read off the same token states the recipe draws. There is no
  // second source of truth for a balance.
  const settled: Record<string, number> = {};
  for (const object of plan.initialState.objects)
    if (object.kind === "container") settled[object.id] = 0;
  let inTransitMinor = 0;
  const inTransitByDestination: Record<string, number> = {};
  for (const token of tokens.values())
    if (token.transit === undefined)
      settled[token.holderId] = (settled[token.holderId] ?? 0) + token.amountMinor;
    else {
      inTransitMinor += token.amountMinor;
      const destination = token.transit.toHolderId;
      inTransitByDestination[destination] =
        (inTransitByDestination[destination] ?? 0) + token.amountMinor;
    }

  const totalMinor =
    Object.values(settled).reduce((sum, value) => sum + value, 0) + inTransitMinor;

  const noteStates = plan.initialState.objects
    .filter((object) => object.kind === "note")
    .map((object) =>
      Object.freeze({
        id: object.id,
        text: object.text,
        anchorObjectId: object.anchorObjectId,
        reveal: noteReveal.get(object.id) ?? 0,
      }),
    );

  return Object.freeze({
    frame: current,
    tokens: Object.freeze(
      [...tokens.values()].map((token) =>
        Object.freeze({
          ...token,
          slot: tokenSlots[`${token.holderId}:${token.id}`] ?? 0,
          jitter: seededJitter(plan.seed, token.id, "token"),
        }),
      ),
    ),
    particles: Object.freeze(
      [...particles.values()].map((particle) =>
        Object.freeze({
          ...particle,
          substance: "water" as const,
          slot: particleSlots[`${particle.holderId}:${particle.id}`] ?? 0,
          jitter: seededJitter(plan.seed, particle.id, "particle"),
        }),
      ),
    ),
    notes: Object.freeze(noteStates),
    periods: Object.freeze(
      [...periods.entries()].map(([id, value]) =>
        Object.freeze({
          id,
          label: value.label,
          periodLabel: value.periodLabel,
          change: value.change,
        }),
      ),
    ),
    ledger: Object.freeze({
      settledByContainer: Object.freeze(settled),
      inTransitMinor,
      inTransitByDestination: Object.freeze(inTransitByDestination),
      totalMinor,
    }),
    emphasisByObjectId: Object.freeze(Object.fromEntries(emphasisById)),
    activeEventIds: Object.freeze(activeEventIds),
    focusObjectIds: Object.freeze([...new Set(focusObjectIds)]),
  });
}

/** Convenience wrapper; compiles per call, so hoist `compileDemonstrationPlan`
 * when evaluating many frames. */
export function evaluatePlanAtFrame(
  plan: DemonstrationPlan,
  frame: number,
): DemonstrationFrameState {
  return evaluateDemonstrationState(compileDemonstrationPlan(plan), frame);
}

export function demonstrationSecondsToFrames(durationSeconds: number): number {
  return Math.max(1, Math.round(durationSeconds * demonstrationFps));
}
