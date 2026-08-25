import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultStoryboardSceneSpec,
  type LessonStoryboard,
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
  affectedValidationRules,
  evaluateLessonValidation,
  isValidationRunStale,
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
            durationMs: scene.durationSeconds * 1000,
            fitWarning: null,
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
      lessonValidationService: { latest: vi.fn().mockResolvedValue(null), run },
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
});
