/**
 * ST-094 — deterministic treatment resolver.
 *
 * Resolution happens once, before preview or render. It never falls back to the
 * newest pack version, never substitutes a different style, and never invents a
 * replacement asset: an unsupported input produces a structured issue naming the
 * field and a correction the caller can actually act on (CR-01).
 */

import {
  styleProofPackIdSchema,
  styleProofPackVersion,
  styleProofSceneTypeSchema,
  styleProofTreatmentIdSchema,
  type StyleProofAsset,
  type StyleProofAssetSlot,
  type StyleProofIssue,
  type StyleProofSceneType,
  type StyleProofScene,
  type StyleProofSelection,
} from "@avlp/schemas/style-proof";
import {
  findStyleProofTreatment,
  treatmentForPackAndSceneType,
  type StyleProofTreatmentMetadata,
} from "./registry.js";

export type ResolvedStyleProofAssets = Readonly<
  Record<string, StyleProofAsset>
>;

export type ResolvedStyleProofScene = Readonly<{
  scene: StyleProofScene;
  sceneType: StyleProofSceneType;
  treatment: StyleProofTreatmentMetadata;
  /** Slot name → resolved asset. Optional slots may be absent. */
  assets: ResolvedStyleProofAssets;
}>;

export type StyleProofResolution = Readonly<{
  issues: readonly StyleProofIssue[];
  scenes: readonly ResolvedStyleProofScene[];
}>;

const issue = (
  code: StyleProofIssue["code"],
  sceneId: string,
  fieldPath: string,
  message: string,
  suggestedCorrection: string,
): StyleProofIssue =>
  Object.freeze({ code, fieldPath, message, sceneId, suggestedCorrection });

function resolveSlot(
  sceneId: string,
  treatment: StyleProofTreatmentMetadata,
  assetSlot: StyleProofAssetSlot,
  assetId: string | undefined,
  library: ResolvedStyleProofAssets,
): Readonly<{ asset?: StyleProofAsset; issues: readonly StyleProofIssue[] }> {
  const fieldPath = `selection.sceneDesigns.${sceneId}.assetBySlot.${assetSlot.slot}`;
  if (assetId === undefined) {
    if (!assetSlot.required) return Object.freeze({ issues: [] });
    return Object.freeze({
      issues: [
        issue(
          "missing_required_asset",
          sceneId,
          fieldPath,
          `Treatment ${treatment.id} requires an asset in its "${assetSlot.slot}" slot.`,
          `Bind a ${assetSlot.acceptedKinds.join(" or ")} asset of at least ${assetSlot.minWidth}x${assetSlot.minHeight} to "${assetSlot.slot}", or select a treatment that does not require it.`,
        ),
      ],
    });
  }
  const asset = library[assetId];
  if (asset === undefined)
    return Object.freeze({
      issues: [
        issue(
          "missing_required_asset",
          sceneId,
          fieldPath,
          `Asset "${assetId}" is not present in the proof asset library.`,
          "Bind an asset that exists in the bundled proof library; the render never fetches a replacement.",
        ),
      ],
    });
  const issues: StyleProofIssue[] = [];
  if (!assetSlot.acceptedKinds.includes(asset.kind))
    issues.push(
      issue(
        "unsupported_asset_kind",
        sceneId,
        fieldPath,
        `Slot "${assetSlot.slot}" accepts ${assetSlot.acceptedKinds.join(" or ")} media, but "${assetId}" is ${asset.kind}.`,
        `Bind a ${assetSlot.acceptedKinds.join(" or ")} asset, or choose a treatment whose slot accepts ${asset.kind} media.`,
      ),
    );
  if (asset.width < assetSlot.minWidth || asset.height < assetSlot.minHeight)
    issues.push(
      issue(
        "asset_resolution_too_low",
        sceneId,
        fieldPath,
        `Slot "${assetSlot.slot}" needs at least ${assetSlot.minWidth}x${assetSlot.minHeight}; "${assetId}" is ${asset.width}x${asset.height}.`,
        "Supply a higher-resolution version of this asset. The treatment will not upscale it, because doing so would present unreadable evidence as readable.",
      ),
    );
  return issues.length > 0
    ? Object.freeze({ issues })
    : Object.freeze({ asset, issues: [] });
}

/**
 * Resolves every scene's treatment and assets. Returns all issues rather than
 * throwing on the first, so the development gallery can show a complete list.
 *
 * **Invariant:** a scene that produced any issue is never present in `scenes`.
 * Consumers may therefore render everything in `scenes` without re-checking
 * `issues`, and a future caller cannot accidentally draw a flagged scene by
 * reading only one half of the result. Asserted in `style-proof-contract.test`.
 */
export function resolveStyleProofScenes(
  scenes: readonly StyleProofScene[],
  selection: StyleProofSelection,
  library: ResolvedStyleProofAssets,
): StyleProofResolution {
  const issues: StyleProofIssue[] = [];
  const resolved: ResolvedStyleProofScene[] = [];

  if (!styleProofPackIdSchema.safeParse(selection.pack.id).success) {
    issues.push(
      issue(
        "unknown_pack",
        "lesson",
        "selection.pack.id",
        `Unknown style pack "${String(selection.pack.id)}".`,
        "Select one of the registered proof packs: essential, editorial or everyday.",
      ),
    );
    return Object.freeze({ issues: Object.freeze(issues), scenes: [] });
  }
  if (selection.pack.version !== styleProofPackVersion) {
    issues.push(
      issue(
        "unsupported_pack_version",
        "lesson",
        "selection.pack.version",
        `Style pack "${selection.pack.id}" version "${String(selection.pack.version)}" is not available in this implementation.`,
        `Pin version ${styleProofPackVersion}, or retain the implementation bundle that published the requested version. The newest version is never selected automatically.`,
      ),
    );
    return Object.freeze({ issues: Object.freeze(issues), scenes: [] });
  }

  for (const scene of scenes) {
    const design = selection.sceneDesigns[scene.id];
    const sceneTypeResult = styleProofSceneTypeSchema.safeParse(scene.template);
    if (!sceneTypeResult.success) {
      issues.push(
        issue(
          "treatment_scene_type_mismatch",
          scene.id,
          "template",
          `The proof does not cover "${scene.template}" scenes.`,
          "Use a hook, definition or comparison scene; full scene-type coverage is later production work.",
        ),
      );
      continue;
    }
    const sceneType = sceneTypeResult.data;
    if (design === undefined) {
      issues.push(
        issue(
          "unknown_treatment",
          scene.id,
          `selection.sceneDesigns.${scene.id}`,
          "This scene has no resolved treatment.",
          `Resolve a treatment before rendering; ${selection.pack.id} uses ${treatmentForPackAndSceneType(selection.pack.id, sceneType)?.id ?? "no registered treatment"} for a ${sceneType} scene.`,
        ),
      );
      continue;
    }
    if (!styleProofTreatmentIdSchema.safeParse(design.treatmentId).success) {
      issues.push(
        issue(
          "unknown_treatment",
          scene.id,
          `selection.sceneDesigns.${scene.id}.treatmentId`,
          `Unknown treatment "${String(design.treatmentId)}".`,
          "Select a registered treatment ID; the resolver never guesses a nearby treatment.",
        ),
      );
      continue;
    }
    const treatment = findStyleProofTreatment(design.treatmentId);
    if (treatment === undefined) {
      issues.push(
        issue(
          "unknown_treatment",
          scene.id,
          `selection.sceneDesigns.${scene.id}.treatmentId`,
          `Treatment "${design.treatmentId}" is not registered in this implementation.`,
          "Retain the implementation bundle that registered it, or resolve a treatment this bundle provides.",
        ),
      );
      continue;
    }
    if (design.treatmentVersion !== treatment.version) {
      issues.push(
        issue(
          "unsupported_treatment_version",
          scene.id,
          `selection.sceneDesigns.${scene.id}.treatmentVersion`,
          `Treatment "${treatment.id}" version "${String(design.treatmentVersion)}" is not available; this bundle provides ${treatment.version}.`,
          `Pin ${treatment.version} or retain the bundle that published the requested version.`,
        ),
      );
      continue;
    }
    if (treatment.packId !== selection.pack.id) {
      issues.push(
        issue(
          "unknown_treatment",
          scene.id,
          `selection.sceneDesigns.${scene.id}.treatmentId`,
          `Treatment "${treatment.id}" belongs to the ${treatment.packId} pack, but the selected pack is ${selection.pack.id}.`,
          `Use ${treatmentForPackAndSceneType(selection.pack.id, sceneType)?.id ?? "a treatment from the selected pack"}. Mixing packs within one lesson is not supported.`,
        ),
      );
      continue;
    }
    if (treatment.sceneType !== sceneType) {
      issues.push(
        issue(
          "treatment_scene_type_mismatch",
          scene.id,
          `selection.sceneDesigns.${scene.id}.treatmentId`,
          `Treatment "${treatment.id}" presents ${treatment.sceneType} scenes, but scene ${scene.id} is a ${sceneType} scene.`,
          `Use ${treatmentForPackAndSceneType(treatment.packId, sceneType)?.id ?? "a treatment registered for this scene type"}.`,
        ),
      );
      continue;
    }

    const knownSlots = new Set(
      treatment.assetSlots.map((assetSlot) => assetSlot.slot),
    );
    let sceneBlocked = false;
    for (const boundSlot of Object.keys(design.assetBySlot))
      if (!knownSlots.has(boundSlot)) {
        issues.push(
          issue(
            "unsupported_design_instruction",
            scene.id,
            `selection.sceneDesigns.${scene.id}.assetBySlot.${boundSlot}`,
            `Treatment "${treatment.id}" declares no "${boundSlot}" slot.`,
            `Bind only its declared slots: ${[...knownSlots].join(", ") || "none"}. A treatment's layout is not addressable from input.`,
          ),
        );
        // Blocking, not advisory. A caller that addressed a slot the treatment
        // does not have has misunderstood the design it selected, and the
        // invariant below guarantees no consumer can render such a scene.
        sceneBlocked = true;
      }

    const assets: Record<string, StyleProofAsset> = {};
    for (const assetSlot of treatment.assetSlots) {
      const result = resolveSlot(
        scene.id,
        treatment,
        assetSlot,
        design.assetBySlot[assetSlot.slot],
        library,
      );
      issues.push(...result.issues);
      if (result.issues.length > 0) sceneBlocked = true;
      if (result.asset !== undefined) assets[assetSlot.slot] = result.asset;
    }
    if (sceneBlocked) continue;
    resolved.push(
      Object.freeze({
        assets: Object.freeze(assets),
        scene,
        sceneType,
        treatment,
      }),
    );
  }

  return Object.freeze({
    issues: Object.freeze(issues),
    scenes: Object.freeze(resolved),
  });
}

/**
 * Builds the selection a pack would use for a set of scenes. This is the
 * authoring-time helper; its output is persisted in a fixture and rendering
 * consumes that resolved output rather than calling this again.
 */
export function selectionForPack(
  packId: StyleProofSelection["pack"]["id"],
  scenes: readonly StyleProofScene[],
  assetBySceneId: Readonly<Record<string, Readonly<Record<string, string>>>>,
): StyleProofSelection {
  const sceneDesigns: Record<
    string,
    StyleProofSelection["sceneDesigns"][string]
  > = {};
  for (const scene of scenes) {
    const sceneType = styleProofSceneTypeSchema.parse(scene.template);
    const treatment = treatmentForPackAndSceneType(packId, sceneType);
    if (treatment === undefined)
      throw new Error(
        `No registered ${packId} treatment for a ${sceneType} scene.`,
      );
    sceneDesigns[scene.id] = Object.freeze({
      assetBySlot: Object.freeze({ ...(assetBySceneId[scene.id] ?? {}) }),
      treatmentId: treatment.id,
      treatmentVersion: treatment.version,
    });
  }
  return Object.freeze({
    pack: Object.freeze({ id: packId, version: styleProofPackVersion }),
    sceneDesigns: Object.freeze(sceneDesigns),
  });
}
