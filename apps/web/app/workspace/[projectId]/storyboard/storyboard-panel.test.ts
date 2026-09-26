import type {
  StoryboardSceneDetailResponse,
  StoryboardSceneListResponse,
} from "@avlp/schemas";
import { describe, expect, it, vi } from "vitest";
import {
  deriveSaveVersionOutcome,
  pollSceneMedia,
  sceneDetailWhileReloading,
} from "./storyboard-panel";

function blockedPayload() {
  return {
    error: {
      code: "bad_request",
      message: "Narration is still a draft and must be approved.",
      retryable: false,
      correlationId: "019ffbf1-eeee-7000-8000-000000000060",
      details: {
        ready: false,
        blockers: [
          {
            code: "narration_unapproved",
            message: "Narration is still a draft and must be approved.",
            recoveryStage: "narration",
          },
        ],
      },
    },
  };
}

describe("deriveSaveVersionOutcome", () => {
  it("names the readiness blocker on a blocked save (the observed narration-draft case)", () => {
    const outcome = deriveSaveVersionOutcome(false, blockedPayload());
    expect(outcome).toEqual({
      kind: "blocked",
      message: "Narration is still a draft and must be approved.",
      blockers: [
        {
          code: "narration_unapproved",
          message: "Narration is still a draft and must be approved.",
          recoveryStage: "narration",
        },
      ],
    });
  });

  it("falls back to a plain error when the failure carries no structured readiness details", () => {
    const outcome = deriveSaveVersionOutcome(false, {
      error: {
        code: "internal_error",
        message: "Unexpected failure.",
        retryable: true,
        correlationId: "019ffbf1-eeee-7000-8000-000000000061",
      },
    });
    expect(outcome).toEqual({ kind: "error", message: "Unexpected failure." });
  });

  it("falls back to a generic message when the response body cannot be parsed at all", () => {
    expect(deriveSaveVersionOutcome(false, null)).toEqual({
      kind: "error",
      message: "Unable to save this lesson version.",
    });
  });

  it("reports success regardless of body once the response is ok", () => {
    expect(deriveSaveVersionOutcome(true, blockedPayload())).toEqual({
      kind: "success",
    });
  });

  it("models a successful retry once the blocking prerequisite is approved", () => {
    const firstAttempt = deriveSaveVersionOutcome(false, blockedPayload());
    expect(firstAttempt.kind).toBe("blocked");

    const retryAfterApproval = deriveSaveVersionOutcome(true, null);
    expect(retryAfterApproval).toEqual({ kind: "success" });
  });
});

function sceneList(
  revision: number,
  audio: StoryboardSceneListResponse["scenes"][number]["status"]["audio"],
): StoryboardSceneListResponse {
  return {
    revision,
    stale: false,
    staleReason: null,
    totalDurationSeconds: 12,
    targetDurationSeconds: 180,
    scenes: [
      {
        sceneId: "019ffbf1-6151-738a-b087-6775ff97568c",
        order: 1,
        template: "definition",
        title: null,
        narrationSummary: "Water moves through the environment.",
        narrationBlockCount: 1,
        durationSeconds: 12,
        status: {
          assets: "none",
          audio,
          captions: audio === "ready" ? "ready" : "pending",
          validation: "ok",
          stale: false,
        },
      },
    ],
  };
}

describe("pollSceneMedia", () => {
  it("refetches the storyboard once media settles so the lesson-spec revision catches up with duration reconciliation", async () => {
    // Stands in for `view.value.storyboard.revision`, which the workspace
    // passes to the scene detail panel as `lessonSpecRevision`.
    let lessonSpecRevision = 0;
    const serverRevision = 1;
    const refreshStoryboard = vi.fn(async () => {
      lessonSpecRevision = serverRevision;
    });
    const onSettled = vi.fn();
    const onSceneList = vi.fn();
    const responses = [
      sceneList(0, "generating"),
      sceneList(serverRevision, "ready"),
    ];

    const poll = () =>
      pollSceneMedia({
        loadSceneList: async () => responses.shift()!,
        refreshStoryboard,
        onSceneList,
        onSettled,
      });

    expect(await poll()).toBe("pending");
    expect(refreshStoryboard).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
    expect(lessonSpecRevision).toBe(0);

    expect(await poll()).toBe("settled");
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(refreshStoryboard).toHaveBeenCalledTimes(1);
    expect(onSceneList).toHaveBeenCalledTimes(2);
    expect(lessonSpecRevision).toBe(serverRevision);
  });

  it("still settles when the storyboard refetch fails, leaving the next mutation to recover", async () => {
    const onSettled = vi.fn();
    const outcome = await pollSceneMedia({
      loadSceneList: async () => sceneList(1, "ready"),
      refreshStoryboard: async () => {
        throw new Error("storyboard");
      },
      onSceneList: () => undefined,
      onSettled,
    });
    expect(outcome).toBe("settled");
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("propagates a scene-list failure so the caller keeps polling", async () => {
    const refreshStoryboard = vi.fn(async () => undefined);
    await expect(
      pollSceneMedia({
        loadSceneList: async () => {
          throw new Error("scenes");
        },
        refreshStoryboard,
        onSceneList: () => undefined,
        onSettled: () => undefined,
      }),
    ).rejects.toThrow("scenes");
    expect(refreshStoryboard).not.toHaveBeenCalled();
  });
});

describe("sceneDetailWhileReloading", () => {
  const shownSceneId = "019ffbf1-6151-738a-b087-6775ff97568c";
  // Only the scene identity matters to this decision.
  const shown = {
    kind: "ready",
    value: {
      sceneRevision: 1,
      scene: { id: shownSceneId },
    } as unknown as StoryboardSceneDetailResponse,
  } as const;

  it("keeps the scene on screen mounted while its detail is refetched, so an inline conflict notice survives", () => {
    expect(sceneDetailWhileReloading(shown, shownSceneId)).toBe(shown);
  });

  it("shows loading when a different scene is selected", () => {
    expect(
      sceneDetailWhileReloading(shown, "019ffbf1-6151-738a-b087-6775ff97568d"),
    ).toEqual({ kind: "loading" });
  });

  it("shows loading after a failed load or before any detail exists", () => {
    expect(
      sceneDetailWhileReloading(
        { kind: "failed", message: "The selected scene could not be loaded." },
        shownSceneId,
      ),
    ).toEqual({ kind: "loading" });
    expect(
      sceneDetailWhileReloading({ kind: "loading" }, shownSceneId),
    ).toEqual({ kind: "loading" });
  });
});
