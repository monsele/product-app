/**
 * ST-109 (ADR-015) — creative-design manifest v2 and the visual-plan contract.
 *
 * v2 sits beside the frozen v1 contract in `creative-design.ts`. A v1 manifest
 * keeps rendering through the v1 treatments; a v2 manifest selects, per scene,
 * a registered *composition* that decides placement and hierarchy, while the
 * pack supplies only identity tokens. Nothing here carries CSS, coordinates,
 * colours chosen by a model, fonts, URLs or code: a plan names registered IDs,
 * validated wording and narration anchors, and everything else is derived.
 */
import { sha256 } from "@avlp/config";
import { identifierSchema } from "@avlp/config/identifiers";
import { z } from "zod";
import {
  creativeDesignApproachSchema,
  creativeDesignContrastRatio,
  creativeDesignManifestSchema,
  creativeDesignPackDefaultSettings,
  creativeDesignPackIdSchema,
  creativeDesignPackVersion,
  creativeDesignSettingsSchema,
  validateCreativeDesignManifest,
  type CreativeDesignManifest,
  type CreativeDesignPackId,
  type CreativeDesignSettings,
} from "./creative-design.js";
import type { SceneSpec, SceneTemplate } from "./index.js";

const text = (maximum: number) => z.string().trim().min(1).max(maximum);

export const creativeDesignManifestV2Version = "2.0" as const;
/** The implementation release every v2 composition belongs to (CR-03). */
export const cinemaCompositionRelease = "cinema-1.0.0" as const;
export const cinemaCompositionVersion = "1.0.0" as const;
export const cinemaPlannerVersion = "st-109-cinema-planner-v1" as const;
export const visualPlanVersion = "visual-plan-v1" as const;

/** The eight composition families of `docs/cinema-reel.md` §2. */
export const cinemaCompositionFamilies = [
  "illustrated-headline",
  "statement",
  "chapter",
  "sequence",
  "comparison",
  "connected",
  "hero-diagram",
  "takeaway",
] as const;
export type CinemaCompositionFamily = (typeof cinemaCompositionFamilies)[number];

export const cinemaCompositionIds = [
  "illustrated-headline",
  "statement",
  "chapter",
  "sequence",
  "comparison-split",
  "comparison-stacked",
  "connected",
  "hero-annotated",
  "hero-indexed",
  "takeaway",
] as const;
export const cinemaCompositionIdSchema = z.enum(cinemaCompositionIds);
export type CinemaCompositionId = z.infer<typeof cinemaCompositionIdSchema>;

export const cinemaIllustrationTreatments = [
  "flat",
  "ink-sketch",
  "editorial",
] as const;
export const cinemaIllustrationTreatmentSchema = z.enum(
  cinemaIllustrationTreatments,
);
export type CinemaIllustrationTreatment = z.infer<
  typeof cinemaIllustrationTreatmentSchema
>;

/** The four registered motion families of `docs/cinema-reel.md` §3. */
export const cinemaMotionFamilies = [
  "sequential-reveal",
  "path-build",
  "emphasis",
  "transform",
] as const;
export const cinemaMotionFamilySchema = z.enum(cinemaMotionFamilies);
export type CinemaMotionFamily = z.infer<typeof cinemaMotionFamilySchema>;

/**
 * A registered element a beat may address. Items and links are addressed by
 * their 1-based position in the scene's own validated content, never by
 * geometry.
 */
export const cinemaBeatTargetSchema = z
  .string()
  .regex(
    /^(headline|image|detail|answer|emphasis|left|right|item-(1[0-9]|20|[1-9])|link-(1[0-9]|2[0-4]|[1-9]))$/,
  );
export type CinemaBeatTarget = z.infer<typeof cinemaBeatTargetSchema>;

export const cinemaNarrationAnchorSchema = z
  .object({
    /** 0-based sentence of the scene narration. */
    sentence: z.number().int().min(0).max(59),
    /** An exact phrase from that narration, when a finer anchor is known. */
    phrase: text(80).optional(),
  })
  .strict();
export type CinemaNarrationAnchor = z.infer<typeof cinemaNarrationAnchorSchema>;

export const cinemaBeatSchema = z
  .object({
    target: cinemaBeatTargetSchema,
    motion: cinemaMotionFamilySchema,
    anchor: cinemaNarrationAnchorSchema,
  })
  .strict();
export type CinemaBeat = z.infer<typeof cinemaBeatSchema>;

export const cinemaArtDirectionSchema = z
  .object({
    treatment: cinemaIllustrationTreatmentSchema,
    line: z.enum(["none", "fine", "bold", "hand-drawn"]),
    subjects: z.enum(["objects", "people-and-objects", "scenes"]),
    background: z.enum(["cutout", "soft-vignette", "full-bleed"]),
    humanFigures: z.boolean(),
  })
  .strict();
export type CinemaArtDirection = z.infer<typeof cinemaArtDirectionSchema>;

/** Authored motifs: native identity-drawn graphics used when no image fits. */
export const cinemaMotifKinds = [
  "orbit",
  "stack",
  "path",
  "split",
  "burst",
  "grid",
  "wave",
  "spark",
] as const;
export const cinemaMotifKindSchema = z.enum(cinemaMotifKinds);
export type CinemaMotifKind = z.infer<typeof cinemaMotifKindSchema>;

export const cinemaImageOriginSchema = z.enum([
  "generated",
  "source_figure",
  "project_asset",
  "library",
]);

export const cinemaSceneImagerySchema = z
  .object({
    /** A decorative presentation illustration pinned to this scene. */
    hero: z
      .object({
        assetId: identifierSchema,
        origin: cinemaImageOriginSchema,
        altText: text(300),
      })
      .strict()
      .nullable(),
    /** What the illustration should show; also the deduplication key. */
    brief: z
      .object({
        concept: text(80),
        description: text(300),
        subject: z.enum(["object", "person", "place", "process"]),
      })
      .strict()
      .nullable(),
    /** The authored motif drawn when the composition wants a picture and
     * none is pinned. Always present so a fallback never needs re-planning. */
    motif: cinemaMotifKindSchema,
  })
  .strict();
export type CinemaSceneImagery = z.infer<typeof cinemaSceneImagerySchema>;

export const cinemaSceneDisplaySchema = z
  .object({
    /** Replaces the scene title as a heading; never a validated visual field. */
    headline: text(160),
    /** Words of the composition's primary text to emphasise. */
    emphasis: z.array(text(40)).max(3),
    kicker: text(40),
  })
  .strict();
export type CinemaSceneDisplay = z.infer<typeof cinemaSceneDisplaySchema>;

export const cinemaSceneDesignSchema = z
  .object({
    compositionId: cinemaCompositionIdSchema,
    compositionVersion: z.literal(cinemaCompositionVersion),
    locked: z.boolean(),
    requiredHoldFrames: z.number().int().min(30).max(600),
    chapter: z.number().int().min(1).max(99).nullable(),
    display: cinemaSceneDisplaySchema,
    imagery: cinemaSceneImagerySchema,
    beats: z.array(cinemaBeatSchema).max(24),
  })
  .strict();
export type CinemaSceneDesign = z.infer<typeof cinemaSceneDesignSchema>;

export const creativeDesignManifestV2Schema = z
  .object({
    manifestVersion: z.literal(creativeDesignManifestV2Version),
    plannerVersion: z.literal(cinemaPlannerVersion),
    compositionRelease: z.literal(cinemaCompositionRelease),
    pack: z
      .object({
        id: creativeDesignPackIdSchema,
        version: z.literal(creativeDesignPackVersion),
      })
      .strict(),
    approach: creativeDesignApproachSchema,
    settings: creativeDesignSettingsSchema,
    presetVersionId: identifierSchema.nullable(),
    variationSeed: z.string().regex(/^[0-9a-f]{16}$/),
    artDirection: cinemaArtDirectionSchema,
    plan: z
      .object({
        source: z.enum(["authored", "model"]),
        planVersion: z.literal(visualPlanVersion),
        modelCallId: identifierSchema.nullable(),
      })
      .strict(),
    scenes: z.record(identifierSchema, cinemaSceneDesignSchema),
  })
  .strict();
export type CreativeDesignManifestV2 = z.infer<
  typeof creativeDesignManifestV2Schema
>;

/** One reader for every stored release (ADR-015 §1). */
export const anyCreativeDesignManifestSchema = z.union([
  creativeDesignManifestSchema,
  creativeDesignManifestV2Schema,
]);
export type AnyCreativeDesignManifest =
  | CreativeDesignManifest
  | CreativeDesignManifestV2;

/** A v2 design draft save (ADR-015); v1 drafts keep `creativeDesignDraftInputSchema`. */
export const creativeDesignDraftV2InputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    manifest: creativeDesignManifestV2Schema,
  })
  .strict();

/** Explicitly upgrade the current v1 design draft to a v2 draft. */
export const creativeDesignUpgradeInputSchema = z
  .object({ expectedRevision: z.number().int().nonnegative() })
  .strict();

export function isCreativeDesignManifestV2(
  manifest: AnyCreativeDesignManifest | undefined | null,
): manifest is CreativeDesignManifestV2 {
  return manifest?.manifestVersion === creativeDesignManifestV2Version;
}

// ---------------------------------------------------------------------------
// Style names (ST-108 AC4)
// ---------------------------------------------------------------------------

export const creativeDesignPackNames: Readonly<
  Record<CreativeDesignPackId, string>
> = Object.freeze({
  essential: "Essential",
  editorial: "Editorial",
  everyday: "Everyday",
  systems: "Systems",
  "field-notes": "Field Notes",
  prism: "Prism",
});

export const legacyStyleLabel = "Legacy default theme";

/**
 * The human-readable style of a lesson. Only a lesson with no manifest at all
 * is legacy; a pack is always named by its pack, whatever its release.
 */
export function creativeDesignStyleLabel(
  manifest: Readonly<{ pack: Readonly<{ id: CreativeDesignPackId }> }> | null | undefined,
): string {
  return manifest === null || manifest === undefined
    ? legacyStyleLabel
    : creativeDesignPackNames[manifest.pack.id];
}

/** Every asset a manifest pins, for preview and render asset resolution. */
export function creativeDesignAssetIds(
  manifest: AnyCreativeDesignManifest | null | undefined,
): readonly string[] {
  if (manifest === null || manifest === undefined) return [];
  const ids = new Set<string>();
  if (manifest.settings.logoAssetId !== null)
    ids.add(manifest.settings.logoAssetId);
  if (isCreativeDesignManifestV2(manifest))
    for (const scene of Object.values(manifest.scenes))
      if (scene.imagery.hero !== null) ids.add(scene.imagery.hero.assetId);
  return Object.freeze([...ids]);
}

// ---------------------------------------------------------------------------
// Art direction
// ---------------------------------------------------------------------------

export const cinemaPackArtDirection: Readonly<
  Record<CreativeDesignPackId, CinemaArtDirection>
> = Object.freeze({
  essential: {
    treatment: "flat",
    line: "fine",
    subjects: "objects",
    background: "cutout",
    humanFigures: false,
  },
  editorial: {
    treatment: "editorial",
    line: "none",
    subjects: "people-and-objects",
    background: "full-bleed",
    humanFigures: true,
  },
  everyday: {
    treatment: "flat",
    line: "bold",
    subjects: "people-and-objects",
    background: "soft-vignette",
    humanFigures: true,
  },
  systems: {
    treatment: "flat",
    line: "fine",
    subjects: "objects",
    background: "cutout",
    humanFigures: false,
  },
  "field-notes": {
    treatment: "ink-sketch",
    line: "hand-drawn",
    subjects: "objects",
    background: "soft-vignette",
    humanFigures: true,
  },
  prism: {
    treatment: "flat",
    line: "bold",
    subjects: "people-and-objects",
    background: "cutout",
    humanFigures: true,
  },
});

/**
 * The shared art-direction brief every illustration request of one video
 * carries, so separately generated images read as one drawing language.
 */
export function cinemaArtDirectionBrief(
  artDirection: CinemaArtDirection,
  settings: Readonly<{
    colors: Pick<CreativeDesignSettings["colors"], "accent" | "diagramEmphasis" | "surface">;
  }>,
): string {
  const treatment =
    artDirection.treatment === "flat"
      ? "flat vector illustration with simple geometric shapes and even fills"
      : artDirection.treatment === "ink-sketch"
        ? "ink and pencil sketch illustration with loose hatching on paper"
        : "editorial magazine illustration with confident shapes and subtle texture";
  const line =
    artDirection.line === "none"
      ? "no outlines"
      : artDirection.line === "fine"
        ? "thin even outlines"
        : artDirection.line === "bold"
          ? "bold rounded outlines"
          : "hand-drawn wobbly outlines";
  // The picture sits on the identity's surface colour. Naming it keeps a
  // dark identity from receiving a white-backed picture.
  const { colors } = settings;
  const background =
    artDirection.background === "cutout"
      ? `isolated subject on a plain, empty, solid ${colors.surface} background`
      : artDirection.background === "soft-vignette"
        ? `subject on a soft shape that fades to a plain, solid ${colors.surface} background`
        : "subject filling the frame edge to edge";
  const people = artDirection.humanFigures
    ? "friendly, diverse people may appear when they help explain the idea"
    : "no people";
  return `Style: ${treatment}, ${line}, ${background}. Limited palette built around ${colors.accent}, ${colors.diagramEmphasis} and ${colors.surface}. ${people}. No text, letters, numbers, labels, logos or watermarks anywhere in the image.`;
}

// ---------------------------------------------------------------------------
// Composition catalogue
// ---------------------------------------------------------------------------

export type CinemaCompositionDefinition = Readonly<{
  id: CinemaCompositionId;
  family: CinemaCompositionFamily;
  version: typeof cinemaCompositionVersion;
  label: string;
  description: string;
  sceneTypes: readonly SceneTemplate[];
  /** How much the arrangement is built around a picture. */
  imageUse: "central" | "supporting" | "none";
  /** How much text the arrangement lays out comfortably. */
  capacity: "low" | "medium" | "high";
  /** Where the arrangement's visual weight sits, for directional continuity. */
  weight: "left" | "right" | "center";
  minDurationSeconds: number;
}>;

const composition = (
  value: Omit<CinemaCompositionDefinition, "version">,
): CinemaCompositionDefinition =>
  Object.freeze({ ...value, version: cinemaCompositionVersion });

export const cinemaCompositionCatalogue: readonly CinemaCompositionDefinition[] =
  Object.freeze([
    composition({
      id: "illustrated-headline",
      family: "illustrated-headline",
      label: "Illustration with headline",
      description:
        "A large illustration bleeds off one side while an asymmetric headline and short supporting lines sit low on the other.",
      sceneTypes: ["hook", "definition", "analogy", "summary"],
      imageUse: "central",
      capacity: "low",
      weight: "right",
      minDurationSeconds: 3,
    }),
    composition({
      id: "statement",
      family: "statement",
      label: "Large statement",
      description:
        "One oversized statement fills the frame, with selected words emphasised and supporting detail set small beneath it.",
      sceneTypes: ["hook", "definition", "analogy", "summary"],
      imageUse: "none",
      capacity: "low",
      weight: "left",
      minDurationSeconds: 3,
    }),
    composition({
      id: "chapter",
      family: "chapter",
      label: "Chapter card",
      description:
        "A numbered chapter opener: an outsized numeral, the section title and one key line, with a small illustration inset.",
      sceneTypes: ["hook", "definition", "analogy", "summary"],
      imageUse: "supporting",
      capacity: "low",
      weight: "left",
      minDurationSeconds: 4,
    }),
    composition({
      id: "sequence",
      family: "sequence",
      label: "Illustrated sequence",
      description:
        "A timeline runs across the frame; each stop is revealed in order with its label, and the current stop is enlarged.",
      sceneTypes: [
        "process",
        "worked-example",
        "input-process-output",
        "cause-effect",
        "summary",
      ],
      imageUse: "supporting",
      capacity: "high",
      weight: "center",
      minDurationSeconds: 4,
    }),
    composition({
      id: "comparison-split",
      family: "comparison",
      label: "Side-by-side comparison",
      description:
        "Two subjects face each other across a central divide; paired points are revealed across the middle.",
      sceneTypes: ["comparison", "analogy", "input-process-output"],
      imageUse: "supporting",
      capacity: "medium",
      weight: "center",
      minDurationSeconds: 3,
    }),
    composition({
      id: "comparison-stacked",
      family: "comparison",
      label: "Before and after",
      description:
        "One subject sits above the other with a transformation arrow between them and the differences listed alongside.",
      sceneTypes: ["comparison", "analogy"],
      imageUse: "supporting",
      capacity: "medium",
      weight: "left",
      minDurationSeconds: 4,
    }),
    composition({
      id: "connected",
      family: "connected",
      label: "Connected explanation",
      description:
        "Nodes are linked by drawn arrows that build as each relationship is explained, ending on the result.",
      sceneTypes: ["cause-effect", "process", "input-process-output"],
      imageUse: "none",
      capacity: "high",
      weight: "center",
      minDurationSeconds: 3,
    }),
    composition({
      id: "hero-annotated",
      family: "hero-diagram",
      label: "Annotated hero",
      description:
        "One hero visual fills the centre; callouts are drawn out to its edges as each part is named.",
      sceneTypes: ["labelled-diagram", "definition"],
      imageUse: "central",
      capacity: "medium",
      weight: "center",
      minDurationSeconds: 4,
    }),
    composition({
      id: "hero-indexed",
      family: "hero-diagram",
      label: "Indexed hero",
      description:
        "The hero visual sits on one side with numbered markers; a matching numbered key fills the other side.",
      sceneTypes: ["labelled-diagram", "process"],
      imageUse: "central",
      capacity: "high",
      weight: "left",
      minDurationSeconds: 3,
    }),
    composition({
      id: "takeaway",
      family: "takeaway",
      label: "Takeaway",
      description:
        "A closing arrangement: the key answer or question set large, with the supporting points gathered as cards.",
      sceneTypes: ["summary", "hook", "worked-example"],
      imageUse: "supporting",
      capacity: "medium",
      weight: "center",
      minDurationSeconds: 3,
    }),
  ]);

export function cinemaComposition(
  id: CinemaCompositionId,
): CinemaCompositionDefinition {
  const found = cinemaCompositionCatalogue.find((entry) => entry.id === id);
  if (found === undefined)
    throw new Error(`Composition ${id} is not registered.`);
  return found;
}

// ---------------------------------------------------------------------------
// Scene content helpers (pure; shared by planner, validator and renderer)
// ---------------------------------------------------------------------------

type AnyScene = SceneSpec;

/** The ordered item texts a composition treats as addressable items. */
export function cinemaSceneItems(scene: AnyScene): readonly string[] {
  switch (scene.template) {
    case "hook":
      return scene.visual.supportingElements ?? [];
    case "definition":
      return [];
    case "process":
      return (
        scene.visual.steps ??
        (scene.visual.nodes ?? []).map((node) => node.label)
      );
    case "input-process-output":
      return [
        ...scene.visual.inputs.map((item) => item.label),
        scene.visual.process.label,
        ...scene.visual.outputs.map((item) => item.label),
      ];
    case "comparison":
      return [...scene.visual.differences, ...scene.visual.similarities];
    case "cause-effect":
      if (scene.visual.nodes !== undefined)
        return scene.visual.nodes.map((node) => node.label);
      return [
        ...(scene.visual.causes ?? []).map((node) => node.label),
        ...(scene.visual.mechanism === undefined
          ? []
          : [scene.visual.mechanism.label]),
        ...(scene.visual.effects ?? []).map((node) => node.label),
      ];
    case "labelled-diagram":
      return scene.visual.labels.map((label) => label.text);
    case "analogy":
      return scene.visual.mappings.map(
        (mapping) => `${mapping.concept} — ${mapping.analogy}`,
      );
    case "worked-example":
      return scene.visual.steps;
    case "summary":
      return scene.visual.takeaways.map((takeaway) => takeaway.text);
  }
}

/** Number of addressable relationship links a scene's content defines. */
export function cinemaSceneLinkCount(scene: AnyScene): number {
  switch (scene.template) {
    case "process":
      return scene.visual.edges?.length ?? Math.max(0, (scene.visual.steps?.length ?? 0) - 1);
    case "cause-effect":
      return scene.visual.edges?.length ?? scene.visual.connections?.length ?? 0;
    case "input-process-output":
      return 2;
    case "worked-example":
      return Math.max(0, scene.visual.steps.length - 1);
    case "summary":
      return Math.max(0, scene.visual.takeaways.length - 1);
    default:
      return 0;
  }
}

/**
 * The ordered node ids of a graph when its edges form one simple path through
 * every node, else `null`. A sequence composition can present only a path.
 */
export function linearGraphOrder(
  nodes: readonly { id: string }[],
  edges: readonly { from: string; to: string }[],
): readonly string[] | null {
  if (edges.length !== nodes.length - 1) return null;
  const outgoing = new Map<string, string>();
  const incoming = new Map<string, number>();
  for (const edge of edges) {
    if (outgoing.has(edge.from)) return null;
    outgoing.set(edge.from, edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }
  const starts = nodes.filter((node) => !incoming.has(node.id));
  if (starts.length !== 1) return null;
  const order: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = starts[0]!.id;
  while (current !== undefined) {
    if (seen.has(current)) return null;
    seen.add(current);
    order.push(current);
    current = outgoing.get(current);
  }
  return order.length === nodes.length ? order : null;
}

/** The ordered stops a sequence composition would show, or null if the
 * scene's content is not a single ordered path. */
export function cinemaSequenceStops(scene: AnyScene): readonly string[] | null {
  switch (scene.template) {
    case "process": {
      if (scene.visual.steps !== undefined) return scene.visual.steps;
      const nodes = scene.visual.nodes ?? [];
      const order = linearGraphOrder(nodes, scene.visual.edges ?? []);
      if (order === null) return null;
      return order.map(
        (id) => nodes.find((node) => node.id === id)?.label ?? id,
      );
    }
    case "cause-effect": {
      if (scene.visual.nodes !== undefined) {
        const nodes = scene.visual.nodes;
        const order = linearGraphOrder(nodes, scene.visual.edges ?? []);
        if (order === null) return null;
        return order.map(
          (id) => nodes.find((node) => node.id === id)?.label ?? id,
        );
      }
      const causes = scene.visual.causes ?? [];
      const effects = scene.visual.effects ?? [];
      if (causes.length !== 1 || effects.length !== 1) return null;
      return [
        causes[0]!.label,
        ...(scene.visual.mechanism === undefined
          ? []
          : [scene.visual.mechanism.label]),
        effects[0]!.label,
      ];
    }
    case "input-process-output":
      if (scene.visual.inputs.length > 3 || scene.visual.outputs.length > 3)
        return null;
      return [
        scene.visual.inputs.map((item) => item.label).join(" + "),
        scene.visual.process.label,
        scene.visual.outputs.map((item) => item.label).join(" + "),
      ];
    case "worked-example":
      return scene.visual.steps.length <= 6 ? scene.visual.steps : null;
    case "summary":
      return scene.visual.takeaways.length >= 2
        ? scene.visual.takeaways.map((takeaway) => takeaway.text)
        : null;
    default:
      return null;
  }
}

function visibleTextLength(scene: AnyScene): number {
  return (
    cinemaSceneItems(scene).join(" ").length +
    scene.onScreenText.join(" ").length +
    (scene.template === "definition"
      ? scene.visual.definition.length + (scene.visual.exampleText?.length ?? 0)
      : 0) +
    (scene.template === "worked-example"
      ? scene.visual.problem.length + scene.visual.answer.length
      : 0) +
    (scene.template === "hook"
      ? scene.visual.question.length + (scene.visual.prompt?.length ?? 0)
      : 0) +
    (scene.template === "summary"
      ? (scene.visual.centralModel?.length ?? 0) +
        (scene.visual.callToAction?.length ?? 0)
      : 0)
  );
}

/** Text density tier used to match a composition's capacity. */
export function cinemaTextDensity(scene: AnyScene): "low" | "medium" | "high" {
  const length = visibleTextLength(scene);
  if (length > 320) return "high";
  if (length > 150) return "medium";
  return "low";
}

/**
 * Whether a composition can present this scene's complete validated content.
 * Returns a reason when it cannot, so a refused lock can explain itself.
 */
export function cinemaCompositionEligibility(
  id: CinemaCompositionId,
  scene: AnyScene,
): Readonly<{ eligible: true } | { eligible: false; reason: string }> {
  const definition = cinemaComposition(id);
  const no = (reason: string) =>
    Object.freeze({ eligible: false as const, reason });
  if (!definition.sceneTypes.includes(scene.template))
    return no(`${definition.label} does not present ${scene.template} scenes.`);
  if (scene.durationSeconds < definition.minDurationSeconds)
    return no(
      `${definition.label} needs at least ${definition.minDurationSeconds} seconds.`,
    );
  const items = cinemaSceneItems(scene);
  switch (id) {
    case "statement":
      if (scene.template === "summary" && items.length > 2)
        return no("A statement holds at most two takeaways.");
      if (scene.template === "analogy" && items.length > 3)
        return no("A statement holds at most three mappings.");
      if (scene.template === "hook" && items.length > 3)
        return no("A statement holds at most three supporting ideas.");
      break;
    case "chapter":
    case "illustrated-headline":
      if (scene.template === "summary" && items.length > 3)
        return no("This arrangement holds at most three takeaways.");
      if (scene.template === "analogy" && items.length > 3)
        return no("This arrangement holds at most three mappings.");
      break;
    case "sequence": {
      const stops = cinemaSequenceStops(scene);
      if (stops === null)
        return no("The content is not a single ordered sequence.");
      if (stops.length > 6) return no("A sequence shows at most six stops.");
      const longest = Math.max(...stops.map((stop) => stop.length));
      if (longest > sequenceStopCharacterBudget(stops.length))
        return no("A sequence stop label is too long to read on a timeline.");
      if (scene.template === "worked-example" && scene.visual.problem.length > 240)
        return no("The worked problem is too long to sit above a timeline.");
      if (scene.template === "worked-example" && scene.visual.answer.length > 160)
        return no("The worked answer is too long for the timeline's answer card.");
      break;
    }
    case "comparison-stacked":
      if (scene.template === "analogy" && items.length > 3)
        return no("Before and after holds at most three mappings.");
      if (
        scene.template === "comparison" &&
        (items.length > 5 || items.join("").length > 320)
      )
        return no("Before and after holds at most five short points.");
      break;
    case "hero-annotated":
      if (scene.template === "labelled-diagram" && items.length > 8)
        return no("An annotated hero holds at most eight callouts.");
      break;
    case "hero-indexed":
      // Lists up to twenty parts in a two-column key, so it can present any
      // validated labelled diagram.
      if (scene.template === "process" && scene.visual.steps === undefined)
        return no("An indexed hero lists ordered steps, not a graph.");
      break;
    default:
      // `takeaway` presents a worked example one step at a time, so it can
      // present any validated worked example; it is the always-eligible
      // arrangement for that type.
      break;
  }
  return Object.freeze({ eligible: true as const });
}

/** Longest stop label a timeline of `count` stops lays out legibly. */
export function sequenceStopCharacterBudget(count: number): number {
  if (count <= 3) return 160;
  if (count === 4) return 120;
  if (count === 5) return 95;
  return 80;
}

export function eligibleCinemaCompositions(
  scene: AnyScene,
): readonly CinemaCompositionDefinition[] {
  return cinemaCompositionCatalogue.filter(
    (entry) => cinemaCompositionEligibility(entry.id, scene).eligible,
  );
}

// ---------------------------------------------------------------------------
// Display wording: validated against the scene's approved content
// ---------------------------------------------------------------------------

const stopWords = new Set(
  (
    "a an the and or but if then than so of to in on at by for from with into onto over under about as is are was were be been being it its this that these those there here what which who whom whose when where why how do does did can could will would should may might must not no yes you your we our they their he she his her them us i me my our ours just also very more most less least each every all any some such own same other another up down out off again once only both few many much"
  ).split(" "),
);

/** Generic eyebrow labels any scene may use without matching its text. */
export const cinemaGenericKickers: readonly string[] = Object.freeze([
  "key idea",
  "key term",
  "think about this",
  "the big question",
  "step by step",
  "how it works",
  "compare",
  "compare and contrast",
  "cause and effect",
  "up close",
  "look closer",
  "worked example",
  "the answer",
  "remember",
  "in short",
  "why it matters",
  "what changes",
  "before and after",
  "the process",
  "takeaway",
  "chapter",
  "the system",
  "an analogy",
  "in summary",
]);

function tokens(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'%.,]*/gu) ?? []).map(
    (token) => token.replace(/[.,']+$/u, ""),
  );
}

function isNumberToken(token: string): boolean {
  return /\d/.test(token);
}

function stem(word: string): string {
  if (word.length <= 4) return word;
  return word.replace(/(ings|ing|ied|ies|ed|es|s)$/u, "");
}

/** Every approved string of a scene: title, narration, on-screen text and
 * the display text of its validated visual fields. */
export function cinemaApprovedSceneText(scene: AnyScene): readonly string[] {
  const texts: string[] = [scene.narration, ...scene.onScreenText];
  if (scene.title !== undefined) texts.push(scene.title);
  const structural = new Set([
    "id",
    "kind",
    "anchor",
    "assetSlot",
    "shape",
    "baseAssetSlot",
    "centralAssetSlot",
    "objectiveId",
    "from",
    "to",
  ]);
  const collect = (value: unknown, key?: string) => {
    if (key !== undefined && structural.has(key)) return;
    if (typeof value === "string") texts.push(value);
    else if (Array.isArray(value)) value.forEach((entry) => collect(entry));
    else if (value !== null && typeof value === "object")
      for (const [nested, entry] of Object.entries(value))
        collect(entry, nested);
  };
  collect(scene.visual);
  return Object.freeze(texts);
}

/**
 * True when every content word and every number of `candidate` already
 * appears in the scene's approved text. Function words are free; a new noun,
 * verb or figure is a new claim and is refused.
 */
export function isGroundedDisplayWording(
  candidate: string,
  approvedTexts: readonly string[],
): boolean {
  const approvedTokens = approvedTexts.flatMap(tokens);
  const approvedStems = new Set(approvedTokens.map(stem));
  const approvedNumbers = new Set(approvedTokens.filter(isNumberToken));
  const candidateTokens = tokens(candidate);
  if (candidateTokens.length === 0) return false;
  return candidateTokens.every((token) => {
    if (isNumberToken(token)) return approvedNumbers.has(token);
    if (stopWords.has(token)) return true;
    return approvedStems.has(stem(token));
  });
}

export function isAcceptableKicker(
  candidate: string,
  approvedTexts: readonly string[],
): boolean {
  return (
    cinemaGenericKickers.includes(candidate.trim().toLowerCase()) ||
    isGroundedDisplayWording(candidate, approvedTexts)
  );
}

/** The text a composition sets largest for this scene. */
export function cinemaPrimaryText(
  scene: AnyScene,
  display: Pick<CinemaSceneDisplay, "headline">,
): string {
  switch (scene.template) {
    case "hook":
      return scene.visual.question;
    case "definition":
      return scene.visual.term;
    default:
      return display.headline;
  }
}

const kickerByTemplate: Readonly<Record<SceneTemplate, string>> = {
  hook: "the big question",
  definition: "key term",
  process: "step by step",
  "input-process-output": "the system",
  comparison: "compare and contrast",
  "cause-effect": "cause and effect",
  "labelled-diagram": "look closer",
  analogy: "an analogy",
  "worked-example": "worked example",
  summary: "in summary",
};

const defaultHeadline = (scene: AnyScene): string => {
  if (scene.title !== undefined) return scene.title;
  switch (scene.template) {
    case "hook":
      return scene.visual.question;
    case "definition":
      return scene.visual.term;
    case "comparison":
      return `${scene.visual.leftSubject.label} and ${scene.visual.rightSubject.label}`;
    case "analogy":
      return scene.visual.sourceConcept;
    case "worked-example":
      return "Solve it step by step";
    case "summary":
      return "What to remember";
    case "labelled-diagram":
      return "Parts and relationships";
    case "input-process-output":
      return scene.visual.process.label;
    default:
      return "How it happens";
  }
};

/** Deterministic emphasis: the primary text's most narrated content word. */
function authoredEmphasis(scene: AnyScene, primary: string): string[] {
  const narration = tokens(scene.narration).map(stem);
  const candidates = [...new Set(tokens(primary))]
    .filter((token) => !stopWords.has(token) && !isNumberToken(token))
    .filter((token) => token.length >= 4 && token.length <= 40);
  if (candidates.length === 0) return [];
  const scored = candidates
    .map((token) => ({
      token,
      score:
        narration.filter((entry) => entry === stem(token)).length * 2 +
        token.length / 10,
    }))
    .sort((left, right) => right.score - left.score || left.token.localeCompare(right.token));
  const original = primary
    .split(/\s+/u)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .find((word) => word.toLowerCase() === scored[0]!.token);
  return original === undefined ? [] : [original];
}

export function authoredCinemaDisplay(scene: AnyScene): CinemaSceneDisplay {
  const headline = defaultHeadline(scene).slice(0, 160);
  const display = { headline, emphasis: [] as string[], kicker: kickerByTemplate[scene.template] };
  return cinemaSceneDisplaySchema.parse({
    ...display,
    emphasis: authoredEmphasis(scene, cinemaPrimaryText(scene, display)),
  });
}

/** Keeps each proposed display field only if it is grounded. */
export function groundCinemaDisplay(
  scene: AnyScene,
  proposal: Readonly<{
    headline?: string | undefined;
    emphasis?: readonly string[] | undefined;
    kicker?: string | undefined;
  }>,
): Readonly<{ display: CinemaSceneDisplay; rejected: readonly string[] }> {
  const approved = cinemaApprovedSceneText(scene);
  const authored = authoredCinemaDisplay(scene);
  const rejected: string[] = [];
  const headline =
    proposal.headline !== undefined &&
    proposal.headline.trim().length > 0 &&
    proposal.headline.length <= 160 &&
    isGroundedDisplayWording(proposal.headline, approved)
      ? proposal.headline.trim()
      : authored.headline;
  if (proposal.headline !== undefined && headline !== proposal.headline.trim())
    rejected.push("headline");
  const kicker =
    proposal.kicker !== undefined &&
    proposal.kicker.trim().length > 0 &&
    proposal.kicker.length <= 40 &&
    isAcceptableKicker(proposal.kicker, approved)
      ? proposal.kicker.trim().toLowerCase()
      : authored.kicker;
  if (proposal.kicker !== undefined && kicker !== proposal.kicker.trim().toLowerCase())
    rejected.push("kicker");
  const primary = cinemaPrimaryText(scene, { headline });
  const primaryWords = new Set(
    primary
      .split(/\s+/u)
      .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")),
  );
  const emphasis =
    proposal.emphasis === undefined
      ? authoredEmphasis(scene, primary)
      : proposal.emphasis
          .map((word) => word.trim())
          .filter((word) => word.length <= 40 && primaryWords.has(word))
          .slice(0, 3);
  if (
    proposal.emphasis !== undefined &&
    emphasis.length !== proposal.emphasis.length
  )
    rejected.push("emphasis");
  return Object.freeze({
    display: cinemaSceneDisplaySchema.parse({ headline, emphasis, kicker }),
    rejected: Object.freeze(rejected),
  });
}

// ---------------------------------------------------------------------------
// Beats: authored defaults, validation and frame resolution
// ---------------------------------------------------------------------------

/** Sentences of a narration, split deterministically. */
export function narrationSentences(narration: string): readonly string[] {
  const parts = narration
    .replace(/\s+/gu, " ")
    .trim()
    .match(/[^.!?]+(?:[.!?]+["')\]]*|$)/gu);
  return Object.freeze(
    (parts ?? []).map((part) => part.trim()).filter((part) => part.length > 0),
  );
}

/** The element targets a composition exposes for this scene. */
export function cinemaBeatTargets(
  id: CinemaCompositionId,
  scene: AnyScene,
): ReadonlySet<string> {
  const targets = new Set<string>(["headline", "emphasis"]);
  const definition = cinemaComposition(id);
  if (definition.imageUse !== "none") targets.add("image");
  const items =
    id === "sequence"
      ? (cinemaSequenceStops(scene) ?? [])
      : cinemaSceneItems(scene);
  items.forEach((_, index) => targets.add(`item-${index + 1}`));
  const links =
    id === "sequence"
      ? Math.max(0, items.length - 1)
      : cinemaSceneLinkCount(scene);
  for (let index = 1; index <= links; index += 1) targets.add(`link-${index}`);
  if (
    scene.template === "definition" ||
    scene.template === "hook" ||
    scene.template === "summary" ||
    scene.template === "worked-example" ||
    scene.template === "analogy"
  )
    targets.add("detail");
  if (scene.template === "worked-example") targets.add("answer");
  if (
    scene.template === "comparison" ||
    scene.template === "analogy" ||
    (scene.template === "input-process-output" && id === "comparison-split")
  ) {
    targets.add("left");
    targets.add("right");
  }
  return targets;
}

/**
 * Authored beats: one focus change per narration sentence, distributed over
 * the composition's elements in reading order, so a long scene keeps moving
 * without a model plan.
 */
export function authoredCinemaBeats(
  id: CinemaCompositionId,
  scene: AnyScene,
): readonly CinemaBeat[] {
  const sentences = narrationSentences(scene.narration);
  const sentenceCount = Math.max(1, sentences.length);
  const targets = cinemaBeatTargets(id, scene);
  const itemCount =
    id === "sequence"
      ? (cinemaSequenceStops(scene) ?? []).length
      : cinemaSceneItems(scene).length;
  const beats: CinemaBeat[] = [];
  const at = (index: number, total: number) =>
    Math.min(sentenceCount - 1, Math.floor((index * sentenceCount) / Math.max(1, total)));
  beats.push({ target: "headline", motion: "sequential-reveal", anchor: { sentence: 0 } });
  if (targets.has("left") && targets.has("right")) {
    beats.push({ target: "left", motion: "sequential-reveal", anchor: { sentence: 0 } });
    beats.push({
      target: "right",
      motion: "sequential-reveal",
      anchor: { sentence: Math.min(1, sentenceCount - 1) },
    });
  }
  const itemMotion: CinemaMotionFamily =
    id === "connected" || id === "sequence" ? "path-build" : "sequential-reveal";
  for (let index = 0; index < itemCount; index += 1) {
    beats.push({
      target: `item-${index + 1}`,
      motion: itemMotion,
      anchor: { sentence: at(index, itemCount) },
    });
  }
  if (targets.has("detail"))
    beats.push({
      target: "detail",
      motion: "sequential-reveal",
      anchor: { sentence: Math.min(1, sentenceCount - 1) },
    });
  if (targets.has("answer"))
    beats.push({
      target: "answer",
      motion: "transform",
      anchor: { sentence: sentenceCount - 1 },
    });
  if (targets.has("emphasis"))
    beats.push({
      target: "emphasis",
      motion: "emphasis",
      anchor: { sentence: Math.min(sentenceCount - 1, Math.max(0, Math.floor(sentenceCount / 2))) },
    });
  return Object.freeze(beats.slice(0, 24));
}

/**
 * Drops beats whose target, sentence or phrase this scene cannot honour, and
 * keeps the rest readable. A plan may time emphasis, never withhold content:
 * the heading arrives with the first sentence, and the scene's own text
 * (`detail`) no later than the middle of the narration, so it stays on screen
 * long enough to read. An anchor moved for that reason loses its phrase.
 */
export function groundCinemaBeats(
  id: CinemaCompositionId,
  scene: AnyScene,
  beats: readonly CinemaBeat[],
): readonly CinemaBeat[] {
  const targets = cinemaBeatTargets(id, scene);
  const sentences = narrationSentences(scene.narration);
  const latestBySentence: Readonly<Record<string, number>> = {
    headline: 0,
    detail: Math.floor(Math.max(0, sentences.length - 1) / 2),
  };
  return Object.freeze(
    beats
      .filter(
        (beat) =>
          targets.has(beat.target) &&
          beat.anchor.sentence < Math.max(1, sentences.length) &&
          (beat.anchor.phrase === undefined ||
            (sentences[beat.anchor.sentence] ?? "")
              .toLowerCase()
              .includes(beat.anchor.phrase.toLowerCase())),
      )
      .map((beat) => {
        const latest = latestBySentence[beat.target];
        if (beat.target === "headline")
          return { target: beat.target, motion: beat.motion, anchor: { sentence: 0 } };
        return latest === undefined || beat.anchor.sentence <= latest
          ? beat
          : { target: beat.target, motion: beat.motion, anchor: { sentence: latest } };
      })
      // Frames never run backwards through the list, so a moved beat must
      // also take its place in narration order (stable for equal sentences).
      .map((beat, index) => ({ beat, index }))
      .sort(
        (left, right) =>
          left.beat.anchor.sentence - right.beat.anchor.sentence || left.index - right.index,
      )
      .map((entry) => entry.beat),
  );
}

export type CinemaCaptionCue = Readonly<{
  startFrame: number;
  endFrame: number;
  text: string;
}>;

/** Frames every scene keeps still at its end, for reading (ST-111 AC4). */
export const cinemaFinalHoldFrames = 36;
/** Frames an element takes to arrive once its beat starts. */
export const cinemaBeatRevealFrames = 14;
/** Earliest frame any beat may start, after the scene establishes. */
export const cinemaEstablishFrames = 6;

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * Resolves each beat's anchor to a scene-relative start frame (ADR-015 §5).
 *
 * Pure in its inputs — the pinned caption cues (scene-relative), the scene
 * narration and duration — so preview, render and a saved lesson version all
 * resolve the same frames. With cues, an anchor maps to where its text is
 * spoken; without cues, to its proportional position in the narration.
 * Results are clamped out of the establish window and the final readable
 * hold, and never move earlier than the previous beat.
 */
export function resolveCinemaBeatFrames(
  input: Readonly<{
    beats: readonly CinemaBeat[];
    narration: string;
    cues: readonly CinemaCaptionCue[];
    durationInFrames: number;
  }>,
): readonly number[] {
  const narration = input.narration.replace(/\s+/gu, " ").trim();
  const sentences = narrationSentences(narration);
  const sentenceOffsets: number[] = [];
  let cursor = 0;
  for (const sentence of sentences) {
    const found = narration.indexOf(sentence, cursor);
    sentenceOffsets.push(found === -1 ? cursor : found);
    cursor = (found === -1 ? cursor : found) + sentence.length;
  }
  const latest = Math.max(
    cinemaEstablishFrames,
    input.durationInFrames - cinemaFinalHoldFrames - cinemaBeatRevealFrames,
  );
  const cues = [...input.cues]
    .filter((cue) => cue.endFrame > cue.startFrame)
    .sort((left, right) => left.startFrame - right.startFrame);
  const cueText = cues.map((cue) => normalise(cue.text));
  const joined = cueText.join(" ");
  const cueStarts: number[] = [];
  let running = 0;
  for (const value of cueText) {
    cueStarts.push(running);
    running += value.length + 1;
  }
  const speechStart = cues[0]?.startFrame ?? 0;
  const speechEnd = cues.at(-1)?.endFrame ?? input.durationInFrames;

  /** Frame at which character `offset` of the normalised cue text is spoken. */
  const frameAtCueOffset = (offset: number): number => {
    let index = cueStarts.findIndex(
      (start, position) =>
        offset >= start && offset < start + cueText[position]!.length + 1,
    );
    if (index === -1) index = cues.length - 1;
    const cue = cues[index]!;
    const within = Math.max(0, offset - cueStarts[index]!);
    const fraction = Math.min(1, within / Math.max(1, cueText[index]!.length));
    return cue.startFrame + fraction * (cue.endFrame - cue.startFrame);
  };

  let previous = cinemaEstablishFrames;
  return Object.freeze(
    input.beats.map((beat) => {
      const sentenceIndex = Math.min(
        beat.anchor.sentence,
        Math.max(0, sentences.length - 1),
      );
      const sentence = sentences[sentenceIndex] ?? narration;
      const phraseInSentence =
        beat.anchor.phrase === undefined
          ? -1
          : sentence.toLowerCase().indexOf(beat.anchor.phrase.toLowerCase());
      const narrationOffset =
        (sentenceOffsets[sentenceIndex] ?? 0) + Math.max(0, phraseInSentence);
      let frame: number;
      if (cues.length > 0 && joined.length > 0) {
        const needle = normalise(
          phraseInSentence >= 0 && beat.anchor.phrase !== undefined
            ? beat.anchor.phrase
            : sentence.split(" ").slice(0, 6).join(" "),
        );
        const found = needle.length > 0 ? joined.indexOf(needle) : -1;
        frame =
          found >= 0
            ? frameAtCueOffset(found)
            : speechStart +
              (narrationOffset / Math.max(1, narration.length)) *
                (speechEnd - speechStart);
      } else {
        frame =
          (narrationOffset / Math.max(1, narration.length)) *
          input.durationInFrames;
      }
      const clamped = Math.round(
        Math.min(latest, Math.max(previous, cinemaEstablishFrames, frame)),
      );
      previous = clamped;
      return clamped;
    }),
  );
}

// ---------------------------------------------------------------------------
// Resolved timing, pinned in a lesson version (ST-111 AC5)
// ---------------------------------------------------------------------------

export const cinemaTimingVersion = "cinema-timing-v1" as const;

/**
 * The one conversion from a caption time to a frame, for preview, render and
 * a saved version alike. It keeps the arithmetic the render path has always
 * used, `round((ms / 1000) × fps)`, so re-rendering an approved video places
 * every caption where it did; the algebraically equal `round(ms × fps / 1000)`
 * differs by one frame at some half-frame boundaries (2050 ms at 30 fps).
 */
export function captionMsToFrame(ms: number, fps = 30): number {
  return Math.round((ms / 1_000) * fps);
}

/** A scene's length in frames, as the lesson timeline counts it. */
export function cinemaSceneDurationInFrames(durationSeconds: number, fps = 30): number {
  return Math.max(1, Math.round(durationSeconds * fps));
}

export type CinemaCaptionMs = Readonly<{ startMs: number; endMs: number; text: string }>;

/** Identifies the exact scene captions a pinned timing was resolved from. */
export function cinemaCaptionsSha256(cues: readonly CinemaCaptionMs[]): string {
  return sha256(JSON.stringify(cues.map((cue) => [cue.startMs, cue.endMs, cue.text])));
}

export const cinemaTimingSchema = z
  .object({
    version: z.literal(cinemaTimingVersion),
    fps: z.literal(30),
    scenes: z.record(
      identifierSchema,
      z
        .object({
          captionsSha256: z.string().regex(/^[0-9a-f]{64}$/),
          /** Scene-relative start frame of each beat, in manifest beat order. */
          beatFrames: z.array(z.number().int().nonnegative()).max(24),
        })
        .strict(),
    ),
  })
  .strict();
export type CinemaTiming = z.infer<typeof cinemaTimingSchema>;

/**
 * Resolves every scene's beats against its narration captions, for pinning
 * in a lesson version. Uses exactly the conversions the preview and render
 * compositions use, so the pinned frames are the frames either would draw.
 */
export function resolveCinemaTiming(
  input: Readonly<{
    manifest: CreativeDesignManifestV2;
    scenes: readonly AnyScene[];
    /** Scene-relative caption cues in milliseconds, by scene ID. */
    captionsBySceneId: Readonly<Record<string, readonly CinemaCaptionMs[]>>;
  }>,
): CinemaTiming {
  const fps = 30;
  const scenes: Record<string, CinemaTiming["scenes"][string]> = {};
  for (const scene of input.scenes) {
    const design = input.manifest.scenes[scene.id];
    if (design === undefined) continue;
    const captions = input.captionsBySceneId[scene.id] ?? [];
    scenes[scene.id] = {
      captionsSha256: cinemaCaptionsSha256(captions),
      beatFrames: [
        ...resolveCinemaBeatFrames({
          beats: design.beats,
          narration: scene.narration,
          cues: captions.map((cue) => ({
            startFrame: captionMsToFrame(cue.startMs, fps),
            endFrame: captionMsToFrame(cue.endMs, fps),
            text: cue.text,
          })),
          durationInFrames: cinemaSceneDurationInFrames(scene.durationSeconds, fps),
        }),
      ],
    };
  }
  return cinemaTimingSchema.parse({ version: cinemaTimingVersion, fps, scenes });
}

// ---------------------------------------------------------------------------
// Visual-plan proposal (model output) — ST-110
// ---------------------------------------------------------------------------

export const visualPlanProposalSchema = z
  .object({
    artDirection: z
      .object({
        treatment: cinemaIllustrationTreatmentSchema.optional(),
        subjects: cinemaArtDirectionSchema.shape.subjects.optional(),
        humanFigures: z.boolean().optional(),
      })
      .strict()
      .optional(),
    scenes: z
      .array(
        z
          .object({
            sceneId: identifierSchema,
            compositions: z.array(cinemaCompositionIdSchema).min(1).max(3),
            headline: text(160).optional(),
            emphasis: z.array(text(40)).max(3).optional(),
            kicker: text(40).optional(),
            illustration: z
              .object({
                concept: text(80),
                description: text(300),
                subject: z.enum(["object", "person", "place", "process"]),
              })
              .strict()
              .nullable()
              .optional(),
            beats: z
              .array(
                z
                  .object({
                    target: cinemaBeatTargetSchema,
                    motion: cinemaMotionFamilySchema,
                    sentence: z.number().int().min(0).max(59),
                    phrase: text(80).optional(),
                  })
                  .strict(),
              )
              .max(12)
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(60),
  })
  .strict();
export type VisualPlanProposal = z.infer<typeof visualPlanProposalSchema>;

/** One part of a proposal that was not applied, described by our code only. */
export type VisualPlanDrop = Readonly<{
  sceneId: string | null;
  field:
    | "scene"
    | "compositions"
    | "headline"
    | "kicker"
    | "emphasis"
    | "illustration"
    | "beats";
  reason: string;
}>;

/**
 * Presentation instructions an illustration brief must never carry (ST-110
 * AC1): colour codes, CSS, markup, code, URLs, coordinates and fonts. The
 * palette and drawing language come from the shared art direction; a brief
 * says only what the picture shows. Plain subject colours ("a green leaf")
 * describe content and stay allowed.
 */
const briefPresentationPattern = new RegExp(
  [
    String.raw`#[0-9a-f]{3,8}\b`,
    String.raw`\b(?:rgba?|hsla?)\s*\(`,
    String.raw`[{};<>\x60]`,
    String.raw`=>`,
    String.raw`\b\d+(?:\.\d+)?\s*(?:px|em|rem|vh|vw|pt)\b`,
    String.raw`\b(?:css|font|fonts|typeface|serif|sans-serif|z-index|margin|padding|opacity)\b`,
    String.raw`\b(?:colou?r|style|class|width|height|position)\s*[:=]`,
    String.raw`https?:|www\.|\.(?:png|jpe?g|svg|gif|webp)\b`,
    String.raw`\b[xy]\s*[:=]\s*-?\d`,
    String.raw`\(\s*-?\d+\s*,\s*-?\d+\s*\)`,
    String.raw`\b(?:top|left|right|bottom)\s*[:=]`,
  ].join("|"),
  "iu",
);

/** Briefs that ask for writing inside the picture, which renders as garbled text. */
const briefLetteringPattern =
  /\b(?:labels?|labell?ed|captions?|captioned|lettering|text|written|writing|words?|letters?|numbers?|numerals?|logos?|watermarks?)\b/iu;

/**
 * Applies a model's visual-plan proposal only where it is supported (ST-110
 * AC2): unknown or repeated scenes are dropped; compositions a scene cannot
 * present, ungrounded wording, unaddressable beats and illustration briefs
 * that carry presentation instructions are removed. Pure and idempotent: a
 * grounded proposal grounds to itself. Composition lists may be emptied, in
 * which case the whole-video selection chooses freely for that scene.
 */
export function groundVisualPlanProposal(
  proposal: VisualPlanProposal,
  scenes: readonly AnyScene[],
): Readonly<{ proposal: VisualPlanProposal; dropped: readonly VisualPlanDrop[] }> {
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const seen = new Set<string>();
  const dropped: VisualPlanDrop[] = [];
  const drop = (sceneId: string | null, field: VisualPlanDrop["field"], reason: string) =>
    dropped.push(Object.freeze({ sceneId, field, reason }));
  const grounded: VisualPlanProposal["scenes"] = [];
  for (const entry of proposal.scenes) {
    const scene = byId.get(entry.sceneId);
    if (scene === undefined) {
      drop(null, "scene", "The plan named a scene that is not in this lesson.");
      continue;
    }
    if (seen.has(entry.sceneId)) {
      drop(entry.sceneId, "scene", "The plan named this scene more than once.");
      continue;
    }
    seen.add(entry.sceneId);
    const eligible = eligibleCinemaCompositions(scene).map((candidate) => candidate.id);
    const compositions = [...new Set(entry.compositions)].filter((id) => eligible.includes(id));
    if (compositions.length < new Set(entry.compositions).size)
      drop(entry.sceneId, "compositions", "A proposed composition cannot present this scene's content.");
    const { rejected } = groundCinemaDisplay(scene, {
      headline: entry.headline,
      emphasis: entry.emphasis,
      kicker: entry.kicker,
    });
    for (const field of rejected)
      drop(
        entry.sceneId,
        field as "headline" | "kicker" | "emphasis",
        `The proposed ${field} is not grounded in the scene's approved content.`,
      );
    let emphasis = entry.emphasis;
    if (emphasis !== undefined && rejected.includes("emphasis")) {
      const headline = rejected.includes("headline") ? undefined : entry.headline;
      const primary = cinemaPrimaryText(scene, {
        headline: headline ?? authoredCinemaDisplay(scene).headline,
      });
      const words = new Set(
        primary.split(/\s+/u).map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")),
      );
      emphasis = emphasis.map((word) => word.trim()).filter((word) => words.has(word)).slice(0, 3);
    }
    let illustration = entry.illustration;
    if (
      illustration !== undefined &&
      illustration !== null &&
      [illustration.concept, illustration.description].some(
        (value) => briefPresentationPattern.test(value) || briefLetteringPattern.test(value),
      )
    ) {
      drop(
        entry.sceneId,
        "illustration",
        "The illustration brief carried presentation instructions or asked for writing in the picture.",
      );
      illustration = undefined;
    }
    const targetPool = compositions.length > 0 ? compositions : eligible;
    const targets = new Set(targetPool.flatMap((id) => [...cinemaBeatTargets(id, scene)]));
    const sentences = narrationSentences(scene.narration);
    const beats = (entry.beats ?? []).filter(
      (beat) =>
        targets.has(beat.target) &&
        beat.sentence < Math.max(1, sentences.length) &&
        (beat.phrase === undefined ||
          (sentences[beat.sentence] ?? "").toLowerCase().includes(beat.phrase.toLowerCase())),
    );
    if (entry.beats !== undefined && beats.length < entry.beats.length)
      drop(entry.sceneId, "beats", "A proposed beat addresses an element or narration span this scene does not have.");
    grounded.push({
      sceneId: entry.sceneId,
      compositions,
      ...(entry.headline === undefined || rejected.includes("headline") ? {} : { headline: entry.headline }),
      ...(entry.kicker === undefined || rejected.includes("kicker") ? {} : { kicker: entry.kicker }),
      ...(emphasis === undefined ? {} : { emphasis }),
      ...(illustration === undefined ? {} : { illustration }),
      ...(entry.beats === undefined ? {} : { beats }),
    });
  }
  return Object.freeze({
    proposal: {
      ...(proposal.artDirection === undefined ? {} : { artDirection: proposal.artDirection }),
      scenes: grounded,
    },
    dropped: Object.freeze(dropped),
  });
}

// ---------------------------------------------------------------------------
// Whole-video selection (ST-109 AC3)
// ---------------------------------------------------------------------------

/** A stable pseudo-random value in [0, 1) for this seed and key. */
export function cinemaSeededUnit(seed: string, key: string): number {
  const digest = sha256(`${seed}:${key}`);
  return Number.parseInt(digest.slice(0, 8), 16) / 0x1_0000_0000;
}

/** A persisted variation seed, derived once from the lesson's identity. */
export function cinemaVariationSeed(identity: string): string {
  return sha256(`cinema-seed:${identity}`).slice(0, 16);
}

const typeAffinity: Readonly<
  Partial<Record<SceneTemplate, Partial<Record<CinemaCompositionId, number>>>>
> = {
  hook: { statement: 1.5, "illustrated-headline": 1.5, chapter: 0.5, takeaway: 0.5 },
  definition: { "illustrated-headline": 1, statement: 1, "hero-annotated": 1, chapter: 0.5 },
  process: { sequence: 2, connected: 1.5, "hero-indexed": 1 },
  "input-process-output": { connected: 1.5, sequence: 1.5, "comparison-split": 1 },
  comparison: { "comparison-split": 1.5, "comparison-stacked": 1.5 },
  "cause-effect": { connected: 2, sequence: 1.5 },
  "labelled-diagram": { "hero-annotated": 1.5, "hero-indexed": 1.5 },
  analogy: { "comparison-split": 1.5, "illustrated-headline": 1, statement: 0.5, "comparison-stacked": 1 },
  "worked-example": { sequence: 1.5, takeaway: 1.5 },
  summary: { takeaway: 1.5, sequence: 1, "illustrated-headline": 0.5, statement: 0.5, chapter: 0.5 },
};

const capacityRank = { low: 0, medium: 1, high: 2 } as const;

export type CinemaPlanningScene = Readonly<{
  scene: AnyScene;
  /** A picture is available for this scene (pinned, bound or planned). */
  hasImage: boolean;
  /** First outline section the scene cites, for chapter numbering. */
  sectionId?: string | undefined;
}>;

export type CinemaSelection = Readonly<{
  compositionId: CinemaCompositionId;
  locked: boolean;
}>;

/**
 * Chooses one composition per scene for the whole video. Deterministic for a
 * seed; different seeds give different, equally valid videos. Scores content
 * fit, picture availability, text density, rhythm and variety, and refuses a
 * third consecutive use of one family whenever an eligible alternative exists.
 */
export function selectCinemaCompositions(
  input: Readonly<{
    scenes: readonly CinemaPlanningScene[];
    seed: string;
    locks?: Readonly<Record<string, CinemaCompositionId>>;
    preferences?: Readonly<Record<string, readonly CinemaCompositionId[]>>;
  }>,
): Readonly<Record<string, CinemaSelection>> {
  const selections: Record<string, CinemaSelection> = {};
  const familyUses = new Map<CinemaCompositionFamily, number>();
  const history: CinemaCompositionFamily[] = [];
  const total = input.scenes.length;
  let previousSection: string | undefined;
  for (const [index, entry] of input.scenes.entries()) {
    const { scene } = entry;
    const eligible = eligibleCinemaCompositions(scene);
    if (eligible.length === 0)
      throw new Error(`No registered composition can present scene ${scene.id}.`);
    const locked = input.locks?.[scene.id];
    const lockedChoice =
      locked === undefined
        ? undefined
        : eligible.find((candidate) => candidate.id === locked);
    if (locked !== undefined && lockedChoice === undefined)
      throw new Error(
        `The locked composition for scene ${scene.id} no longer fits its content.`,
      );
    const lastTwo = history.slice(-2);
    const wouldTriple = (family: CinemaCompositionFamily) =>
      lastTwo.length === 2 && lastTwo.every((entry) => entry === family);
    const hasAlternative = (family: CinemaCompositionFamily) =>
      eligible.some((candidate) => candidate.family !== family);
    const density = cinemaTextDensity(scene);
    const startsSection =
      entry.sectionId !== undefined && entry.sectionId !== previousSection;
    const preference = input.preferences?.[scene.id] ?? [];
    const score = (candidate: CinemaCompositionDefinition): number => {
      let value = typeAffinity[scene.template]?.[candidate.id] ?? 0;
      const rank = preference.indexOf(candidate.id);
      if (rank !== -1) value += 3 - rank;
      if (candidate.imageUse === "central")
        value += entry.hasImage ? 1.5 : -0.75;
      else if (candidate.imageUse === "supporting" && entry.hasImage) value += 0.5;
      const gap = capacityRank[density] - capacityRank[candidate.capacity];
      if (gap > 0) value -= gap * 1.5;
      value -= (familyUses.get(candidate.family) ?? 0) * 2;
      if (history.at(-1) === candidate.family) value -= 1.5;
      if (wouldTriple(candidate.family) && hasAlternative(candidate.family))
        value -= 100;
      if (index === 0 && ["statement", "illustrated-headline", "chapter"].includes(candidate.id))
        value += 1;
      if (index === total - 1 && candidate.id === "takeaway") value += 2;
      if (startsSection && index > 0 && candidate.id === "chapter") value += 1.5;
      value += cinemaSeededUnit(input.seed, `${scene.id}:${candidate.id}`) * 1.25;
      return value;
    };
    const chosen =
      lockedChoice ??
      [...eligible].sort(
        (left, right) => score(right) - score(left) || left.id.localeCompare(right.id),
      )[0]!;
    selections[scene.id] = Object.freeze({
      compositionId: chosen.id,
      locked: lockedChoice !== undefined,
    });
    familyUses.set(chosen.family, (familyUses.get(chosen.family) ?? 0) + 1);
    history.push(chosen.family);
    if (entry.sectionId !== undefined) previousSection = entry.sectionId;
  }
  return Object.freeze(selections);
}

// ---------------------------------------------------------------------------
// Building and validating a v2 manifest
// ---------------------------------------------------------------------------

const motifByTemplate: Readonly<Record<SceneTemplate, readonly CinemaMotifKind[]>> = {
  hook: ["spark", "burst", "orbit"],
  definition: ["orbit", "stack"],
  process: ["path", "stack"],
  "input-process-output": ["path", "grid"],
  comparison: ["split", "stack"],
  "cause-effect": ["burst", "path"],
  "labelled-diagram": ["grid", "orbit"],
  analogy: ["split", "wave"],
  "worked-example": ["stack", "grid"],
  summary: ["grid", "spark"],
};

export function cinemaHoldFrames(
  id: CinemaCompositionId,
  scene: AnyScene,
): number {
  const density = cinemaTextDensity(scene);
  const base = density === "high" ? 90 : density === "medium" ? 75 : 60;
  const definition = cinemaComposition(id);
  const hold = definition.capacity === "high" ? Math.max(base, 75) : base;
  return Math.max(30, Math.min(hold, Math.floor(scene.durationSeconds * 30) - 30));
}

export type CinemaImageAvailability = Readonly<
  Record<string, CinemaSceneImagery["hero"]>
>;

/**
 * Builds a complete v2 manifest from the whole-video selection, an optional
 * validated plan, and the pictures already available. Every model-supplied
 * field is grounded here; anything that fails is replaced by the authored
 * equivalent, so the result is always a valid, renderable design.
 */
export function planCinemaDesign(
  input: Readonly<{
    packId: CreativeDesignPackId;
    scenes: readonly AnyScene[];
    seed: string;
    settings?: CreativeDesignSettings | undefined;
    presetVersionId?: string | null | undefined;
    artDirection?: CinemaArtDirection | undefined;
    proposal?: VisualPlanProposal | undefined;
    modelCallId?: string | null | undefined;
    imagery?: CinemaImageAvailability | undefined;
    locks?: Readonly<Record<string, CinemaCompositionId>> | undefined;
    sectionIds?: Readonly<Record<string, string>> | undefined;
  }>,
): CreativeDesignManifestV2 {
  const proposalBySceneId = new Map(
    (input.proposal?.scenes ?? []).map((entry) => [entry.sceneId, entry]),
  );
  const ordered = [...input.scenes].sort((left, right) => left.order - right.order);
  const planningScenes: CinemaPlanningScene[] = ordered.map((scene) => {
    const proposed = proposalBySceneId.get(scene.id);
    const pinned = input.imagery?.[scene.id] ?? null;
    const bound = scene.assetBindings.some(
      (binding) =>
        binding.visualRole !== "grounding_critical" &&
        ["illustration", "photo", "supporting"].includes(binding.role),
    );
    return {
      scene,
      hasImage:
        pinned !== null ||
        bound ||
        (proposed?.illustration !== undefined && proposed.illustration !== null),
      sectionId:
        input.sectionIds?.[scene.id] ?? scene.sourceRefs[0]?.sectionId ?? undefined,
    };
  });
  const preferences: Record<string, readonly CinemaCompositionId[]> = {};
  for (const [sceneId, proposed] of proposalBySceneId)
    preferences[sceneId] = proposed.compositions;
  const selections = selectCinemaCompositions({
    scenes: planningScenes,
    seed: input.seed,
    preferences,
    ...(input.locks === undefined ? {} : { locks: input.locks }),
  });
  const sectionOrder: string[] = [];
  for (const entry of planningScenes)
    if (entry.sectionId !== undefined && !sectionOrder.includes(entry.sectionId))
      sectionOrder.push(entry.sectionId);
  const artDirection = cinemaArtDirectionSchema.parse({
    ...(input.artDirection ?? cinemaPackArtDirection[input.packId]),
    ...(input.proposal?.artDirection?.treatment === undefined
      ? {}
      : { treatment: input.proposal.artDirection.treatment }),
    ...(input.proposal?.artDirection?.subjects === undefined
      ? {}
      : { subjects: input.proposal.artDirection.subjects }),
    ...(input.proposal?.artDirection?.humanFigures === undefined
      ? {}
      : { humanFigures: input.proposal.artDirection.humanFigures }),
  });
  let chapterCount = 0;
  const scenes: Record<string, CinemaSceneDesign> = {};
  for (const [index, entry] of planningScenes.entries()) {
    const { scene } = entry;
    const selection = selections[scene.id]!;
    const proposed = proposalBySceneId.get(scene.id);
    const { display } = groundCinemaDisplay(scene, {
      headline: proposed?.headline,
      emphasis: proposed?.emphasis,
      kicker: proposed?.kicker,
    });
    const proposedBeats = groundCinemaBeats(
      selection.compositionId,
      scene,
      (proposed?.beats ?? []).map((beat) => ({
        target: beat.target,
        motion: beat.motion,
        anchor: {
          sentence: beat.sentence,
          ...(beat.phrase === undefined ? {} : { phrase: beat.phrase }),
        },
      })),
    );
    const beats =
      proposedBeats.length >= 2
        ? proposedBeats
        : authoredCinemaBeats(selection.compositionId, scene);
    const motifs = motifByTemplate[scene.template];
    const motif =
      motifs[
        Math.floor(cinemaSeededUnit(input.seed, `${scene.id}:motif`) * motifs.length)
      ] ?? motifs[0]!;
    const isChapter = cinemaComposition(selection.compositionId).family === "chapter";
    if (isChapter) chapterCount += 1;
    const sectionNumber =
      entry.sectionId === undefined ? -1 : sectionOrder.indexOf(entry.sectionId);
    scenes[scene.id] = cinemaSceneDesignSchema.parse({
      compositionId: selection.compositionId,
      compositionVersion: cinemaCompositionVersion,
      locked: selection.locked,
      requiredHoldFrames: cinemaHoldFrames(selection.compositionId, scene),
      chapter: isChapter
        ? Math.min(99, sectionNumber >= 0 ? sectionNumber + 1 : chapterCount || index + 1)
        : null,
      display,
      imagery: {
        hero: input.imagery?.[scene.id] ?? null,
        brief:
          proposed?.illustration === undefined || proposed.illustration === null
            ? null
            : proposed.illustration,
        motif,
      },
      beats,
    });
  }
  return creativeDesignManifestV2Schema.parse({
    manifestVersion: creativeDesignManifestV2Version,
    plannerVersion: cinemaPlannerVersion,
    compositionRelease: cinemaCompositionRelease,
    pack: { id: input.packId, version: creativeDesignPackVersion },
    approach: "standard",
    settings: input.settings ?? creativeDesignPackDefaultSettings[input.packId],
    presetVersionId: input.presetVersionId ?? null,
    variationSeed: input.seed,
    artDirection,
    plan: {
      source: input.proposal === undefined ? "authored" : "model",
      planVersion: visualPlanVersion,
      modelCallId: input.modelCallId ?? null,
    },
    scenes,
  });
}

/**
 * Deterministic preflight for a v2 manifest against the scenes it designs.
 * Mirrors the v1 checks (contrast, coverage, fit) and adds content
 * eligibility, grounded display wording and addressable beats, so a manifest
 * submitted through the API can never carry an ungrounded claim.
 */
export function validateCreativeDesignManifestV2(
  manifest: CreativeDesignManifestV2,
  scenes: readonly AnyScene[],
): readonly string[] {
  const issues: string[] = [];
  const { colors } = manifest.settings;
  if (creativeDesignContrastRatio(colors.text, colors.background) < 4.5)
    issues.push("Text color must have at least 4.5:1 contrast against the background.");
  if (creativeDesignContrastRatio(colors.text, colors.surface) < 4.5)
    issues.push("Text color must have at least 4.5:1 contrast against the surface.");
  if (creativeDesignContrastRatio(colors.accent, colors.background) < 3)
    issues.push("Accent color must have at least 3:1 contrast against the background.");
  for (const scene of scenes) {
    const design = manifest.scenes[scene.id];
    if (design === undefined) {
      issues.push(`Scene ${scene.id} has no resolved composition.`);
      continue;
    }
    const eligibility = cinemaCompositionEligibility(design.compositionId, scene);
    if (!eligibility.eligible) {
      issues.push(`Scene ${scene.id}: ${eligibility.reason}`);
      continue;
    }
    if (design.requiredHoldFrames + 30 > Math.floor(scene.durationSeconds * 30))
      issues.push(`Scene ${scene.id} is too short for its readable hold.`);
    // A pinned hero displaces the scene's own picture; evidence may be
    // replaced only by evidence (ST-110 AC5).
    if (
      design.imagery.hero !== null &&
      design.imagery.hero.origin !== "source_figure" &&
      cinemaSceneHasEvidencePicture(scene)
    )
      issues.push(`Scene ${scene.id} shows evidence that a presentation illustration cannot replace.`);
    const approved = cinemaApprovedSceneText(scene);
    // The authored fallback headline ("How it happens", "What to remember")
    // is fixed generic wording, like a generic kicker: it adds no claim.
    if (
      design.display.headline !== defaultHeadline(scene) &&
      !isGroundedDisplayWording(design.display.headline, approved)
    )
      issues.push(`Scene ${scene.id} headline contains wording not in its approved content.`);
    if (!isAcceptableKicker(design.display.kicker, approved))
      issues.push(`Scene ${scene.id} label contains wording not in its approved content.`);
    const primary = cinemaPrimaryText(scene, design.display);
    for (const word of design.display.emphasis)
      if (!primary.split(/\s+/u).some((entry) => entry.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "") === word))
        issues.push(`Scene ${scene.id} emphasises "${word}", which is not in its primary text.`);
    const targets = cinemaBeatTargets(design.compositionId, scene);
    const sentences = narrationSentences(scene.narration);
    for (const beat of design.beats) {
      if (!targets.has(beat.target))
        issues.push(`Scene ${scene.id} beat addresses "${beat.target}", which its composition does not show.`);
      if (beat.anchor.sentence >= Math.max(1, sentences.length))
        issues.push(`Scene ${scene.id} beat is anchored past the end of its narration.`);
    }
  }
  for (const sceneId of Object.keys(manifest.scenes))
    if (!scenes.some((scene) => scene.id === sceneId))
      issues.push(`Saved composition ${sceneId} does not belong to this lesson.`);
  return Object.freeze(issues);
}

/** Validates either release against full scene specs. */
export function validateAnyCreativeDesignManifest(
  manifest: AnyCreativeDesignManifest,
  scenes: readonly AnyScene[],
): readonly string[] {
  return isCreativeDesignManifestV2(manifest)
    ? validateCreativeDesignManifestV2(manifest, scenes)
    : validateCreativeDesignManifest(
        manifest,
        scenes.map((scene) => ({
          id: scene.id,
          template: scene.template,
          durationSeconds: scene.durationSeconds,
        })),
      );
}

/**
 * The v2 design a new storyboard revision inherits (the v2 counterpart of
 * `carryForwardCreativeDesignManifest`). A still-valid design is kept as is;
 * otherwise the same pack, settings, seed and art direction are re-planned,
 * keeping every lock and pinned picture that still fits.
 */
export function carryForwardCinemaDesign(
  input: Readonly<{
    previous: CreativeDesignManifestV2;
    scenes: readonly AnyScene[];
  }>,
): CreativeDesignManifestV2 | undefined {
  if (validateCreativeDesignManifestV2(input.previous, input.scenes).length === 0)
    return input.previous;
  const locks: Record<string, CinemaCompositionId> = {};
  const imagery: Record<string, CinemaSceneImagery["hero"]> = {};
  for (const scene of input.scenes) {
    const design = input.previous.scenes[scene.id];
    if (design === undefined) continue;
    if (design.locked && cinemaCompositionEligibility(design.compositionId, scene).eligible)
      locks[scene.id] = design.compositionId;
    if (design.imagery.hero !== null) imagery[scene.id] = design.imagery.hero;
  }
  try {
    const manifest = planCinemaDesign({
      packId: input.previous.pack.id,
      scenes: input.scenes,
      seed: input.previous.variationSeed,
      settings: input.previous.settings,
      presetVersionId: input.previous.presetVersionId,
      artDirection: input.previous.artDirection,
      imagery,
      locks,
    });
    return validateCreativeDesignManifestV2(manifest, input.scenes).length === 0
      ? manifest
      : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Presentation illustrations (ST-110)
// ---------------------------------------------------------------------------

/** Identifies the v2 hero illustration request and its prompt construction. */
export const cinemaIllustrationPromptVersion = "cinema-illustration-v2" as const;
/** The candidate slot a v2 hero illustration is recorded under; not a template slot. */
export const cinemaHeroSlot = "cinema-hero" as const;
export const cinemaIllustrationsPerFiveMinutes = 8;
export const cinemaIllustrationCap = 12;

type SceneAssetBinding = SceneSpec["assetBindings"][number];

const heroPictureRoles = ["diagram", "icon", "illustration", "photo", "supporting"];

/**
 * The scene's own picture for the hero position (hook subject, definition
 * example, analogy or summary central visual, labelled-diagram base). Shared
 * by the renderer, planning and validation so they agree on what a pinned
 * presentation illustration would cover.
 */
export function cinemaHeroSlotBinding(scene: AnyScene): SceneAssetBinding | undefined {
  switch (scene.template) {
    case "hook":
      return scene.assetBindings.find((binding) =>
        ["icon", "illustration", "photo"].includes(binding.role),
      );
    case "definition":
      return scene.assetBindings.find(
        (binding) => binding.slot === "visual-example" && heroPictureRoles.includes(binding.role),
      );
    case "analogy":
      return scene.assetBindings.find(
        (binding) => binding.slot === "central-visual" && binding.role === "illustration",
      );
    case "summary":
      return scene.visual.centralAssetSlot === undefined
        ? undefined
        : scene.assetBindings.find(
            (binding) =>
              binding.slot === scene.visual.centralAssetSlot && binding.role === "illustration",
          );
    case "labelled-diagram":
      return scene.visual.kind === "asset"
        ? scene.assetBindings.find(
            (binding) => binding.slot === scene.visual.baseAssetSlot && binding.role === "diagram",
          )
        : undefined;
    default:
      return undefined;
  }
}

/**
 * True when the hero position carries evidence: a labelled diagram (drawn or
 * bound) or a diagram, grounding-critical or source-derived picture. A pinned
 * hero displaces that picture in the renderer, so only a source figure may be
 * pinned there (ST-110 AC5).
 */
export function cinemaSceneHasEvidencePicture(scene: AnyScene): boolean {
  if (scene.template === "labelled-diagram") return true;
  const binding = cinemaHeroSlotBinding(scene);
  return (
    binding !== undefined &&
    (binding.role === "diagram" ||
      binding.visualRole === "grounding_critical" ||
      binding.visualRole === "source_derived")
  );
}

/** Unique generated illustrations a video of this length may request. */
export function cinemaIllustrationBudget(targetDurationSeconds: number): number {
  const allowance = Math.ceil(
    (cinemaIllustrationsPerFiveMinutes * Math.max(0, targetDurationSeconds)) / 300,
  );
  return Math.min(cinemaIllustrationCap, Math.max(1, allowance));
}

/** Deduplication key: one generated picture per concept and treatment. */
export function cinemaIllustrationKey(
  concept: string,
  treatment: CinemaIllustrationTreatment,
): string {
  const normalised = concept
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter((word) => word.length > 0 && !stopWords.has(word))
    // Fold plurals only: "jars" and "jar" are one concept.
    .map((word) => (word.length > 3 && /[^s]s$/u.test(word) ? word.slice(0, -1) : word))
    .join(" ");
  return `${treatment}:${normalised}`.slice(0, 200);
}

export type CinemaIllustrationBrief = NonNullable<CinemaSceneImagery["brief"]>;
export type CinemaIllustrationPalette = Pick<
  CreativeDesignSettings["colors"],
  "accent" | "diagramEmphasis" | "surface"
>;

/**
 * The image prompt: the plan's brief plus the video's shared art direction.
 * Built only from the brief, never from source or lesson text.
 */
export function cinemaIllustrationPrompt(
  input: Readonly<{
    brief: CinemaIllustrationBrief;
    artDirection: CinemaArtDirection;
    palette: CinemaIllustrationPalette;
  }>,
): string {
  return `${input.brief.description} Main subject: ${input.brief.concept}. ${cinemaArtDirectionBrief(
    input.artDirection,
    { colors: input.palette },
  )}`.slice(0, 2_000);
}

const paletteColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const cinemaIllustrationJobPayloadSchema = z
  .object({
    schemaVersion: z.literal(2),
    candidateId: identifierSchema,
    /** ST-105. The prompt-to-video run that authorised this paid call. */
    oneShotRunId: identifierSchema.optional(),
    draftId: identifierSchema,
    /** Every scene the deduplicated picture is bound to. */
    sceneIds: z.array(identifierSchema).min(1).max(60),
    key: z.string().min(1).max(200),
    brief: cinemaSceneImagerySchema.shape.brief.unwrap(),
    artDirection: cinemaArtDirectionSchema,
    palette: z
      .object({ accent: paletteColor, diagramEmphasis: paletteColor, surface: paletteColor })
      .strict(),
  })
  .strict();
export type CinemaIllustrationJobPayload = z.infer<typeof cinemaIllustrationJobPayloadSchema>;

export type CinemaIllustrationReusable = Readonly<
  Record<string, Readonly<{ assetId: string; origin: "generated" | "project_asset" | "library" }>>
>;

type CinemaMotifReason = "over_budget" | "evidence_picture" | "no_people";

export type CinemaIllustrationPlan = Readonly<{
  budget: number;
  /** New pictures to generate, one per concept and treatment. */
  generate: readonly Readonly<{
    key: string;
    brief: CinemaIllustrationBrief;
    sceneIds: readonly string[];
  }>[];
  /** Scenes that take an already available picture of the same concept. */
  reuse: readonly Readonly<{
    sceneId: string;
    hero: NonNullable<CinemaSceneImagery["hero"]>;
  }>[];
  /** Scenes that keep their authored motif, and why. */
  motif: readonly Readonly<{ sceneId: string; reason: CinemaMotifReason }>[];
}>;

/**
 * Decides which scenes get which picture, in the ADR-015 order: the scene's
 * own (source) picture, a pinned hero or an available picture of the same
 * concept and treatment, a new generated picture within budget, then the
 * authored motif. Only scenes whose composition shows a picture are
 * considered, and none whose hero position carries evidence (AC5). When the
 * budget is short, picture-led compositions are served first.
 */
export function planCinemaIllustrations(
  input: Readonly<{
    manifest: CreativeDesignManifestV2;
    scenes: readonly AnyScene[];
    targetDurationSeconds: number;
    /** Pictures already generated for this project, by illustration key. */
    reusable?: CinemaIllustrationReusable | undefined;
    /** Unique pictures already generated for this lesson against the budget. */
    alreadyGenerated?: number | undefined;
    /** Keys already requested (in flight or failed): never requested again. */
    requested?: ReadonlySet<string> | undefined;
  }>,
): CinemaIllustrationPlan {
  const budget = cinemaIllustrationBudget(input.targetDurationSeconds);
  const { treatment, humanFigures } = input.manifest.artDirection;
  const reuse: { sceneId: string; hero: NonNullable<CinemaSceneImagery["hero"]> }[] = [];
  const motif: { sceneId: string; reason: CinemaMotifReason }[] = [];
  const wanted = new Map<
    string,
    { brief: CinemaIllustrationBrief; sceneIds: string[]; central: boolean; order: number }
  >();
  for (const scene of [...input.scenes].sort((left, right) => left.order - right.order)) {
    const design = input.manifest.scenes[scene.id];
    if (design === undefined || design.imagery.hero !== null || design.imagery.brief === null)
      continue;
    const imageUse = cinemaComposition(design.compositionId).imageUse;
    if (imageUse === "none") continue;
    if (cinemaSceneHasEvidencePicture(scene)) {
      motif.push({ sceneId: scene.id, reason: "evidence_picture" });
      continue;
    }
    // The scene's own picture is shown: nothing to generate.
    if (cinemaHeroSlotBinding(scene) !== undefined) continue;
    const { brief } = design.imagery;
    if (brief.subject === "person" && !humanFigures) {
      motif.push({ sceneId: scene.id, reason: "no_people" });
      continue;
    }
    const key = cinemaIllustrationKey(brief.concept, treatment);
    const available = input.reusable?.[key];
    if (available !== undefined) {
      reuse.push({
        sceneId: scene.id,
        hero: { assetId: available.assetId, origin: available.origin, altText: brief.description },
      });
      continue;
    }
    if (input.requested?.has(key) === true) continue;
    const existing = wanted.get(key);
    if (existing === undefined)
      wanted.set(key, { brief, sceneIds: [scene.id], central: imageUse === "central", order: scene.order });
    else {
      existing.sceneIds.push(scene.id);
      existing.central ||= imageUse === "central";
    }
  }
  const remaining = Math.max(0, budget - (input.alreadyGenerated ?? 0));
  const ranked = [...wanted.entries()].sort(
    ([, left], [, right]) => Number(right.central) - Number(left.central) || left.order - right.order,
  );
  for (const [, value] of ranked.slice(remaining))
    for (const sceneId of value.sceneIds) motif.push({ sceneId, reason: "over_budget" });
  return Object.freeze({
    budget,
    generate: Object.freeze(
      ranked.slice(0, remaining).map(([key, value]) =>
        Object.freeze({ key, brief: value.brief, sceneIds: Object.freeze(value.sceneIds) }),
      ),
    ),
    reuse: Object.freeze(reuse),
    motif: Object.freeze(motif),
  });
}
