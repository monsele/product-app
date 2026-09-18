/**
 * ST-095 — bounded demonstration-led animation contract.
 *
 * This module is deliberately **not** re-exported from `@avlp/schemas`'s main
 * entry point. It is reachable only at `@avlp/schemas/demonstration-proof`, so
 * no production validation path (`lessonSpecSchema`, `sceneSpecSchema`,
 * `lessonConfigurationSchema`) can widen to accept a demonstration plan and no
 * new selectable mode appears in production configuration.
 *
 * Scope boundary, per the story's "Dependencies and Boundary" section and
 * ADR-006 (Proposed): these schemas describe a development proof runtime and
 * its immutable fixture manifest. They are not a persisted lesson contract and
 * carry no `schemaVersion` from the LessonSpec series. ST-096 owns the
 * production migration.
 *
 * What this contract is *for*: the AI, or any other caller, may choose a
 * registered recipe and supply semantic parameters — which object moves, from
 * which container to which container, how much, anchored to which narration
 * beat. It may never supply a pixel coordinate, an easing curve, a path, a
 * duration that contradicts measured audio, JSX, CSS, or an executable
 * expression. The renderer owns every one of those.
 *
 * CR references (docs/controlled-rendering-versioning-contract.md):
 * - CR-01: only registered recipe IDs and allowlisted actions cross this
 *   boundary; the plan stores resolved frames so rendering reruns no selection.
 * - CR-02: `demonstrationManifestSchema` carries the resolved content, plan,
 *   timing, media, font, implementation and output-profile identity.
 * - CR-04: every field a frame depends on is in the validated plan; there is
 *   no field whose meaning depends on playback history.
 * - CR-05: `holdFrames` is a declared per-event inspection requirement that
 *   validation enforces, so motion can never eat reading time.
 * - CR-06: `canonicalDemonstrationJson` is the one canonical serialisation
 *   used for every demonstration input hash.
 */

import { identifierSchema } from "@avlp/config/identifiers";
import { z } from "zod";

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

/** A stable, human-readable ID for an object, event, beat or region. */
const slugSchema = boundedText(64).regex(
  /^[a-z][a-z0-9-]*$/,
  "Identifiers are lower-case slugs.",
);

/** Bumped whenever an authored recipe's rendered output could change. */
export const demonstrationRecipeVersion = "1.0.0" as const;

/**
 * Bumped whenever the *interpretation* of a stored plan could change — a new
 * action, a changed state-evaluation rule, a changed validation outcome. A
 * plan records the version that produced it so an old plan is never silently
 * reinterpreted by newer runtime semantics (CR-03).
 */
export const demonstrationPlanVersion = "1.0.0" as const;

/** Identifies this proof's hashing policy (CR-06). */
export const demonstrationHashPolicy =
  "st-095-canonical-json-sha256-v1" as const;

/** Frames per second. Fixed to the `mvp-default` canvas; not an input. */
export const demonstrationFps = 30 as const;

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export const demonstrationRecipeIdValues = [
  "savings.transfer-accumulate",
  "evaporation.surface-to-vapour",
] as const;
export const demonstrationRecipeIdSchema = z.enum(demonstrationRecipeIdValues);
export type DemonstrationRecipeId = z.infer<
  typeof demonstrationRecipeIdSchema
>;

export const demonstrationRecipeRefSchema = z
  .object({
    id: demonstrationRecipeIdSchema,
    version: z.literal(demonstrationRecipeVersion),
  })
  .strict();
export type DemonstrationRecipeRef = z.infer<
  typeof demonstrationRecipeRefSchema
>;

// ---------------------------------------------------------------------------
// Object model
// ---------------------------------------------------------------------------

/**
 * Currency is carried in **minor units as an integer**. A float would make
 * conservation arithmetic approximate, and "the balances agree throughout" is
 * the whole point of the savings recipe, so the contract refuses to express an
 * amount in a way that could drift.
 */
export const minorAmountSchema = z
  .number()
  .int("Amounts are integer minor units, never fractional.")
  .positive("An amount must be positive.")
  .max(1_000_000_000);

export const demonstrationUnitValues = ["NGN-minor"] as const;
export const demonstrationUnitSchema = z.enum(demonstrationUnitValues);
export type DemonstrationUnit = z.infer<typeof demonstrationUnitSchema>;

export const demonstrationPhaseValues = ["liquid", "vapour"] as const;
export const demonstrationPhaseSchema = z.enum(demonstrationPhaseValues);
export type DemonstrationPhase = z.infer<typeof demonstrationPhaseSchema>;

export const demonstrationContainerRoleValues = [
  "source",
  "destination",
  "origin",
] as const;
export const demonstrationContainerRoleSchema = z.enum(
  demonstrationContainerRoleValues,
);
export type DemonstrationContainerRole = z.infer<
  typeof demonstrationContainerRoleSchema
>;

export const demonstrationRegionRoleValues = [
  "liquid-body",
  "vapour-space",
  "magnified-view",
] as const;
export const demonstrationRegionRoleSchema = z.enum(
  demonstrationRegionRoleValues,
);
export type DemonstrationRegionRole = z.infer<
  typeof demonstrationRegionRoleSchema
>;

const objectBase = {
  id: slugSchema,
  label: boundedText(60),
} as const;

/**
 * A container holds tokens. `role: "origin"` names a place money genuinely
 * comes from — a wage, a sale — so an `introduce` event can never make funds
 * appear from nowhere: it must name the origin it came out of.
 */
export const demonstrationContainerSchema = z
  .object({
    ...objectBase,
    kind: z.literal("container"),
    role: demonstrationContainerRoleSchema,
  })
  .strict();
export type DemonstrationContainer = z.infer<
  typeof demonstrationContainerSchema
>;

export const demonstrationTokenSchema = z
  .object({
    ...objectBase,
    kind: z.literal("token"),
    amountMinor: minorAmountSchema,
    unit: demonstrationUnitSchema,
    /** The container the token starts in. Identity is preserved through every
     * later transfer: a token is never destroyed and re-created. */
    containerId: slugSchema,
  })
  .strict();
export type DemonstrationToken = z.infer<typeof demonstrationTokenSchema>;

/**
 * A readout displays a container's balance. It has no independent value: the
 * number it shows is derived from the same evaluated ledger that positions the
 * tokens, which is what makes "displayed balances agree with token movement"
 * structurally true rather than something an author has to remember.
 */
export const demonstrationReadoutSchema = z
  .object({
    ...objectBase,
    kind: z.literal("readout"),
    containerId: slugSchema,
    /** `goal` additionally draws progress toward `goalMinor`. */
    display: z.enum(["balance", "goal"]),
    goalMinor: minorAmountSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.display === "goal" && value.goalMinor === undefined)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["goalMinor"],
        message: "A goal readout must state the goal it measures against.",
      });
    if (value.display === "balance" && value.goalMinor !== undefined)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["goalMinor"],
        message: "A balance readout has no goal; use display: \"goal\".",
      });
  });
export type DemonstrationReadout = z.infer<typeof demonstrationReadoutSchema>;

export const demonstrationPeriodMarkerSchema = z
  .object({
    ...objectBase,
    kind: z.literal("period-marker"),
    /** The period the marker starts on, e.g. "Week 1". */
    periodLabel: boundedText(32),
  })
  .strict();
export type DemonstrationPeriodMarker = z.infer<
  typeof demonstrationPeriodMarkerSchema
>;

export const demonstrationRegionSchema = z
  .object({
    ...objectBase,
    kind: z.literal("region"),
    role: demonstrationRegionRoleSchema,
  })
  .strict();
export type DemonstrationRegion = z.infer<typeof demonstrationRegionSchema>;

/**
 * A particle of the substance under study. `substance` is carried explicitly
 * and no action may change it: the evaporation recipe must show water
 * *changing phase*, never water becoming something else or ceasing to exist.
 */
export const demonstrationParticleSchema = z
  .object({
    ...objectBase,
    kind: z.literal("particle"),
    substance: z.literal("water"),
    phase: demonstrationPhaseSchema,
    regionId: slugSchema,
    /** 0 = tightly packed, 3 = widely dispersed. */
    dispersion: z.number().int().min(0).max(3),
  })
  .strict();
export type DemonstrationParticle = z.infer<typeof demonstrationParticleSchema>;

/** A bounded authored caveat or explanation anchored to an object. */
export const demonstrationNoteSchema = z
  .object({
    ...objectBase,
    kind: z.literal("note"),
    text: boundedText(240),
    anchorObjectId: slugSchema,
  })
  .strict();
export type DemonstrationNote = z.infer<typeof demonstrationNoteSchema>;

export const demonstrationObjectSchema = z.discriminatedUnion("kind", [
  demonstrationContainerSchema,
  demonstrationTokenSchema,
  demonstrationPeriodMarkerSchema,
  demonstrationRegionSchema,
  demonstrationParticleSchema,
  demonstrationNoteSchema,
  // `demonstrationReadoutSchema` carries a superRefine, so it cannot join a
  // discriminated union directly; it is validated alongside, below.
]);
export type DemonstrationObject =
  | z.infer<typeof demonstrationObjectSchema>
  | DemonstrationReadout;

/**
 * The full initial state. Readouts are a separate array rather than another
 * union member purely because Zod cannot discriminate a refined object; the
 * distinction is mechanical, not semantic.
 */
export const demonstrationInitialStateSchema = z
  .object({
    objects: z.array(demonstrationObjectSchema).min(1).max(120),
    readouts: z.array(demonstrationReadoutSchema).max(8).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    const all: readonly { id: string }[] = [...value.objects, ...value.readouts];
    for (const [index, object] of all.entries())
      if (seen.has(object.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index < value.objects.length ? "objects" : "readouts", index],
          message: `Duplicate object ID ${object.id}. Object identity must be unique and stable.`,
        });
      else seen.add(object.id);

    const containerIds = new Set(
      value.objects
        .filter((object) => object.kind === "container")
        .map((object) => object.id),
    );
    const regionIds = new Set(
      value.objects
        .filter((object) => object.kind === "region")
        .map((object) => object.id),
    );
    for (const [index, object] of value.objects.entries()) {
      if (object.kind === "token" && !containerIds.has(object.containerId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["objects", index, "containerId"],
          message: `Token ${object.id} starts in unknown container ${object.containerId}.`,
        });
      if (object.kind === "particle" && !regionIds.has(object.regionId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["objects", index, "regionId"],
          message: `Particle ${object.id} starts in unknown region ${object.regionId}.`,
        });
      if (object.kind === "note" && !seen.has(object.anchorObjectId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["objects", index, "anchorObjectId"],
          message: `Note ${object.id} anchors to unknown object ${object.anchorObjectId}.`,
        });
    }
    for (const [index, readout] of value.readouts.entries())
      if (!containerIds.has(readout.containerId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["readouts", index, "containerId"],
          message: `Readout ${readout.id} reads unknown container ${readout.containerId}.`,
        });
  });
export type DemonstrationInitialState = z.infer<
  typeof demonstrationInitialStateSchema
>;

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const demonstrationActionValues = [
  /** Move existing tokens between two containers already on screen. */
  "transfer",
  /** Bring tokens in from a named origin container — a wage, a sale. */
  "introduce",
  /** Advance the period marker, identifying the passage of time. */
  "advance-period",
  /** A particle leaves the liquid body for the vapour space. */
  "detach",
  /** Vapour particles spread further apart without changing substance. */
  "disperse",
  /** Draw attention to objects without changing any state. */
  "emphasise",
  /** Reveal an authored note, e.g. the model's simplification. */
  "annotate",
] as const;
export const demonstrationActionSchema = z.enum(demonstrationActionValues);
export type DemonstrationAction = z.infer<typeof demonstrationActionSchema>;

const eventBase = {
  id: slugSchema,
  /** The narration beat this event is anchored to. Resolved frames below are
   * derived from the beat's measured timing, and revalidated against it. */
  beatId: slugSchema,
  startFrame: z.number().int().nonnegative().max(100_000),
  durationFrames: z.number().int().min(1).max(600),
  /**
   * Settled frames required *after* the event completes, before anything else
   * may touch the same objects. This is instructional inspection time, and
   * validation refuses a plan that cannot afford it (CR-05).
   */
  holdFrames: z.number().int().nonnegative().max(600),
} as const;

export const demonstrationTransferEventSchema = z
  .object({
    ...eventBase,
    action: z.literal("transfer"),
    tokenIds: z.array(slugSchema).min(1).max(20),
    fromContainerId: slugSchema,
    toContainerId: slugSchema,
  })
  .strict();

export const demonstrationIntroduceEventSchema = z
  .object({
    ...eventBase,
    action: z.literal("introduce"),
    tokenIds: z.array(slugSchema).min(1).max(20),
    /** The `origin`-role container the money genuinely comes out of. */
    fromOriginId: slugSchema,
    toContainerId: slugSchema,
    /** Named for the learner, e.g. "Week 2 wages". Never "new money". */
    originLabel: boundedText(60),
  })
  .strict();

export const demonstrationAdvancePeriodEventSchema = z
  .object({
    ...eventBase,
    action: z.literal("advance-period"),
    markerId: slugSchema,
    toPeriodLabel: boundedText(32),
  })
  .strict();

export const demonstrationDetachEventSchema = z
  .object({
    ...eventBase,
    action: z.literal("detach"),
    particleIds: z.array(slugSchema).min(1).max(40),
    fromRegionId: slugSchema,
    toRegionId: slugSchema,
  })
  .strict();

export const demonstrationDisperseEventSchema = z
  .object({
    ...eventBase,
    action: z.literal("disperse"),
    particleIds: z.array(slugSchema).min(1).max(40),
    /** The dispersion level the particles end at. Must exceed their current
     * level: "disperse" that tightens packing is an impossible transition. */
    toDispersion: z.number().int().min(1).max(3),
  })
  .strict();

export const demonstrationEmphasiseEventSchema = z
  .object({
    ...eventBase,
    action: z.literal("emphasise"),
    objectIds: z.array(slugSchema).min(1).max(20),
  })
  .strict();

export const demonstrationAnnotateEventSchema = z
  .object({
    ...eventBase,
    action: z.literal("annotate"),
    noteId: slugSchema,
  })
  .strict();

export const demonstrationEventSchema = z.discriminatedUnion("action", [
  demonstrationTransferEventSchema,
  demonstrationIntroduceEventSchema,
  demonstrationAdvancePeriodEventSchema,
  demonstrationDetachEventSchema,
  demonstrationDisperseEventSchema,
  demonstrationEmphasiseEventSchema,
  demonstrationAnnotateEventSchema,
]);
export type DemonstrationEvent = z.infer<typeof demonstrationEventSchema>;

// ---------------------------------------------------------------------------
// Narration beats and measured timing
// ---------------------------------------------------------------------------

/**
 * One phrase of narration with its **measured** position in the scene's audio.
 *
 * `startMs`/`endMs` are not estimates. Every fixture's audio is assembled from
 * per-phrase renders, so a beat's boundaries are the cumulative sample counts
 * of the phrases before it — exact by construction. `provenance` records how a
 * given track was produced so this claim is checkable rather than asserted;
 * see `demonstrationTimingProvenanceSchema`.
 */
export const demonstrationBeatSchema = z
  .object({
    beatId: slugSchema,
    text: boundedText(400),
    startMs: z.number().int().nonnegative().max(600_000),
    endMs: z.number().int().positive().max(600_000),
  })
  .strict()
  .superRefine((beat, context) => {
    if (beat.endMs <= beat.startMs)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endMs"],
        message: "A beat must end after it starts.",
      });
  });
export type DemonstrationBeat = z.infer<typeof demonstrationBeatSchema>;

export const demonstrationTimingMethodValues = [
  /** Each phrase rendered separately; boundaries are measured PCM lengths. */
  "measured-phrase-boundaries",
  /** A human aligned the phrases against the waveform and recorded the result. */
  "manual-waveform-alignment",
] as const;
export const demonstrationTimingMethodSchema = z.enum(
  demonstrationTimingMethodValues,
);
export type DemonstrationTimingMethod = z.infer<
  typeof demonstrationTimingMethodSchema
>;

/**
 * Timing provenance is a required field, not an optional note.
 *
 * The story forbids reporting a character-count estimate as accurate
 * alignment, and the only durable way to enforce that is to make every track
 * state, in the validated contract, how its numbers were obtained. There is no
 * enum member for an estimate, so an estimated track cannot be expressed here
 * at all.
 */
export const demonstrationTimingProvenanceSchema = z
  .object({
    method: demonstrationTimingMethodSchema,
    /** The tool that produced the audio, e.g. the local synthesizer and voice. */
    tool: boundedText(160),
    reviewedBy: boundedText(120),
    reviewedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: boundedText(600),
  })
  .strict();
export type DemonstrationTimingProvenance = z.infer<
  typeof demonstrationTimingProvenanceSchema
>;

/**
 * One prepared local narration track per scene, shared byte-identically by the
 * demonstration and the standard approach. Measured duration remains the
 * timing authority (ADR-004): nothing here may shorten or accelerate it.
 */
export const demonstrationNarrationTrackSchema = z
  .object({
    sceneId: identifierSchema,
    durationMs: z.number().int().positive().max(600_000),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    src: z
      .string()
      .min(1)
      .max(80_000_000)
      .regex(
        /^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/,
        "Proof narration must be a bundled base64 WAV data URI.",
      ),
    beats: z.array(demonstrationBeatSchema).min(1).max(60),
    timingProvenance: demonstrationTimingProvenanceSchema,
  })
  .strict()
  .superRefine((track, context) => {
    const seen = new Set<string>();
    let previousEnd = -1;
    for (const [index, beat] of track.beats.entries()) {
      if (seen.has(beat.beatId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["beats", index, "beatId"],
          message: `Duplicate beat ID ${beat.beatId}.`,
        });
      seen.add(beat.beatId);
      if (beat.startMs < previousEnd)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["beats", index, "startMs"],
          message: "Beats must be ordered and must not overlap.",
        });
      previousEnd = beat.endMs;
      if (beat.endMs > track.durationMs)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["beats", index, "endMs"],
          message: `Beat ${beat.beatId} ends after the measured audio does.`,
        });
    }
  });
export type DemonstrationNarrationTrack = z.infer<
  typeof demonstrationNarrationTrackSchema
>;

// ---------------------------------------------------------------------------
// The event plan
// ---------------------------------------------------------------------------

/**
 * The author's declared end state, checked by simulation.
 *
 * Without this the runtime would faithfully animate an arithmetic mistake. The
 * validator replays the whole plan and refuses it when the result disagrees,
 * so a savings clip cannot ship showing a balance the transfers do not
 * actually produce.
 */
export const demonstrationExpectedFinalStateSchema = z
  .object({
    containerTotals: z
      .array(
        z
          .object({
            containerId: slugSchema,
            totalMinor: z.number().int().nonnegative().max(1_000_000_000),
          })
          .strict(),
      )
      .max(12)
      .default([]),
    particlePhases: z
      .array(
        z
          .object({
            phase: demonstrationPhaseSchema,
            count: z.number().int().nonnegative().max(200),
          })
          .strict(),
      )
      .max(4)
      .default([]),
  })
  .strict();
export type DemonstrationExpectedFinalState = z.infer<
  typeof demonstrationExpectedFinalStateSchema
>;

/**
 * An immutable, fully resolved demonstration plan for one scene.
 *
 * Everything a frame depends on is here. `seed` covers the only randomness the
 * recipes permit — small settling offsets — and is part of the hashed identity,
 * so a re-render reproduces the same arrangement (CR-04).
 */
export const demonstrationPlanSchema = z
  .object({
    planVersion: z.literal(demonstrationPlanVersion),
    recipe: demonstrationRecipeRefSchema,
    sceneId: identifierSchema,
    durationInFrames: z.number().int().positive().max(100_000),
    seed: z.number().int().nonnegative().max(2_147_483_647),
    initialState: demonstrationInitialStateSchema,
    events: z.array(demonstrationEventSchema).min(1).max(60),
    expectedFinalState: demonstrationExpectedFinalStateSchema,
    /**
     * Binds this plan to the exact audio and beats it was built against.
     * A changed recording changes the checksum, and the plan is then stale —
     * an actionable validation failure, never a silent re-anchor.
     */
    narrationBinding: z
      .object({
        audioChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
        beatIds: z.array(slugSchema).min(1).max(60),
      })
      .strict(),
  })
  .strict()
  /**
   * Structural checks only.
   *
   * Zod cannot refine a member of a discriminated union, so the per-action
   * invariants that would naturally live on each event schema are enforced
   * here. The deeper semantic checks — source availability, conflicting events,
   * impossible transitions, final-state agreement, beat drift — need a full
   * replay of the plan and live in the scene library's validator, where they
   * can report a structured issue code and a correction rather than a Zod
   * message.
   */
  .superRefine((plan, context) => {
    const eventIds = new Set<string>();
    for (const [index, event] of plan.events.entries()) {
      if (eventIds.has(event.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["events", index, "id"],
          message: `Duplicate event ID ${event.id}.`,
        });
      eventIds.add(event.id);

      const endFrame = event.startFrame + event.durationFrames + event.holdFrames;
      if (endFrame > plan.durationInFrames)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["events", index, "startFrame"],
          message: `Event ${event.id} needs frames up to ${endFrame} including its hold, but the scene ends at ${plan.durationInFrames}. Narration length sets the bound; the event must change, not the narration.`,
        });

      if (!plan.narrationBinding.beatIds.includes(event.beatId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["events", index, "beatId"],
          message: `Event ${event.id} is anchored to beat ${event.beatId}, which this plan is not bound to.`,
        });

      switch (event.action) {
        case "transfer":
          if (event.fromContainerId === event.toContainerId)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["events", index, "toContainerId"],
              message:
                "A transfer must move tokens between two different containers.",
            });
          if (new Set(event.tokenIds).size !== event.tokenIds.length)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["events", index, "tokenIds"],
              message: "A token may be listed once in a transfer.",
            });
          break;
        case "introduce":
          if (new Set(event.tokenIds).size !== event.tokenIds.length)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["events", index, "tokenIds"],
              message: "A token may be listed once in an introduction.",
            });
          break;
        case "detach":
          if (event.fromRegionId === event.toRegionId)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["events", index, "toRegionId"],
              message:
                "A detach must move particles between two different regions.",
            });
          if (new Set(event.particleIds).size !== event.particleIds.length)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["events", index, "particleIds"],
              message: "A particle may be listed once in a detach.",
            });
          break;
        case "disperse":
          if (new Set(event.particleIds).size !== event.particleIds.length)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["events", index, "particleIds"],
              message: "A particle may be listed once in a dispersal.",
            });
          break;
        default:
          break;
      }
    }
  });
export type DemonstrationPlan = z.infer<typeof demonstrationPlanSchema>;

// ---------------------------------------------------------------------------
// Composition input
// ---------------------------------------------------------------------------

export const demonstrationAssetSchema = z
  .object({
    assetId: slugSchema,
    altText: boundedText(2_000),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    height: z.number().int().positive().max(8_640),
    width: z.number().int().positive().max(8_640),
    provenance: boundedText(500),
    src: z
      .string()
      .min(1)
      .max(4_000_000)
      .regex(
        /^data:image\/(png|svg\+xml);base64,[A-Za-z0-9+/=]+$/,
        "A demonstration asset must be a bundled base64 data URI.",
      ),
  })
  .strict();
export type DemonstrationAsset = z.infer<typeof demonstrationAssetSchema>;

export const demonstrationCaptionCueSchema = z
  .object({
    endFrame: z.number().int().positive(),
    sceneId: identifierSchema,
    startFrame: z.number().int().nonnegative(),
    text: boundedText(1_000),
  })
  .strict()
  .superRefine((cue, context) => {
    if (cue.endFrame <= cue.startFrame)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endFrame"],
        message: "Caption endFrame must be after startFrame.",
      });
  });
export type DemonstrationCaptionCue = z.infer<
  typeof demonstrationCaptionCueSchema
>;

/**
 * A demonstration scene: the shared factual content, plus the plan that
 * animates it. `title`, `narration` and `durationSeconds` mirror the fields the
 * standard equivalent uses, because the comparison is only meaningful if both
 * approaches present the same facts for the same length of time.
 */
export const demonstrationSceneSchema = z
  .object({
    id: identifierSchema,
    order: z.number().int().positive(),
    title: boundedText(160),
    narration: boundedText(5_000),
    durationSeconds: z.number().int().min(1).max(300),
    plan: demonstrationPlanSchema,
    /** Slot name → bundled asset ID. Never a URL, never a coordinate. */
    assetBySlot: z.record(slugSchema, slugSchema).default({}),
  })
  .strict()
  .superRefine((scene, context) => {
    if (scene.plan.sceneId !== scene.id)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["plan", "sceneId"],
        message: "A plan belongs to exactly one scene.",
      });
    const expected = Math.max(1, Math.round(scene.durationSeconds * demonstrationFps));
    if (scene.plan.durationInFrames !== expected)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["plan", "durationInFrames"],
        message: `The plan covers ${scene.plan.durationInFrames} frames but the scene is ${expected}. Scene bounds come from measured narration, not from the plan.`,
      });
  });
export type DemonstrationScene = z.infer<typeof demonstrationSceneSchema>;

export const demonstrationApproachValues = ["demonstration", "standard"] as const;
export const demonstrationApproachSchema = z.enum(demonstrationApproachValues);
export type DemonstrationApproach = z.infer<typeof demonstrationApproachSchema>;

export const demonstrationCompositionPropsSchema = z
  .object({
    fixtureId: slugSchema,
    approach: z.literal("demonstration"),
    assets: z.record(slugSchema, demonstrationAssetSchema),
    captions: z.array(demonstrationCaptionCueSchema).max(400),
    narrationTracks: z.array(demonstrationNarrationTrackSchema).min(1).max(20),
    scenes: z.array(demonstrationSceneSchema).min(1).max(12),
  })
  .strict()
  .superRefine((value, context) => {
    const sceneIds = new Set(value.scenes.map((scene) => scene.id));
    const tracked = new Set<string>();
    for (const [index, track] of value.narrationTracks.entries()) {
      if (!sceneIds.has(track.sceneId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["narrationTracks", index, "sceneId"],
          message: "A narration track must belong to a demonstration scene.",
        });
      else if (tracked.has(track.sceneId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["narrationTracks", index, "sceneId"],
          message: "Each scene has exactly one narration track.",
        });
      else tracked.add(track.sceneId);
    }
    for (const scene of value.scenes)
      if (!tracked.has(scene.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["narrationTracks"],
          message: `Scene ${scene.id} has no narration track.`,
        });
    for (const [index, cue] of value.captions.entries())
      if (!sceneIds.has(cue.sceneId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["captions", index, "sceneId"],
          message: "A caption cue must belong to a demonstration scene.",
        });
    const orders = new Set<number>();
    for (const [index, scene] of value.scenes.entries())
      if (orders.has(scene.order))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scenes", index, "order"],
          message: "Scene order must be unique.",
        });
      else orders.add(scene.order);
  });
export type DemonstrationCompositionProps = z.infer<
  typeof demonstrationCompositionPropsSchema
>;

// ---------------------------------------------------------------------------
// Structured rejection codes
// ---------------------------------------------------------------------------

export const demonstrationIssueCodeValues = [
  "unknown_recipe",
  "unsupported_recipe_version",
  "unsupported_plan_version",
  /** The recipe cannot present this content; the support query says why. */
  "unsupported_content",
  "unknown_object_reference",
  /** Right ID, wrong kind of object for the action. */
  "object_kind_mismatch",
  "invalid_quantity",
  /** The transition cannot happen from the state at that moment. */
  "impossible_transition",
  /** Two events act on the same object at the same time. */
  "conflicting_events",
  /** The tokens are not in the source container when the transfer starts. */
  "source_unavailable",
  /** The simulated end state disagrees with the declared one. */
  "final_state_mismatch",
  /** The plan's audio checksum does not match the supplied narration. */
  "stale_narration_timing",
  /** An event is anchored to a beat the narration does not contain. */
  "unknown_narration_beat",
  /** Resolved frames disagree with the beat's measured milliseconds. */
  "timing_drift",
  /** The plan cannot finish inside the scene's measured bounds. */
  "event_out_of_bounds",
  /** An event cannot get its declared settled inspection time. */
  "insufficient_hold",
  "missing_required_asset",
  "caption_collision",
  "invalid_caption_timing",
  /** An input tried to address the renderer's own decisions. */
  "unsupported_animation_instruction",
  "invalid_composition_input",
] as const;
export const demonstrationIssueCodeSchema = z.enum(
  demonstrationIssueCodeValues,
);
export type DemonstrationIssueCode = z.infer<
  typeof demonstrationIssueCodeSchema
>;

export type DemonstrationIssue = Readonly<{
  code: DemonstrationIssueCode;
  fieldPath: string;
  message: string;
  sceneId: string;
  suggestedCorrection: string;
}>;

// ---------------------------------------------------------------------------
// Reproducibility manifest (CR-02)
// ---------------------------------------------------------------------------

export const demonstrationFontFaceSchema = z
  .object({
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    family: boundedText(120),
    file: boundedText(400),
    style: z.enum(["normal", "italic"]),
    weight: z.number().int().min(100).max(900),
  })
  .strict();
export type DemonstrationFontFace = z.infer<typeof demonstrationFontFaceSchema>;

export const demonstrationOutputProfileSchema = z
  .object({
    audioCodec: z.literal("aac"),
    fps: z.literal(demonstrationFps),
    height: z.literal(1080),
    pixelFormat: z.literal("yuv420p"),
    videoCodec: z.literal("h264"),
    width: z.literal(1920),
  })
  .strict();
export type DemonstrationOutputProfile = z.infer<
  typeof demonstrationOutputProfileSchema
>;

export const demonstrationManifestSchema = z
  .object({
    /** sha256 over `canonicalDemonstrationJson(compositionProps)`. */
    resolvedInputSha256: z.string().regex(/^[a-f0-9]{64}$/),
    hashPolicy: z.literal(demonstrationHashPolicy),
    fixtureId: boundedText(80),
    /**
     * Part of the identity, not metadata: the same facts rendered the two ways
     * are two different outputs and must never share a render identity (CR-06).
     */
    approach: demonstrationApproachSchema,
    themeId: z.literal("mvp-default"),
    plans: z
      .array(
        z
          .object({
            sceneId: identifierSchema,
            recipeId: demonstrationRecipeIdSchema,
            recipeVersion: z.literal(demonstrationRecipeVersion),
            planVersion: z.literal(demonstrationPlanVersion),
            eventCount: z.number().int().nonnegative(),
            seed: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(12)
      .default([]),
    assets: z
      .array(
        z
          .object({
            assetId: boundedText(80),
            bytes: z.number().int().nonnegative(),
            checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(60),
    audio: z
      .array(
        z
          .object({
            checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
            durationMs: z.number().int().positive(),
            sceneId: identifierSchema,
            beatCount: z.number().int().positive(),
            timingMethod: demonstrationTimingMethodSchema,
          })
          .strict(),
      )
      .max(20),
    fonts: z.array(demonstrationFontFaceSchema).min(1).max(30),
    outputProfile: demonstrationOutputProfileSchema,
    timeline: z
      .array(
        z
          .object({
            durationInFrames: z.number().int().positive(),
            endFrameExclusive: z.number().int().positive(),
            sceneId: identifierSchema,
            startFrame: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    implementation: z
      .object({
        remotionVersion: boundedText(40),
        proofImplementationVersion: boundedText(120),
      })
      .strict(),
  })
  .strict();
export type DemonstrationManifest = z.infer<typeof demonstrationManifestSchema>;

// ---------------------------------------------------------------------------
// Canonical serialisation (CR-06)
// ---------------------------------------------------------------------------

type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function canonicalize(value: unknown, path: string): JsonValue {
  if (value === null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error(`Non-finite number at ${path} cannot be hashed.`);
    return value;
  }
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value))
    return value.map((entry, index) => canonicalize(entry, `${path}[${index}]`));
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, JsonValue> = {};
    // Meaningful array order — events, beats, scenes — is preserved above.
    // Object keys are sorted so an authoring-order change cannot invalidate an
    // otherwise identical render.
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry === undefined) continue;
      result[key] = canonicalize(entry, `${path}.${key}`);
    }
    return result;
  }
  throw new Error(`Unhashable value at ${path}.`);
}

/** The single canonical serialisation used for every demonstration hash. */
export function canonicalDemonstrationJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, "$"));
}
