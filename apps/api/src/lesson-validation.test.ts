import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultStoryboardSceneSpec,
  reconcileSceneDurations,
  sceneAudioFitToleranceMs,
  storyboardDurationToleranceSeconds,
  type LessonStoryboard,
  type SceneTemplate,
} from "@avlp/schemas";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
  type AuthenticatedUser,
} from "@avlp/auth";
import { createApp, sessionCookieName } from "./app.js";
import {
  acknowledgeableWarningCodes,
  affectedValidationRules,
  evaluateLessonValidation,
  isValidationRunStale,
  sceneMonotonyThreshold,
  validationIssueResponse,
  validationInputHash,
} from "./lesson-validation.js";

const projectId = "01989a3d-8e00-7000-8000-000000000001";
const objectiveId = "01989a3d-8e00-7000-8000-000000000002";
const sourceHash = createHash("sha256")
  .update("validation-fixture")
  .digest("hex");

function storyboard(sceneCount = 5): LessonStoryboard {
  const scenes = Array.from({ length: sceneCount }, (_, index) => {
    const id = `01989a3d-8e00-7000-8000-${String(index + 10).padStart(12, "0")}`;
    const scene = createDefaultStoryboardSceneSpec("hook", {
      id,
      order: index + 1,
      durationSeconds: 36,
    });
    const groundedScene = {
      ...scene,
      sourceRefs: [
        {
          documentId: "01989a3d-8e00-7000-8000-000000000007",
          parsedDocumentVersion: 1,
          pageStart: 1,
          blockIds: ["01989a3d-8e00-7000-8000-000000000008"],
        },
      ],
    };
    return {
      id,
      stableSceneId: id,
      order: index + 1,
      template: groundedScene.template,
      durationSeconds: groundedScene.durationSeconds,
      narrationBlockIds: [id],
      assetRequirements: [],
      scene: groundedScene,
    };
  });
  return {
    schemaVersion: 1,
    id: "01989a3d-8e00-7000-8000-000000000003",
    projectId,
    basedOnNarrationSetId: "01989a3d-8e00-7000-8000-000000000004",
    narrationSetContentHash: sourceHash,
    outlineSetId: "01989a3d-8e00-7000-8000-000000000005",
    outlineSetContentHash: sourceHash,
    configurationVersion: 1,
    promptId: "storyboard",
    promptVersion: "1",
    model: "fixture",
    modelCallId: "01989a3d-8e00-7000-8000-000000000006",
    status: "draft",
    revision: 1,
    title: "Quality fixture",
    subject: "Science",
    targetDurationSeconds: 180,
    totalDurationSeconds: sceneCount * 36,
    objectiveIds: [objectiveId],
    contentHash: sourceHash,
    scenes,
    generatedAt: "2026-08-25T10:00:00.000Z",
    createdAt: "2026-08-25T10:00:00.000Z",
  } as LessonStoryboard;
}

function input(source = storyboard()) {
  return {
    storyboard: source,
    artifactHashes: {},
    knownObjectiveIds: new Set([objectiveId]),
    coveredObjectiveIds: new Set([objectiveId]),
    narrationDurationSecondsByBlockId: new Map(
      source.scenes.map((scene) => [
        scene.narrationBlockIds[0]!,
        scene.durationSeconds,
      ]),
    ),
    resolvedAssetIds: new Set<string>(),
    citationIssueCountsByStableSceneId: new Map(
      source.scenes.map((scene) => [
        scene.stableSceneId,
        scene.scene.sourceRefs.map(() => 0),
      ]),
    ),
    grounding: {
      exact: true,
      hasUnsupportedClaims: false,
      hasUnlabelledGeneratedAdditions: false,
      needsReview: false,
    },
    mediaByStableSceneId: new Map(
      source.scenes.map((scene) => [
        scene.stableSceneId,
        {
          audio: {
            contentHash: sourceHash,
            // Nullable in the contract: a provider may return audio whose
            // duration was never measured, and preflight must block on it.
            durationMs: scene.durationSeconds * 1000 as number | null,
            fitWarning: null as string | null,
            status: "ready" as const,
          },
          captions: {
            contentHash: sourceHash,
            status: "ready" as const,
            cues: [{ startMs: 0, endMs: scene.durationSeconds * 1000 }],
          },
        },
      ]),
    ),
  };
}

/**
 * A storyboard whose scene templates follow `templates`, reusing the otherwise
 * valid five-scene fixture so only the template sequence is under test.
 */
function storyboardWithTemplates(
  templates: readonly SceneTemplate[],
): LessonStoryboard {
  const base = storyboard(templates.length);
  const scenes = base.scenes.map((entry, index) => {
    const template = templates[index]!;
    return {
      ...entry,
      template,
      scene: {
        ...createDefaultStoryboardSceneSpec(template, {
          id: entry.id,
          order: entry.order,
          durationSeconds: entry.durationSeconds,
        }),
        sourceRefs: entry.scene.sourceRefs,
      },
    };
  });
  return { ...base, scenes } as LessonStoryboard;
}

function monotonyIssues(source: LessonStoryboard) {
  return evaluateLessonValidation(input(source)).filter(
    (issue) => issue.code === "scene_monotony",
  );
}

describe("scene monotony advisory", () => {
  it("does not flag two consecutive scenes of the same template", () => {
    expect(
      monotonyIssues(
        storyboardWithTemplates([
          "hook",
          "hook",
          "definition",
          "summary",
          "analogy",
        ]),
      ),
    ).toEqual([]);
  });

  it("flags three consecutive scenes, naming the template and the scene ids", () => {
    const source = storyboardWithTemplates([
      "hook",
      "definition",
      "definition",
      "definition",
      "summary",
    ]);
    const issues = monotonyIssues(source);
    expect(issues).toEqual([
      expect.objectContaining({
        code: "scene_monotony",
        severity: "warning",
        acknowledgeable: true,
        scopeType: "scene",
        // Anchored to the first scene in the run for editor deep-linking.
        sceneId: source.scenes[1]!.stableSceneId,
        scopeId: source.scenes[1]!.stableSceneId,
        fieldPath: "scenes.1.scene.template",
        details: expect.objectContaining({
          template: "definition",
          consecutiveCount: 3,
          sceneIds: source.scenes.slice(1, 4).map((s) => s.stableSceneId),
        }),
      }),
    ]);
  });

  it("reports a run of five as a single finding naming all five scenes", () => {
    const source = storyboardWithTemplates(Array<SceneTemplate>(5).fill("definition"));
    const issues = monotonyIssues(source);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.details).toMatchObject({
      consecutiveCount: 5,
      sceneIds: source.scenes.map((s) => s.stableSceneId),
    });
  });

  it("does not flag non-consecutive repetition of a template", () => {
    expect(
      monotonyIssues(
        storyboardWithTemplates([
          "hook",
          "definition",
          "hook",
          "definition",
          "hook",
        ]),
      ),
    ).toEqual([]);
  });

  it("adds only the advisory and leaves every other rule's output untouched", () => {
    // The historical clean five-scene fixture produced zero issues. Adding the
    // rule must add exactly one scene_monotony warning (the fixture is all-hook)
    // and change nothing else.
    const issues = evaluateLessonValidation(input());
    expect(
      issues.filter((issue) => issue.code !== "scene_monotony"),
    ).toEqual([]);
    expect(issues.filter((issue) => issue.code === "scene_monotony")).toHaveLength(
      1,
    );
  });

  it("uses the exported threshold as the boundary", () => {
    expect(sceneMonotonyThreshold).toBe(3);
    const run = (length: number) =>
      monotonyIssues(
        storyboardWithTemplates(Array<SceneTemplate>(length).fill("definition")),
      );
    expect(run(sceneMonotonyThreshold - 1)).toEqual([]);
    expect(run(sceneMonotonyThreshold)).toHaveLength(1);
  });

  it("constructs a finding the strict issue contract accepts", () => {
    const draft = monotonyIssues(
      storyboardWithTemplates(["definition", "definition", "definition"]),
    )[0]!;
    const response = validationIssueResponse({
      id: "01989a3d-8e00-7000-8000-0000000000aa",
      ...draft,
      acknowledgedAt: null,
    });
    expect(response.severity).toBe("warning");
    expect(response.acknowledgeable).toBe(true);
  });

  it("keeps scene_monotony acknowledgeable through the service", () => {
    expect(acknowledgeableWarningCodes.has("scene_monotony")).toBe(true);
  });

  it("never blocks: a monotony-only lesson still authorises a render", () => {
    const issues = evaluateLessonValidation(
      input(storyboardWithTemplates(Array<SceneTemplate>(5).fill("hook"))),
    );
    expect(issues.some((issue) => issue.severity === "error")).toBe(false);
    expect(issues.some((issue) => issue.code === "scene_monotony")).toBe(true);
  });

  it("re-runs on scene structure edits and clears when the run is broken up", () => {
    expect(affectedValidationRules(["scene"])).toContain("scene_monotony");
    const monotonous = storyboardWithTemplates([
      "definition",
      "definition",
      "definition",
      "hook",
      "summary",
    ]);
    expect(monotonyIssues(monotonous)).toHaveLength(1);
    const reordered = {
      ...monotonous,
      scenes: [
        monotonous.scenes[0]!,
        monotonous.scenes[3]!,
        monotonous.scenes[1]!,
        monotonous.scenes[4]!,
        monotonous.scenes[2]!,
      ],
    } as LessonStoryboard;
    expect(monotonyIssues(reordered)).toEqual([]);
  });
});

describe("deterministic lesson validation", () => {
  it("passes a complete five-scene fixture", () => {
    expect(evaluateLessonValidation(input())).not.toContainEqual(
      expect.objectContaining({ severity: "error" }),
    );
  });

  it("returns stable deep-link paths and blocking failures", () => {
    const fixture = input();
    fixture.mediaByStableSceneId.delete(
      fixture.storyboard.scenes[2]!.stableSceneId,
    );
    fixture.coveredObjectiveIds.clear();
    const issues = evaluateLessonValidation(fixture);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "objective_uncovered",
          fieldPath: "objectiveIds",
          severity: "error",
        }),
        expect.objectContaining({
          code: "audio_missing",
          fieldPath: "scenes.2.audio",
          sceneId: fixture.storyboard.scenes[2]!.stableSceneId,
          severity: "error",
        }),
      ]),
    );
  });

  it("blocks unsupported grounding and unresolved citations with actionable paths", () => {
    const fixture = input();
    fixture.grounding.hasUnsupportedClaims = true;
    fixture.citationIssueCountsByStableSceneId.set(
      fixture.storyboard.scenes[1]!.stableSceneId,
      [1],
    );
    expect(evaluateLessonValidation(fixture)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "grounding_missing",
          fieldPath: "grounding.results",
          severity: "error",
        }),
        expect.objectContaining({
          code: "grounding_missing",
          fieldPath: "scenes.1.scene.sourceRefs.0.blockIds",
          severity: "error",
        }),
      ]),
    );
  });

  it("blocks unlabelled generated additions", () => {
    const fixture = input();
    fixture.grounding.hasUnlabelledGeneratedAdditions = true;
    expect(evaluateLessonValidation(fixture)).toContainEqual(
      expect.objectContaining({
        code: "generated_addition_unlabelled",
        severity: "error",
      }),
    );
  });

  it("blocks a narration plan that does not fit its scene", () => {
    const fixture = input();
    fixture.narrationDurationSecondsByBlockId.set(
      fixture.storyboard.scenes[0]!.narrationBlockIds[0]!,
      10,
    );
    expect(evaluateLessonValidation(fixture)).toContainEqual(
      expect.objectContaining({
        code: "narration_duration_mismatch",
        fieldPath: "scenes.0.narrationBlockIds",
        severity: "error",
      }),
    );
  });

  function withSceneAudioDurationMs(durationMs: number | null) {
    const fixture = input();
    const sceneId = fixture.storyboard.scenes[0]!.stableSceneId;
    const media = fixture.mediaByStableSceneId.get(sceneId)!;
    fixture.mediaByStableSceneId.set(sceneId, {
      ...media,
      audio: { ...media.audio!, durationMs, fitWarning: null },
    });
    return { fixture, sceneId };
  }

  function audioFitIssues(fixture: ReturnType<typeof input>, sceneId: string) {
    return evaluateLessonValidation(fixture).filter(
      (issue) =>
        issue.code === "audio_duration_mismatch" && issue.sceneId === sceneId,
    );
  }

  it("treats audio shorter than its scene as an acknowledgeable warning", () => {
    // 36s scene, 29s of narration audio: the composition holds the visuals and
    // plays trailing silence, so a teacher may accept the gap. It must be
    // visible, because nothing else tells them the scene ends in silence.
    const { fixture, sceneId } = withSceneAudioDurationMs(29_000);
    expect(audioFitIssues(fixture, sceneId)).toEqual([
      expect.objectContaining({
        code: "audio_duration_mismatch",
        fieldPath: "scenes.0.audio.durationMs",
        severity: "warning",
        acknowledgeable: true,
        details: expect.objectContaining({
          direction: "underrun",
          underrunMs: 7_000,
        }),
      }),
    ]);
  });

  it("blocks audio that overruns its scene and would be cut off", () => {
    const { fixture, sceneId } = withSceneAudioDurationMs(40_000);
    expect(audioFitIssues(fixture, sceneId)).toEqual([
      expect.objectContaining({
        code: "audio_duration_mismatch",
        fieldPath: "scenes.0.audio.durationMs",
        severity: "error",
        acknowledgeable: false,
        details: expect.objectContaining({
          direction: "overrun",
          overrunMs: 4_000,
        }),
      }),
    ]);
  });

  it("names the scene in both audio-fit directions so preflight is actionable", () => {
    for (const durationMs of [29_000, 40_000]) {
      const { fixture, sceneId } = withSceneAudioDurationMs(durationMs);
      expect(audioFitIssues(fixture, sceneId)[0]!.message).toContain("Scene 1");
    }
  });

  it("raises no audio-fit issue on either side of the tolerance boundary", () => {
    // A conforming engine lands near, not on, the planned duration. Both
    // boundary values are inside the band, so neither may produce an issue.
    for (const durationMs of [
      36_000 - sceneAudioFitToleranceMs,
      36_000 + sceneAudioFitToleranceMs,
    ]) {
      const { fixture, sceneId } = withSceneAudioDurationMs(durationMs);
      expect(audioFitIssues(fixture, sceneId)).toEqual([]);
    }
  });

  it("raises the matching issue one millisecond outside each boundary", () => {
    const under = withSceneAudioDurationMs(36_000 - sceneAudioFitToleranceMs - 1);
    expect(audioFitIssues(under.fixture, under.sceneId)).toEqual([
      expect.objectContaining({ severity: "warning", acknowledgeable: true }),
    ]);
    const over = withSceneAudioDurationMs(36_000 + sceneAudioFitToleranceMs + 1);
    expect(audioFitIssues(over.fixture, over.sceneId)).toEqual([
      expect.objectContaining({ severity: "error", acknowledgeable: false }),
    ]);
  });

  it("blocks a scene whose audio duration was never measured", () => {
    const { fixture, sceneId } = withSceneAudioDurationMs(null);
    expect(audioFitIssues(fixture, sceneId)).toEqual([
      expect.objectContaining({
        severity: "error",
        details: expect.objectContaining({ direction: null }),
      }),
    ]);
  });

  it("accepts a lesson total inside the target tolerance and rejects it outside", () => {
    // Reconciled scene durations follow measured audio, so the total drifts off
    // the configured target. The band is the same one the allocator is held to.
    const target = 180;
    const tolerance = storyboardDurationToleranceSeconds(target);
    const withTotalDrift = (driftSeconds: number) => {
      const source = storyboard();
      const first = source.scenes[0]!;
      const scenes = [
        {
          ...first,
          durationSeconds: first.durationSeconds + driftSeconds,
          scene: {
            ...first.scene,
            durationSeconds: first.scene.durationSeconds + driftSeconds,
          },
        },
        ...source.scenes.slice(1),
      ];
      const fixture = input({ ...source, scenes } as LessonStoryboard);
      return evaluateLessonValidation(fixture).filter(
        (issue) => issue.code === "lesson_duration_mismatch",
      );
    };
    expect(withTotalDrift(tolerance)).toEqual([]);
    expect(withTotalDrift(-tolerance)).toEqual([]);
    expect(withTotalDrift(tolerance + 1)).toEqual([
      expect.objectContaining({
        code: "lesson_duration_mismatch",
        severity: "error",
        details: expect.objectContaining({ toleranceSeconds: tolerance }),
      }),
    ]);
  });

  it("strips persistence-only fields from strict validation issue responses", () => {
    const storedIssue = {
      id: "01989a3d-8e00-7000-8000-000000000009",
      severity: "error",
      code: "audio_missing",
      scopeType: "audio",
      scopeId: null,
      sceneId: null,
      fieldPath: "scenes.0.audio",
      message: "Audio is missing.",
      details: {},
      acknowledgeable: false,
      acknowledgedAt: null,
      ownerUserId: projectId,
      runId: projectId,
    };
    const response = validationIssueResponse(storedIssue);
    expect(response).not.toHaveProperty("ownerUserId");
    expect(response).not.toHaveProperty("runId");
  });

  it("rejects acknowledgement of a blocking issue", () => {
    expect(() =>
      validationIssueResponse({
        id: "01989a3d-8e00-7000-8000-000000000009",
        severity: "error",
        code: "audio_missing",
        scopeType: "audio",
        scopeId: null,
        sceneId: null,
        fieldPath: "scenes.0.audio",
        message: "Audio is missing.",
        details: {},
        acknowledgeable: true,
        acknowledgedAt: null,
      }),
    ).toThrow();
  });

  it("changes the authoritative hash when a derived artifact changes", () => {
    const first = validationInputHash({
      artifactHashes: { "scene-1": sourceHash },
      lessonSpecContentHash: sourceHash,
    });
    const second = validationInputHash({
      artifactHashes: {
        "scene-1": createHash("sha256").update("changed").digest("hex"),
      },
      lessonSpecContentHash: sourceHash,
    });
    expect(first).not.toBe(second);
  });

  it("changes the authoritative hash when asset or objective state changes", () => {
    const first = validationInputHash({
      artifactHashes: { assets: sourceHash, objectives: sourceHash },
      lessonSpecContentHash: sourceHash,
    });
    const second = validationInputHash({
      artifactHashes: {
        assets: createHash("sha256").update("asset-deleted").digest("hex"),
        objectives: sourceHash,
      },
      lessonSpecContentHash: sourceHash,
    });
    expect(first).not.toBe(second);
    expect(isValidationRunStale(first, second)).toBe(true);
  });

  it("maps ordinary edits to only their affected rule family", () => {
    expect(affectedValidationRules(["captions"])).toEqual([
      "captions_missing",
      "captions_not_ready",
      "caption_timing_invalid",
    ]);
  });

  it("handles the maximum scene count without a quadratic rule pass", () => {
    const fixture = input(storyboard(100));
    const started = Date.now();
    evaluateLessonValidation(fixture);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("validation API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("authorizes before running a validation and requires a trusted origin", async () => {
    const fixture = createCrossUserProjectFixture();
    const users = new Map<string, AuthenticatedUser>([
      [
        "owner",
        {
          id: fixture.ownerUserId,
          email: "owner@example.test",
          displayName: "Owner",
        },
      ],
      [
        "other",
        {
          id: fixture.otherUserId,
          email: "other@example.test",
          displayName: "Other",
        },
      ],
    ]);
    const authGateway: AuthGateway = {
      register: async () => {
        throw new Error("Not used by this test.");
      },
      signIn: async () => null,
      currentSession: async (token) => users.get(token) ?? null,
      signOut: async () => {},
      requestPasswordReset: async () => {},
      confirmPasswordReset: async () => {},
    };
    const run = vi.fn().mockResolvedValue({ status: "passed" });
    app = await createApp({
      authGateway,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      trustedOrigin: "https://app.example.test",
      lessonValidationService: {
        acknowledge: vi.fn(),
        latest: vi.fn().mockResolvedValue(null),
        run,
      },
    });
    const server = app.getHttpAdapter().getInstance();
    const foreign = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/validation-runs`,
      cookies: { [sessionCookieName]: "other" },
      headers: { origin: "https://app.example.test" },
      payload: {},
    });
    expect(foreign.statusCode).toBe(404);
    expect(run).not.toHaveBeenCalled();
    const missingOrigin = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/validation-runs`,
      cookies: { [sessionCookieName]: "owner" },
      payload: {},
    });
    expect(missingOrigin.statusCode).toBe(403);
    const owner = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/validation-runs`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://app.example.test" },
      payload: {},
    });
    expect(owner.statusCode).toBe(200);
    expect(run).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      body: {},
    });
  });

  it("requires a trusted origin and exact hash when acknowledging a warning", async () => {
    const fixture = createCrossUserProjectFixture();
    const acknowledge = vi.fn().mockResolvedValue({ status: "passed" });
    const authGateway: AuthGateway = {
      register: async () => {
        throw new Error("Not used by this test.");
      },
      signIn: async () => null,
      currentSession: async (token) =>
        token === "owner"
          ? {
              id: fixture.ownerUserId,
              email: "owner@example.test",
              displayName: "Owner",
            }
          : null,
      signOut: async () => {},
      requestPasswordReset: async () => {},
      confirmPasswordReset: async () => {},
    };
    app = await createApp({
      authGateway,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      trustedOrigin: "https://app.example.test",
      lessonValidationService: { latest: vi.fn(), run: vi.fn(), acknowledge },
    });
    const server = app.getHttpAdapter().getInstance();
    const issueId = "01989a3d-8e00-7000-8000-000000000009";
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/validation/issues/${issueId}/acknowledge`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://app.example.test" },
      payload: { inputHash: sourceHash },
    });
    expect(response.statusCode).toBe(200);
    expect(acknowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId,
        projectId: fixture.projectId,
        body: { inputHash: sourceHash },
      }),
    );
  });
});

describe("audio to reconciliation to preflight", () => {
  const plannedSeconds = 36;

  /**
   * The lesson a teacher actually has: narration written exactly to budget,
   * scenes re-timed onto the audio a conforming provider produced, and the
   * narration plan still holding the durations it was written against.
   */
  function reconciledFixture(measuredMsByIndex: readonly number[]) {
    const source = storyboard(measuredMsByIndex.length);
    const outcomes = reconcileSceneDurations(
      source.scenes.map((scene, index) => ({
        stableSceneId: scene.stableSceneId,
        durationSeconds: scene.durationSeconds,
        measuredAudioDurationMs: measuredMsByIndex[index]!,
      })),
    );
    const scenes = source.scenes.map((scene, index) => {
      const applied = outcomes[index]!.appliedDurationSeconds;
      return {
        ...scene,
        durationSeconds: applied,
        scene: { ...scene.scene, durationSeconds: applied },
      };
    });
    const reconciled = {
      ...source,
      scenes,
      totalDurationSeconds: scenes.reduce(
        (sum, scene) => sum + scene.durationSeconds,
        0,
      ),
    } as LessonStoryboard;
    const fixture = input(reconciled);
    // The narration plan is not re-written by reconciliation: it still holds
    // the durations the script was budgeted against, not the measured ones.
    fixture.narrationDurationSecondsByBlockId = new Map(
      source.scenes.map((scene) => [
        scene.narrationBlockIds[0]!,
        plannedSeconds,
      ]),
    );
    for (const [index, scene] of reconciled.scenes.entries()) {
      const media = fixture.mediaByStableSceneId.get(scene.stableSceneId)!;
      fixture.mediaByStableSceneId.set(scene.stableSceneId, {
        ...media,
        audio: {
          ...media.audio!,
          durationMs: measuredMsByIndex[index]!,
          fitWarning: null,
        },
        captions: {
          ...media.captions!,
          cues: [{ startMs: 0, endMs: measuredMsByIndex[index]! }],
        },
      });
    }
    return fixture;
  }

  it("passes preflight for on-budget narration drifting the full tolerance either way", () => {
    // The worst a conforming provider can do on every scene at once. This is
    // the case that used to produce one blocking error per scene with no
    // remedy available to the teacher.
    for (const driftMs of [-sceneAudioFitToleranceMs, sceneAudioFitToleranceMs])
      expect(
        evaluateLessonValidation(
          reconciledFixture(
            Array.from({ length: 5 }, () => plannedSeconds * 1_000 + driftMs),
          ),
        ).filter((issue) => issue.severity === "error"),
      ).toEqual([]);
  });

  it("passes preflight across the whole band of per-scene drift", () => {
    for (let driftMs = -1_500; driftMs <= 1_500; driftMs += 100) {
      const measured = Array.from({ length: 5 }, (_, index) =>
        // Alternating directions, so the lesson total drifts as well as the
        // individual scenes rather than the errors cancelling out.
        index % 2 === 0
          ? plannedSeconds * 1_000 + driftMs
          : plannedSeconds * 1_000 - driftMs,
      );
      expect(
        evaluateLessonValidation(reconciledFixture(measured)).filter(
          (issue) => issue.severity === "error",
        ),
      ).toEqual([]);
    }
  });

  it("still blocks a scene whose audio cannot fit the per-scene maximum", () => {
    // 75s of audio clamps to the 60s scene ceiling, so the overrun survives
    // reconciliation and must name the offending scene.
    const measured = Array.from({ length: 5 }, (_, index) =>
      index === 2 ? 75_000 : plannedSeconds * 1_000,
    );
    const errors = evaluateLessonValidation(
      reconciledFixture(measured),
    ).filter((issue) => issue.severity === "error");
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "audio_duration_mismatch",
          details: expect.objectContaining({ direction: "overrun" }),
          message: expect.stringContaining("Scene 3"),
        }),
      ]),
    );
    expect(
      errors.every((issue) => issue.sceneId !== null || issue.code === "lesson_duration_mismatch"),
    ).toBe(true);
  });

  it("reports a scene whose audio underruns the per-scene minimum as an acknowledgeable warning", () => {
    const measured = Array.from({ length: 5 }, (_, index) =>
      index === 1 ? 900 : plannedSeconds * 1_000,
    );
    const issues = evaluateLessonValidation(reconciledFixture(measured));
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "audio_duration_mismatch",
        severity: "warning",
        acknowledgeable: true,
        details: expect.objectContaining({ direction: "underrun" }),
      }),
    );
  });
});
