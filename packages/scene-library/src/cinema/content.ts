/**
 * ST-108 — which pictures a v2 scene shows.
 *
 * Order for the hero picture: the manifest's pinned presentation illustration,
 * then the scene's own hero slot (hook subject, definition example, analogy
 * or summary central visual, labelled-diagram base), then an authored motif.
 * Item pictures come from the scene's own per-item slots. In render mode a
 * bound or pinned picture that did not resolve is an error (CR-01); preview
 * shows the authored motif instead so a teacher can keep working.
 */
import {
  cinemaSceneItems,
  cinemaSequenceStops,
  type CinemaSceneDesign,
  type SceneSpec,
} from "@avlp/schemas";
import {
  resolveSafeDiagramAsset,
  resolveSafeTableVisual,
  type ResolvedSceneAsset,
} from "../scene-registry.js";
import type { CinemaHero, CinemaIcon } from "./primitives.js";

type Assets = Readonly<Record<string, ResolvedSceneAsset>> | undefined;
type Mode = "preview" | "render";

const pictureRoles = ["diagram", "icon", "illustration", "photo", "supporting"];

function heroSlotBinding(scene: SceneSpec) {
  switch (scene.template) {
    case "hook":
      return scene.assetBindings.find((binding) =>
        ["icon", "illustration", "photo"].includes(binding.role),
      );
    case "definition":
      return scene.assetBindings.find(
        (binding) => binding.slot === "visual-example" && pictureRoles.includes(binding.role),
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

function missing(sceneId: string, what: string): Error {
  return new Error(`Scene render blocked for ${sceneId}: ${what} could not be resolved safely.`);
}

export function resolveCinemaHero(
  input: Readonly<{ scene: SceneSpec; design: CinemaSceneDesign; assets: Assets; mode: Mode }>,
): CinemaHero {
  const { scene, design, assets, mode } = input;
  const pinned = design.imagery.hero;
  if (pinned !== null) {
    const resolved = resolveSafeDiagramAsset(pinned.assetId, assets);
    if (resolved?.src !== undefined)
      return {
        kind: "image",
        src: resolved.src,
        alt: pinned.altText,
        evidence: pinned.origin === "source_figure",
      };
    if (mode === "render") throw missing(scene.id, "the pinned illustration");
  }
  const binding = heroSlotBinding(scene);
  if (binding !== undefined) {
    const table = resolveSafeTableVisual(binding.assetId, assets);
    if (table?.table !== undefined)
      return { kind: "table", table: table.table, alt: table.altText };
    const image = resolveSafeDiagramAsset(binding.assetId, assets);
    if (image?.src !== undefined)
      return {
        kind: "image",
        src: image.src,
        alt: binding.altText ?? image.altText,
        evidence:
          binding.role === "diagram" ||
          binding.visualRole === "grounding_critical" ||
          binding.visualRole === "source_derived",
      };
    if (mode === "render") throw missing(scene.id, `the "${binding.slot ?? binding.role}" picture`);
  }
  if (scene.template === "labelled-diagram" && scene.visual.kind === "shapes")
    return { kind: "shape", shape: scene.visual.shape ?? "system" };
  return { kind: "motif", motif: design.imagery.motif };
}

/** True when the hero is a real picture (not an authored fallback). */
export function isPictureHero(hero: CinemaHero): boolean {
  return hero.kind === "image" || hero.kind === "table";
}

function iconFor(
  scene: SceneSpec,
  slot: string | undefined,
  assets: Assets,
  mode: Mode,
): CinemaIcon | undefined {
  if (slot === undefined) return undefined;
  const binding = scene.assetBindings.find(
    (entry) => entry.slot === slot && pictureRoles.includes(entry.role),
  );
  if (binding === undefined) return undefined;
  const resolved = resolveSafeDiagramAsset(binding.assetId, assets);
  if (resolved?.src !== undefined)
    return { src: resolved.src, alt: binding.altText ?? resolved.altText };
  if (mode === "render") throw missing(scene.id, `the "${slot}" picture`);
  return undefined;
}

/**
 * Pictures for the scene's items, aligned with `cinemaSceneItems` — or with
 * `cinemaSequenceStops` when `forSequence` is set.
 */
export function resolveCinemaItemIcons(
  input: Readonly<{ scene: SceneSpec; assets: Assets; mode: Mode; forSequence?: boolean }>,
): readonly (CinemaIcon | undefined)[] {
  const { scene, assets, mode } = input;
  const icon = (slot: string | undefined) => iconFor(scene, slot, assets, mode);
  switch (scene.template) {
    case "process": {
      if (scene.visual.steps !== undefined)
        return scene.visual.steps.map((_, index) => icon(`step-${index + 1}-icon`));
      const nodes = scene.visual.nodes ?? [];
      if (input.forSequence === true) {
        const stops = cinemaSequenceStops(scene) ?? [];
        return stops.map((label) => icon(nodes.find((node) => node.label === label)?.assetSlot));
      }
      return nodes.map((node) => icon(node.assetSlot));
    }
    case "input-process-output": {
      const inputs = scene.visual.inputs.map((item, index) => icon(item.assetSlot ?? `input-${index + 1}-icon`));
      const process = icon(scene.visual.process.assetSlot ?? "process-icon");
      const outputs = scene.visual.outputs.map((item, index) => icon(item.assetSlot ?? `output-${index + 1}-icon`));
      if (input.forSequence === true) return [inputs[0], process, outputs[0]];
      return [...inputs, process, ...outputs];
    }
    case "cause-effect": {
      if (scene.visual.nodes !== undefined) {
        const nodes = scene.visual.nodes;
        if (input.forSequence === true) {
          const stops = cinemaSequenceStops(scene) ?? [];
          return stops.map((label) => icon(nodes.find((node) => node.label === label)?.assetSlot));
        }
        return nodes.map((node) => icon(node.assetSlot));
      }
      return [
        ...(scene.visual.causes ?? []).map((node) => icon(node.assetSlot)),
        ...(scene.visual.mechanism === undefined ? [] : [icon(scene.visual.mechanism.assetSlot)]),
        ...(scene.visual.effects ?? []).map((node) => icon(node.assetSlot)),
      ];
    }
    default:
      return (input.forSequence === true
        ? (cinemaSequenceStops(scene) ?? [])
        : cinemaSceneItems(scene)
      ).map(() => undefined);
  }
}

/** The two subject pictures of a comparison scene. */
export function resolveCinemaSubjectImages(
  input: Readonly<{ scene: SceneSpec; assets: Assets; mode: Mode }>,
): Readonly<{ left?: CinemaIcon | undefined; right?: CinemaIcon | undefined }> {
  const { scene, assets, mode } = input;
  if (scene.template !== "comparison") return {};
  return {
    left: iconFor(scene, scene.visual.leftSubject.assetSlot ?? "left-subject-image", assets, mode),
    right: iconFor(scene, scene.visual.rightSubject.assetSlot ?? "right-subject-image", assets, mode),
  };
}
