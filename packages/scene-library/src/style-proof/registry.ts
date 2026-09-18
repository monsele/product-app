/**
 * ST-094 — proof treatment registry.
 *
 * Each treatment declares what it needs (input limits, asset slots, motion
 * signature) separately from how it draws. Registration metadata is data, so
 * the resolver and the validator can reason about a treatment without rendering
 * it, and so a caller can never hand a treatment a layout instruction.
 */

import {
  styleProofPackVersion,
  type StyleProofAssetSlot,
  type StyleProofPackId,
  type StyleProofSceneType,
  type StyleProofTreatmentId,
} from "@avlp/schemas/style-proof";
import type { StyleProofMotionSignature } from "@avlp/schemas/style-proof";

export type StyleProofContentLimits = Readonly<{
  /** Field path → the longest string the treatment lays out correctly. */
  textLimits: Readonly<Record<string, number>>;
  /** Field path → the most list items the treatment lays out correctly. */
  itemLimits: Readonly<Record<string, number>>;
}>;

export type StyleProofTreatmentMetadata = Readonly<{
  id: StyleProofTreatmentId;
  version: typeof styleProofPackVersion;
  packId: StyleProofPackId;
  sceneType: StyleProofSceneType;
  motionSignature: StyleProofMotionSignature;
  assetSlots: readonly StyleProofAssetSlot[];
  limits: StyleProofContentLimits;
  /** One line describing the authored composition, used by the gallery. */
  description: string;
}>;

const slot = (
  name: string,
  options: Readonly<{
    fit: StyleProofAssetSlot["fit"];
    kinds: readonly StyleProofAssetSlot["acceptedKinds"][number][];
    minWidth: number;
    minHeight: number;
    required: boolean;
  }>,
): StyleProofAssetSlot => ({
  slot: name,
  acceptedKinds: [...options.kinds],
  fit: options.fit,
  minWidth: options.minWidth,
  minHeight: options.minHeight,
  required: options.required,
});

/**
 * Essential and Everyday contain-fit everything: their artwork carries meaning
 * to its edges, and cropping a cutout or a labelled illustration would remove
 * information. Only Editorial's photographic frames cover-fit, and only because
 * they carry no burned-in text.
 */
const containVector = {
  fit: "contain" as const,
  kinds: ["vector"] as const,
  minWidth: 300,
  minHeight: 300,
  required: true,
};

const coverRaster = {
  fit: "cover" as const,
  kinds: ["raster"] as const,
  minWidth: 600,
  minHeight: 400,
  required: true,
};

export const styleProofTreatments: readonly StyleProofTreatmentMetadata[] =
  Object.freeze([
    {
      id: "essential.hook.isolated-question",
      version: styleProofPackVersion,
      packId: "essential",
      sceneType: "hook",
      motionSignature: "masked-reveal",
      description:
        "One very large question occupying the left two thirds, with a single isolated subject held in generous empty space on the right.",
      assetSlots: [slot("subject", containVector)],
      limits: {
        textLimits: {
          "visual.question": 80,
          "visual.prompt": 48,
          "visual.supportingElements.item": 12,
        },
        itemLimits: { "visual.supportingElements": 3 },
      },
    },
    {
      id: "essential.definition.central-subject",
      version: styleProofPackVersion,
      packId: "essential",
      sceneType: "definition",
      motionSignature: "masked-reveal",
      description:
        "The subject sits centred and alone; the term is set above it and the explanation below, separated by a drawn rule.",
      assetSlots: [slot("subject", containVector)],
      limits: {
        textLimits: {
          "visual.term": 80,
          "visual.definition": 120,
          "visual.exampleLabel": 48,
          "visual.exampleText": 48,
        },
        itemLimits: {},
      },
    },
    {
      id: "essential.comparison.sequential-emphasis",
      version: styleProofPackVersion,
      packId: "essential",
      sceneType: "comparison",
      motionSignature: "masked-reveal",
      description:
        "Two isolated subjects face each other; differences are emphasised one at a time while the other side dims.",
      assetSlots: [
        slot("subject-left", containVector),
        slot("subject-right", containVector),
      ],
      limits: {
        textLimits: {
          "visual.leftSubject.label": 80,
          "visual.rightSubject.label": 80,
          "visual.differences.item": 80,
          "visual.similarities.item": 80,
        },
        itemLimits: { "visual.differences": 4, "visual.similarities": 3 },
      },
    },
    {
      id: "editorial.hook.headline-beside-frame",
      version: styleProofPackVersion,
      packId: "editorial",
      sceneType: "hook",
      motionSignature: "image-push-annotation",
      description:
        "A bold serif headline block sits against a tall, tightly framed photographic panel that runs to the canvas edge.",
      assetSlots: [slot("evidence", coverRaster)],
      limits: {
        textLimits: {
          "visual.question": 80,
          "visual.prompt": 48,
          "visual.supportingElements.item": 12,
        },
        itemLimits: { "visual.supportingElements": 3 },
      },
    },
    {
      id: "editorial.definition.annotated-evidence",
      version: styleProofPackVersion,
      packId: "editorial",
      sceneType: "definition",
      motionSignature: "image-push-annotation",
      description:
        "A wide photograph carries drawn annotation rules out to a structured term-and-explanation column with a source line.",
      assetSlots: [slot("evidence", coverRaster)],
      limits: {
        textLimits: {
          "visual.term": 80,
          "visual.definition": 120,
          "visual.exampleLabel": 48,
          "visual.exampleText": 48,
        },
        itemLimits: {},
      },
    },
    {
      id: "editorial.comparison.evidence-panels",
      version: styleProofPackVersion,
      packId: "editorial",
      sceneType: "comparison",
      motionSignature: "image-push-annotation",
      description:
        "Two full-height photographic evidence panels with overlaid subject labels, numbered differences and a shared source line.",
      assetSlots: [
        slot("evidence-left", coverRaster),
        slot("evidence-right", coverRaster),
      ],
      limits: {
        textLimits: {
          "visual.leftSubject.label": 80,
          "visual.rightSubject.label": 80,
          "visual.differences.item": 80,
          "visual.similarities.item": 80,
        },
        itemLimits: { "visual.differences": 4, "visual.similarities": 3 },
      },
    },
    {
      id: "everyday.hook.illustrated-situation",
      version: styleProofPackVersion,
      packId: "everyday",
      sceneType: "hook",
      motionSignature: "object-settle",
      description:
        "A short question sits on a rounded card above a wide illustrated situation the learner would recognise.",
      assetSlots: [slot("situation", containVector)],
      limits: {
        textLimits: {
          "visual.question": 80,
          "visual.prompt": 48,
          "visual.supportingElements.item": 12,
        },
        itemLimits: { "visual.supportingElements": 3 },
      },
    },
    {
      id: "everyday.definition.labelled-objects",
      version: styleProofPackVersion,
      packId: "everyday",
      sceneType: "definition",
      motionSignature: "object-settle",
      description:
        "Familiar illustrated objects sit inside a rounded container with the term on a tag and the explanation connected beneath it.",
      assetSlots: [slot("objects", containVector)],
      limits: {
        textLimits: {
          "visual.term": 80,
          "visual.definition": 120,
          "visual.exampleLabel": 48,
          "visual.exampleText": 48,
        },
        itemLimits: {},
      },
    },
    {
      id: "everyday.comparison.paired-scenarios",
      version: styleProofPackVersion,
      packId: "everyday",
      sceneType: "comparison",
      motionSignature: "object-settle",
      description:
        "Two illustrated scenarios drawn in one vocabulary sit side by side on matching cards, with differences as paired chips.",
      assetSlots: [
        slot("scenario-left", containVector),
        slot("scenario-right", containVector),
      ],
      limits: {
        textLimits: {
          "visual.leftSubject.label": 80,
          "visual.rightSubject.label": 80,
          "visual.differences.item": 80,
          "visual.similarities.item": 80,
        },
        itemLimits: { "visual.differences": 4, "visual.similarities": 3 },
      },
    },
  ]);

const byId = new Map<StyleProofTreatmentId, StyleProofTreatmentMetadata>(
  styleProofTreatments.map((treatment) => [treatment.id, treatment]),
);

export function findStyleProofTreatment(
  id: StyleProofTreatmentId,
): StyleProofTreatmentMetadata | undefined {
  return byId.get(id);
}

/** The registered treatment a pack uses for a semantic scene type. */
export function treatmentForPackAndSceneType(
  packId: StyleProofPackId,
  sceneType: StyleProofSceneType,
): StyleProofTreatmentMetadata | undefined {
  return styleProofTreatments.find(
    (treatment) =>
      treatment.packId === packId && treatment.sceneType === sceneType,
  );
}
