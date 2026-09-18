/**
 * ST-094 — treatment ID to component. Kept separate from `registry.ts` so the
 * resolver and the validator can reason about treatment metadata in a plain
 * Node context without pulling React and the bundled assets in with it.
 */

import type { JSX } from "react";
import type { StyleProofTreatmentId } from "@avlp/schemas/style-proof";
import {
  EssentialComparison,
  EssentialDefinition,
  EssentialHook,
} from "./essential.js";
import {
  EditorialComparison,
  EditorialDefinition,
  EditorialHook,
} from "./editorial.js";
import {
  EverydayComparison,
  EverydayDefinition,
  EverydayHook,
} from "./everyday.js";
import type { StyleProofTreatmentProps } from "./types.js";

export type StyleProofTreatmentComponent = (
  props: StyleProofTreatmentProps,
) => JSX.Element;

export const styleProofTreatmentComponents: Readonly<
  Record<StyleProofTreatmentId, StyleProofTreatmentComponent>
> = Object.freeze({
  "essential.hook.isolated-question": EssentialHook,
  "essential.definition.central-subject": EssentialDefinition,
  "essential.comparison.sequential-emphasis": EssentialComparison,
  "editorial.hook.headline-beside-frame": EditorialHook,
  "editorial.definition.annotated-evidence": EditorialDefinition,
  "editorial.comparison.evidence-panels": EditorialComparison,
  "everyday.hook.illustrated-situation": EverydayHook,
  "everyday.definition.labelled-objects": EverydayDefinition,
  "everyday.comparison.paired-scenarios": EverydayComparison,
});

export * from "./types.js";
