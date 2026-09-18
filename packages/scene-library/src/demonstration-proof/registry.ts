/**
 * ST-095 — the demonstration recipe catalogue.
 *
 * Each recipe declares what it needs as *data*, separately from how it draws,
 * so a caller (and ST-096's selector) can reason about compatibility without
 * rendering anything and without importing a recipe component.
 *
 * Two recipes are authored here, deliberately. This is a bounded proof of a
 * mechanism, not a universal animation language: a third subject means a third
 * authored recipe with its own validated rules, which is the cost the approach
 * is meant to expose rather than hide.
 */

import {
  demonstrationRecipeVersion,
  type DemonstrationAction,
  type DemonstrationRecipeId,
} from "@avlp/schemas/demonstration-proof";

export type DemonstrationAssetSlot = Readonly<{
  /** Stable slot name a recipe reads, e.g. `vessel`. */
  slot: string;
  required: boolean;
  minWidth: number;
  minHeight: number;
  /** What the artwork must depict, so a wrong asset is a reviewable error. */
  expects: string;
}>;

export type DemonstrationTimingRequirements = Readonly<{
  /** Shortest scene the recipe can explain itself in. */
  minimumSceneSeconds: number;
  /** Settled frames every state-changing event must be given afterwards. */
  minimumHoldFrames: number;
  /** Frames a single state-changing event may take, inclusive bounds. */
  eventFrameBounds: Readonly<{ minimum: number; maximum: number }>;
}>;

export type DemonstrationRecipeMetadata = Readonly<{
  id: DemonstrationRecipeId;
  version: typeof demonstrationRecipeVersion;
  title: string;
  /** One line describing what the motion is supposed to explain. */
  description: string;
  /** Object kinds the recipe knows how to draw. */
  supportedObjectKinds: readonly string[];
  /** Actions the recipe implements. Anything else is unsupported content. */
  supportedActions: readonly DemonstrationAction[];
  assetSlots: readonly DemonstrationAssetSlot[];
  timing: DemonstrationTimingRequirements;
  /**
   * Structural preconditions the support query checks. These are counts and
   * roles, never a keyword in a title: a lesson is supported because it has the
   * objects the recipe animates, not because it says "savings" somewhere.
   */
  requires: Readonly<{
    minimumOf: Readonly<Record<string, number>>;
    containerRoles?: readonly string[];
    regionRoles?: readonly string[];
  }>;
  /**
   * How many objects of each role the recipe has a drawn place for.
   *
   * The recipes lay out by role — a `source` container goes where the recipe
   * puts a source container — so the stage has a fixed number of places and
   * the plan's own IDs never reach the geometry. A plan carrying more objects
   * of a role than there are places for cannot be drawn, and saying so is the
   * whole point of this field: without it the surplus objects would be stacked
   * silently on top of each other, which is a fluent, wrong clip rather than a
   * rejected plan.
   */
  placements: Readonly<{
    containerRoles?: Readonly<Record<string, number>>;
    regionRoles?: Readonly<Record<string, number>>;
  }>;
  /** Accuracy constraints recorded with the recipe, checked by validation. */
  subjectRules: readonly string[];
}>;

export const demonstrationRecipes: readonly DemonstrationRecipeMetadata[] =
  Object.freeze([
    Object.freeze({
      id: "savings.transfer-accumulate",
      version: demonstrationRecipeVersion,
      title: "Savings: transfer and accumulate",
      description:
        "Labelled money tokens move from an income container into a savings container and accumulate across named weeks toward a stated goal, with balances read off the same evaluated ledger that positions the tokens.",
      supportedObjectKinds: Object.freeze([
        "container",
        "token",
        "readout",
        "period-marker",
        "note",
      ]),
      supportedActions: Object.freeze([
        "transfer",
        "introduce",
        "advance-period",
        "emphasise",
        "annotate",
      ] as const),
      assetSlots: Object.freeze([
        Object.freeze({
          slot: "coin",
          required: true,
          minWidth: 160,
          minHeight: 160,
          expects: "A single denomination token face, drawn to its own edges.",
        }),
        Object.freeze({
          slot: "savings-jar",
          required: true,
          minWidth: 320,
          minHeight: 320,
          expects: "An open container the tokens can be seen resting inside.",
        }),
      ]),
      timing: Object.freeze({
        minimumSceneSeconds: 8,
        minimumHoldFrames: 24,
        eventFrameBounds: Object.freeze({ minimum: 12, maximum: 120 }),
      }),
      requires: Object.freeze({
        minimumOf: Object.freeze({ container: 2, token: 2, readout: 1 }),
        containerRoles: Object.freeze(["source", "destination"]),
      }),
      /**
       * One tray each. The stage is two trays side by side with the origin
       * strip above the income tray; there is nowhere to put a second
       * destination, and inventing one would mean the recipe deciding layout
       * from content, which is exactly what it must not do.
       */
      placements: Object.freeze({
        containerRoles: Object.freeze({
          origin: 1,
          source: 1,
          destination: 1,
        }),
      }),
      subjectRules: Object.freeze([
        "Every token that enters a container must come out of another container; an `introduce` must name its origin.",
        "Settled balances plus in-transit money are invariant across the whole plan.",
        "A displayed balance is derived from the evaluated ledger and is never authored independently.",
        "Amounts are integer minor units, so no rounding can make a total disagree.",
      ]),
    }),
    Object.freeze({
      id: "evaporation.surface-to-vapour",
      version: demonstrationRecipeVersion,
      title: "Evaporation: surface to vapour",
      description:
        "In a magnified view of a water surface, individual water particles gain enough energy to leave the liquid and spread out above it, keeping their identity as water throughout.",
      supportedObjectKinds: Object.freeze([
        "region",
        "particle",
        "note",
        "readout",
      ]),
      supportedActions: Object.freeze([
        "detach",
        "disperse",
        "emphasise",
        "annotate",
      ] as const),
      assetSlots: Object.freeze([
        Object.freeze({
          slot: "vessel",
          required: true,
          minWidth: 600,
          minHeight: 400,
          expects:
            "A vessel of water at room temperature seen from the side, with a visible surface line.",
        }),
        Object.freeze({
          slot: "magnifier",
          required: true,
          minWidth: 400,
          minHeight: 400,
          expects:
            "A magnifier frame that visibly labels the particle view as a magnified model, not a photograph.",
        }),
      ]),
      timing: Object.freeze({
        minimumSceneSeconds: 8,
        minimumHoldFrames: 24,
        eventFrameBounds: Object.freeze({ minimum: 12, maximum: 150 }),
      }),
      requires: Object.freeze({
        minimumOf: Object.freeze({ region: 2, particle: 8, note: 1 }),
        regionRoles: Object.freeze(["liquid-body", "vapour-space"]),
      }),
      /**
       * One body of liquid and one vapour space above it. A second liquid body
       * would need a second magnified panel and its own accuracy review, so it
       * is unsupported content rather than a layout the recipe improvises.
       */
      placements: Object.freeze({
        regionRoles: Object.freeze({
          "liquid-body": 1,
          "vapour-space": 1,
        }),
      }),
      subjectRules: Object.freeze([
        "A particle's substance is fixed at water; no action may change it.",
        "Particle count is conserved: evaporation moves water, it does not destroy it.",
        "A detach only ever runs liquid-body → vapour-space, never the reverse under this recipe.",
        "The magnified view must carry an authored note stating that it is a simplified model.",
        "Nothing in the plan may depend on boiling: detachment happens at the stated ordinary temperature.",
      ]),
    }),
  ]);

export function findDemonstrationRecipe(
  id: string,
): DemonstrationRecipeMetadata | undefined {
  return demonstrationRecipes.find((recipe) => recipe.id === id);
}

export function demonstrationRecipeSlots(
  id: DemonstrationRecipeId,
): readonly DemonstrationAssetSlot[] {
  return findDemonstrationRecipe(id)?.assetSlots ?? [];
}

/** One role the content oversubscribes, with the numbers that say so. */
export type DemonstrationPlacementOverflow = Readonly<{
  kind: "container" | "region";
  role: string;
  /** How many the content declares. */
  present: number;
  /** How many the recipe has a place for. */
  places: number;
}>;

/**
 * Roles the content brings more of than the recipe can draw.
 *
 * Shared by the support query and the plan validator so both answer this
 * question the same way. A role the recipe declares no places for at all is
 * reported as zero places rather than ignored: a recipe that has never been
 * given somewhere to put an object cannot put it anywhere.
 */
export function demonstrationPlacementOverflows(
  recipe: DemonstrationRecipeMetadata,
  content: Readonly<{
    containerRoleCounts: Readonly<Record<string, number>>;
    regionRoleCounts: Readonly<Record<string, number>>;
  }>,
): readonly DemonstrationPlacementOverflow[] {
  const overflows: DemonstrationPlacementOverflow[] = [];
  const check = (
    kind: "container" | "region",
    counts: Readonly<Record<string, number>>,
    places: Readonly<Record<string, number>> | undefined,
  ): void => {
    for (const [role, present] of Object.entries(counts)) {
      if (present === 0) continue;
      const available = places?.[role] ?? 0;
      if (present > available)
        overflows.push(
          Object.freeze({ kind, role, present, places: available }),
        );
    }
  };
  check(
    "container",
    content.containerRoleCounts,
    recipe.placements.containerRoles,
  );
  check("region", content.regionRoleCounts, recipe.placements.regionRoles);
  return Object.freeze(overflows);
}
