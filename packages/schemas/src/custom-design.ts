/** ADR-017 / ST-123: independent identities; no pack, executable styling or URLs. */
import { identifierSchema } from "@avlp/config/identifiers";
import { z } from "zod";
import { creativeDesignContrastRatio } from "./creative-design.js";
import {
  authoredCinemaBeats,
  authoredCinemaDisplay,
  cinemaComposition,
  cinemaCompositionEligibility,
  cinemaSceneDesignSchema,
  eligibleCinemaCompositions,
  type CinemaCompositionId,
} from "./creative-design-v2.js";
import type { SceneSpec } from "./index.js";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const customPresentationSchema = z
  .object({
    colors: z
      .object({
        background: color,
        surface: color,
        text: color,
        accent: color,
        diagramEmphasis: color,
      })
      .strict(),
    fonts: z
      .object({ heading: identifierSchema, body: identifierSchema })
      .strict(),
    logoAssetId: identifierSchema.nullable(),
    alignment: z.enum(["left", "center"]),
    density: z.enum(["spacious", "compact"]),
    emphasis: z.enum(["text", "image"]),
    arrangement: z.enum(["split", "stacked"]),
    imageFrame: z.enum(["none", "rule", "rounded", "paper", "block"]),
    stroke: z.enum(["fine", "bold"]),
    corners: z.enum(["square", "rounded"]),
    motion: z
      .object({
        family: z.enum(["fade", "settle"]),
        prohibited: z.array(z.enum(["fade", "settle"])).max(2),
        intensity: z.enum(["calm", "balanced", "lively"]),
        staggerFrames: z.number().int().min(0).max(12),
        holdFrames: z.number().int().min(30).max(90),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.motion.prohibited.includes(value.motion.family))
      ctx.addIssue({
        code: "custom",
        path: ["motion", "family"],
        message: "Choose a motion family that is not prohibited.",
      });
    for (const role of ["background", "surface"] as const) {
      if (
        creativeDesignContrastRatio(value.colors.text, value.colors[role]) < 4.5
      )
        ctx.addIssue({
          code: "custom",
          path: ["colors", "text"],
          message: `Text needs at least 4.5:1 contrast on ${role}.`,
        });
      for (const [foreground, minimum] of [
        ["accent", 4.5],
        ["diagramEmphasis", 3],
      ] as const) {
        if (
          creativeDesignContrastRatio(
            value.colors[foreground],
            value.colors[role],
          ) < minimum
        )
          ctx.addIssue({
            code: "custom",
            path: ["colors", foreground],
            message: `${foreground} needs at least ${minimum}:1 contrast on ${role}.`,
          });
      }
    }
  });
export type CustomPresentation = z.infer<typeof customPresentationSchema>;

export const customDesignFontSchema = z
  .object({
    assetId: identifierSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    characterSet: z
      .array(z.number().int().min(0).max(0x10ffff))
      .min(1)
      .max(200000),
  })
  .strict();
export const customDesignManifestSchema = z
  .object({
    manifestVersion: z.literal("3.0"),
    rendererVersion: z.literal("custom-1.0.0"),
    systemId: identifierSchema,
    systemVersionId: identifierSchema,
    systemContentHash: z.string().regex(/^[a-f0-9]{64}$/),
    presentation: customPresentationSchema,
    fonts: z.array(customDesignFontSchema).min(1).max(2),
    assets: z
      .array(
        z
          .object({
            assetId: identifierSchema,
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(100),
    scenes: z.record(identifierSchema, cinemaSceneDesignSchema),
    scenePins: z.record(
      identifierSchema,
      z
        .object({
          contentHash: z.string().regex(/^[a-f0-9]{64}$/),
          beatFrames: z.array(z.number().int().nonnegative()).max(24),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const role of ["heading", "body"] as const)
      if (
        !value.fonts.some((f) => f.assetId === value.presentation.fonts[role])
      )
        ctx.addIssue({
          code: "custom",
          path: ["fonts"],
          message: `Pin the ${role} font bytes before rendering.`,
        });
    if (
      value.presentation.logoAssetId !== null &&
      !value.assets.some((a) => a.assetId === value.presentation.logoAssetId)
    )
      ctx.addIssue({
        code: "custom",
        path: ["assets"],
        message: "Pin the selected logo bytes before rendering.",
      });
    if (new Set(value.fonts.map((f) => f.assetId)).size !== value.fonts.length)
      ctx.addIssue({
        code: "custom",
        path: ["fonts"],
        message: "Font pins must be unique.",
      });
    for (const [id, scene] of Object.entries(value.scenes))
      if (value.scenePins[id]?.beatFrames.length !== scene.beats.length)
        ctx.addIssue({
          code: "custom",
          path: ["scenePins", id],
          message: "Pin every resolved beat before rendering.",
        });
    if (
      Object.keys(value.scenes).length === 0 ||
      Object.keys(value.scenes).length > 100 ||
      Object.keys(value.scenePins).some((id) => !value.scenes[id])
    )
      ctx.addIssue({
        code: "custom",
        path: ["scenes"],
        message: "Provide 1–100 scenes and matching timing pins.",
      });
  });
export type CustomDesignManifest = z.infer<typeof customDesignManifestSchema>;

/** Resolve once when compiling a snapshot, never against mutable systems at playback. */
export function resolveCustomScenes(
  presentation: CustomPresentation,
  scenes: readonly SceneSpec[],
): CustomDesignManifest["scenes"] {
  return Object.fromEntries(
    scenes.map((scene) => {
      if (
        Math.round(scene.durationSeconds * 30) <
        presentation.motion.holdFrames + 26
      )
        throw new Error(
          `Scene ${scene.order} is too short for the locked readable hold. Lengthen the scene or reduce the hold.`,
        );
      const preferred: CinemaCompositionId[] =
        scene.template === "comparison"
          ? [
              presentation.arrangement === "split"
                ? "comparison-split"
                : "comparison-stacked",
            ]
          : presentation.emphasis === "image"
            ? [
                "illustrated-headline",
                "hero-annotated",
                "hero-chart",
                "hero-indexed",
                "connected",
                "sequence",
                "takeaway",
              ]
            : [
                "statement",
                "chapter",
                "hero-chart-keyed",
                "sequence",
                "connected",
                "takeaway",
                "hero-indexed",
              ];
      const id =
        preferred.find(
          (id) => cinemaCompositionEligibility(id, scene).eligible,
        ) ??
        (scene.template === "comparison"
          ? undefined
          : eligibleCinemaCompositions(scene)[0]?.id);
      if (!id)
        throw new Error(
          `No custom composition fits scene ${scene.order}. Shorten the text or choose a supported scene.`,
        );
      return [
        scene.id,
        cinemaSceneDesignSchema.parse({
          compositionId: id,
          compositionVersion: cinemaComposition(id).version,
          locked: true,
          requiredHoldFrames: presentation.motion.holdFrames,
          chapter: id === "chapter" ? scene.order : null,
          display: authoredCinemaDisplay(scene),
          imagery: { hero: null, brief: null, motif: "orbit" },
          beats: authoredCinemaBeats(id, scene),
        }),
      ];
    }),
  );
}

/** Free-text locks cannot be claimed as implemented by a manual renderer. */
export function customDesignRuleReport(
  rules: readonly {
    id: string;
    instruction: string;
    enforcement: "locked" | "guidance";
  }[],
) {
  return rules.map((rule) => ({
    id: rule.id,
    status:
      rule.enforcement === "locked"
        ? ("unsupported" as const)
        : ("advisory" as const),
    message:
      rule.enforcement === "locked"
        ? `Resolve locked requirement “${rule.instruction}” using an exact presentation control, or change it to guidance.`
        : "Saved as creative guidance; manual rendering does not interpret this instruction.",
  }));
}
