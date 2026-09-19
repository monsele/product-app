/**
 * ST-096 — the pilot contracts, and the compatibility promises they make.
 *
 * The three that matter most, because getting any of them wrong is invisible
 * until a tester is looking at the wrong video:
 *
 * 1. A configuration stored before this story reads as `standard`, and an
 *    unknown value is an error rather than a quiet downgrade to standard.
 * 2. The approach is inside the hashed variant identity, so a pair whose two
 *    halves share every other input still has two identities.
 * 3. An unselectable approach must carry a reason, and a selectable one must
 *    not — the UI has no way to render "no, because" if the contract lets the
 *    two disagree.
 */

import { describe, expect, it } from "vitest";
import {
  defaultVideoApproach,
  lessonConfigurationInputSchema,
  lessonConfigurationSchema,
  readVideoApproach,
  videoApproachSchema,
} from "./index.js";
import {
  demonstrationEligibilitySchema,
  demonstrationFeedbackInputSchema,
  demonstrationFeedbackViewSchema,
  demonstrationPilotExperimentVersion,
  demonstrationRatingScale,
  demonstrationVariantIdentityInputSchema,
  demonstrationVariantPlanSchema,
} from "./demonstration-pilot.js";

const sha = (letter: string) => letter.repeat(64);
const uuid = "0189d0f4-1b2c-7abc-8def-0123456789ab";
const otherUuid = "0189d0f4-1b2c-7abc-8def-0123456789ac";

const storedConfiguration = {
  ageBand: "11-13",
  difficulty: "introductory",
  includeRecallQuestions: false,
  lessonTitle: "Saving a little, every week",
  sourceParsedDocumentVersion: 1,
  subject: "Personal finance",
  targetDurationSeconds: 180,
  tone: "friendly",
  updatedAt: "2026-09-18T12:00:00.000Z",
  version: 1,
  videoApproach: "standard",
  visualTheme: "mvp-default",
};

describe("the video approach on the configuration contract", () => {
  it("reads a legacy configuration with no field as standard", () => {
    expect(readVideoApproach(undefined)).toBe("standard");
    expect(readVideoApproach(null)).toBe("standard");
    expect(defaultVideoApproach).toBe("standard");
  });

  it("reads each explicit value as itself", () => {
    expect(readVideoApproach("standard")).toBe("standard");
    expect(readVideoApproach("demonstration")).toBe("demonstration");
  });

  it("rejects an unknown stored value instead of downgrading it", () => {
    // This is the whole point of the reader: a value we cannot interpret must
    // stop the request, because silently treating it as standard is exactly
    // the approach substitution AC2 forbids.
    expect(() => readVideoApproach("cinematic")).toThrow();
    expect(() => readVideoApproach("")).toThrow();
    expect(() => readVideoApproach(3)).toThrow();
  });

  it("requires the field on a persisted configuration and rejects unknowns", () => {
    expect(
      lessonConfigurationSchema.parse(storedConfiguration).videoApproach,
    ).toBe("standard");
    expect(
      lessonConfigurationSchema.safeParse({
        ...storedConfiguration,
        videoApproach: undefined,
      }).success,
    ).toBe(false);
    expect(
      lessonConfigurationSchema.safeParse({
        ...storedConfiguration,
        videoApproach: "cinematic",
      }).success,
    ).toBe(false);
  });

  it("lets a client that predates the field omit it, but not misspell it", () => {
    const base = {
      ageBand: "11-13" as const,
      difficulty: "introductory" as const,
      expectedVersion: 1,
      includeRecallQuestions: false,
      lessonTitle: "Saving a little, every week",
      subject: "Personal finance",
      targetDurationSeconds: 180 as const,
      tone: "friendly" as const,
    };
    expect(lessonConfigurationInputSchema.parse(base).videoApproach).toBe(
      undefined,
    );
    expect(
      lessonConfigurationInputSchema.parse({
        ...base,
        videoApproach: "demonstration",
      }).videoApproach,
    ).toBe("demonstration");
    expect(
      lessonConfigurationInputSchema.safeParse({
        ...base,
        videoApproach: "demo",
      }).success,
    ).toBe(false);
  });

  it("offers exactly the two approaches the pilot defines", () => {
    expect(videoApproachSchema.options).toEqual(["standard", "demonstration"]);
  });
});

describe("variant identity", () => {
  const base = {
    approach: "standard" as const,
    audioChecksums: [sha("a"), sha("b")],
    baselineContentHash: sha("c"),
    baselineLessonVersionId: uuid,
    captionSha256: sha("d"),
    experimentVersion: demonstrationPilotExperimentVersion,
    planSha256: null,
    profileSha256: sha("e"),
    rendererVersion: "st-096-remotion-4.0.507-scene-library-v1",
    themeId: "mvp-default" as const,
  };

  it("carries the approach, so two halves of one pair differ", () => {
    const standard = demonstrationVariantIdentityInputSchema.parse(base);
    const demonstration = demonstrationVariantIdentityInputSchema.parse({
      ...base,
      approach: "demonstration",
      planSha256: sha("f"),
    });
    expect(JSON.stringify(standard)).not.toBe(JSON.stringify(demonstration));
    // Everything else about the pair is identical by construction; if the
    // approach were not in this shape, the two would hash the same and one
    // would be served the other's cached render.
    expect(demonstration.audioChecksums).toEqual(standard.audioChecksums);
    expect(demonstration.captionSha256).toBe(standard.captionSha256);
    expect(demonstration.baselineContentHash).toBe(base.baselineContentHash);
  });

  it("refuses a signed URL, a timestamp or any other delivery detail", () => {
    expect(
      demonstrationVariantIdentityInputSchema.safeParse({
        ...base,
        signedUrl: "https://example.test/video.mp4",
      }).success,
    ).toBe(false);
    expect(
      demonstrationVariantIdentityInputSchema.safeParse({
        ...base,
        requestedAt: "2026-09-18T12:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("requires at least one narration checksum", () => {
    expect(
      demonstrationVariantIdentityInputSchema.safeParse({
        ...base,
        audioChecksums: [],
      }).success,
    ).toBe(false);
  });

  it("makes a registered creative presentation part of the identity input", () => {
    expect(
      demonstrationVariantIdentityInputSchema.parse({
        ...base,
        themeId: "editorial",
      }).themeId,
    ).toBe("editorial");
    expect(
      demonstrationVariantIdentityInputSchema.safeParse({
        ...base,
        themeId: "systems",
      }).success,
    ).toBe(false);
  });
});

describe("eligibility", () => {
  const base = {
    experimentVersion: demonstrationPilotExperimentVersion,
    recipes: [],
    supportedTestLesson: null,
    visible: true,
  };

  it("requires a reason whenever the approach cannot be chosen", () => {
    expect(
      demonstrationEligibilitySchema.safeParse({
        ...base,
        reasons: [],
        selectable: false,
      }).success,
    ).toBe(false);
  });

  it("refuses to be selectable and blocked at the same time", () => {
    expect(
      demonstrationEligibilitySchema.safeParse({
        ...base,
        reasons: [
          {
            code: "not_in_cohort",
            message: "Not in the pilot.",
            suggestedCorrection: "Ask to join the pilot.",
          },
        ],
        selectable: true,
      }).success,
    ).toBe(false);
  });

  it("requires every reason to carry a recovery", () => {
    expect(
      demonstrationEligibilitySchema.safeParse({
        ...base,
        reasons: [
          {
            code: "not_in_cohort",
            message: "Not in the pilot.",
            suggestedCorrection: "",
          },
        ],
        selectable: false,
      }).success,
    ).toBe(false);
  });

  it("accepts a fully eligible answer with resolved recipes", () => {
    const parsed = demonstrationEligibilitySchema.parse({
      ...base,
      reasons: [],
      recipes: [
        {
          recipeId: "savings.transfer-accumulate",
          recipeVersion: "1.0.0",
          sceneId: uuid,
        },
      ],
      selectable: true,
    });
    expect(parsed.selectable).toBe(true);
    expect(parsed.recipes).toHaveLength(1);
  });
});

describe("the resolved variant plan", () => {
  const scene = {
    assetBySlot: { coin: "naira-note" },
    audio: {
      beats: [{ beatId: "one", endMs: 1_200, startMs: 0, text: "Ten notes." }],
      checksumSha256: sha("a"),
      contentType: "audio/wav" as const,
      durationMs: 1_200,
      storageKey: "users/u/projects/p/audio/s/hash.wav",
      timingProvenance: {
        method: "measured-phrase-boundaries" as const,
        notes: "Phrase boundaries are cumulative sample offsets.",
        reviewedBy: "ST-096",
        reviewedOn: "2026-09-18",
        tool: "Windows Speech API",
      },
    },
    durationSeconds: 2,
    narration: "Ten notes.",
    order: 1,
    plan: {
      durationInFrames: 60,
      events: [
        {
          action: "emphasise",
          beatId: "one",
          durationFrames: 30,
          holdFrames: 15,
          id: "look-here",
          objectIds: ["income"],
          startFrame: 0,
        },
      ],
      expectedFinalState: { containerTotals: [], particlePhases: [] },
      initialState: {
        objects: [
          { id: "income", kind: "container", label: "Income", role: "source" },
        ],
        readouts: [],
      },
      narrationBinding: { audioChecksumSha256: sha("a"), beatIds: ["one"] },
      planVersion: "1.0.0",
      recipe: { id: "savings.transfer-accumulate", version: "1.0.0" },
      sceneId: uuid,
      seed: 1,
    },
    planVersion: "1.0.0" as const,
    recipeId: "savings.transfer-accumulate" as const,
    recipeVersion: "1.0.0" as const,
    sceneId: uuid,
    title: "Ten notes",
  };
  const plan = {
    assets: [
      {
        altText: "A one thousand naira note.",
        assetId: "naira-note",
        checksumSha256: sha("b"),
        contentType: "image/svg+xml" as const,
        height: 200,
        provenance: "Original SVG drawn for ST-095.",
        storageKey: "users/u/projects/p/demonstration/assets/naira-note.svg",
        width: 320,
      },
    ],
    bindingId: "st-096-savings",
    captions: [
      { endFrame: 36, sceneId: uuid, startFrame: 0, text: "Ten notes." },
    ],
    experimentVersion: demonstrationPilotExperimentVersion,
    hashPolicy: "st-096-canonical-json-sha256-v1" as const,
    schemaVersion: 1 as const,
    scenes: [scene],
    themeId: "mvp-default" as const,
  };

  it("accepts a complete, internally consistent plan", () => {
    expect(demonstrationVariantPlanSchema.parse(plan).scenes).toHaveLength(1);
  });

  it("does not let a legacy plan claim creative visuals without a presentation", () => {
    expect(
      demonstrationVariantPlanSchema.safeParse({
        ...plan,
        themeId: "editorial",
      }).success,
    ).toBe(false);
  });

  it("accepts only the registered creative presentation fields", () => {
    const creative = {
      ...plan,
      presentation: {
        captionPreset: "large",
        colors: {
          accent: "#6430D7",
          background: "#F7F8FC",
          diagramEmphasis: "#3159A6",
          surface: "#FCFCFF",
          text: "#2B2138",
        },
        fontPair: "nunito-inter",
        kind: "creative-style",
        packId: "everyday",
        version: "1.0.0",
      },
      themeId: "everyday",
    };
    expect(demonstrationVariantPlanSchema.safeParse(creative).success).toBe(
      true,
    );
    expect(
      demonstrationVariantPlanSchema.safeParse({
        ...creative,
        presentation: { ...creative.presentation, path: "M 0 0" },
      }).success,
    ).toBe(false);
    expect(
      demonstrationVariantPlanSchema.safeParse({
        ...creative,
        themeId: "editorial",
      }).success,
    ).toBe(false);
  });

  it("rejects a slot bound to artwork the plan does not carry", () => {
    const result = demonstrationVariantPlanSchema.safeParse({
      ...plan,
      scenes: [{ ...scene, assetBySlot: { coin: "missing-art" } }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a caption cue that belongs to no scene in this variant", () => {
    const result = demonstrationVariantPlanSchema.safeParse({
      ...plan,
      captions: [
        { endFrame: 36, sceneId: otherUuid, startFrame: 0, text: "Elsewhere." },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a duplicated scene", () => {
    const result = demonstrationVariantPlanSchema.safeParse({
      ...plan,
      scenes: [scene, scene],
    });
    expect(result.success).toBe(false);
  });

  it("requires measured beats rather than a count", () => {
    const result = demonstrationVariantPlanSchema.safeParse({
      ...plan,
      scenes: [{ ...scene, audio: { ...scene.audio, beats: [] } }],
    });
    expect(result.success).toBe(false);
  });
});

describe("feedback", () => {
  it("bounds every rating to the documented scale", () => {
    for (const rating of [0, 6, 2.5])
      expect(
        demonstrationFeedbackInputSchema.safeParse({
          comment: null,
          expectedRevision: 0,
          preference: null,
          ratings: [
            {
              approach: "standard",
              clarity: rating,
              engagement: null,
              narrationSync: null,
            },
          ],
        }).success,
      ).toBe(false);
    expect(demonstrationRatingScale.min).toBe(1);
    expect(demonstrationRatingScale.max).toBe(5);
    for (const scale of [
      demonstrationRatingScale.clarity,
      demonstrationRatingScale.engagement,
      demonstrationRatingScale.narrationSync,
    ]) {
      expect(scale.low.length).toBeGreaterThan(10);
      expect(scale.high.length).toBeGreaterThan(10);
    }
  });

  it("allows an approach to be rated once only", () => {
    expect(
      demonstrationFeedbackInputSchema.safeParse({
        comment: null,
        expectedRevision: 0,
        preference: "no_preference",
        ratings: [
          { approach: "standard", clarity: 4, engagement: 4, narrationSync: 4 },
          { approach: "standard", clarity: 2, engagement: 2, narrationSync: 2 },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts partial feedback, because a tester may answer some of it", () => {
    const parsed = demonstrationFeedbackInputSchema.parse({
      comment: null,
      expectedRevision: 0,
      preference: null,
      ratings: [
        {
          approach: "demonstration",
          clarity: 5,
          engagement: null,
          narrationSync: null,
        },
      ],
    });
    expect(parsed.ratings[0]?.clarity).toBe(5);
    expect(parsed.ratings[0]?.engagement).toBeNull();
  });

  it("requires immutable output identity when feedback is returned", () => {
    const output = {
      approach: "demonstration",
      checksumSha256: "a".repeat(64),
      renderJobId: otherUuid,
      renderedVideoId: otherUuid,
      variantId: uuid,
    };
    expect(
      demonstrationFeedbackViewSchema.safeParse({
        comment: null,
        comparisonId: uuid,
        preference: null,
        ratedOutputs: [output],
        ratedVariantIds: [uuid],
        ratings: [],
        revision: 1,
        updatedAt: null,
      }).success,
    ).toBe(true);
    expect(
      demonstrationFeedbackViewSchema.safeParse({
        comment: null,
        comparisonId: uuid,
        preference: null,
        ratedVariantIds: [uuid],
        ratings: [],
        revision: 1,
        updatedAt: null,
      }).success,
    ).toBe(false);
  });
});
