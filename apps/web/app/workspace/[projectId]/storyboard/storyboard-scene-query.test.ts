import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cachedStoryboardSceneList,
  cacheStoryboardSceneList,
  clearStoryboardSceneListCache,
  fetchStoryboardSceneDetail,
  fetchStoryboardSceneList,
  fetchApprovedAssets,
  invalidateStoryboardSceneList,
  switchStoryboardSceneTemplate,
  storyboardSceneListKey,
  storyboardSceneListPrefix,
  updateStoryboardScene,
} from "./storyboard-scene-query";
import type { SceneSpec, StoryboardSceneListResponse } from "@avlp/schemas";

const projectId = "019ffbf1-610e-738a-b087-6775ff97568c";
const sceneId = "019ffbf1-6151-738a-b087-6775ff97568c";

function sampleList(revision: number): StoryboardSceneListResponse {
  return {
    revision,
    stale: false,
    staleReason: null,
    totalDurationSeconds: 60,
    targetDurationSeconds: 180,
    scenes: [
      {
        sceneId,
        order: 1,
        template: "definition",
        title: null,
        narrationSummary: "Water moves through the environment.",
        narrationBlockCount: 1,
        durationSeconds: 30,
        status: {
          assets: "none",
          audio: "not_generated",
          validation: "ok",
          stale: false,
        },
      },
    ],
  };
}

function sampleDetail() {
  return {
    scene: {
      id: sceneId,
      stableSceneId: sceneId,
      order: 1,
      template: "definition",
      durationSeconds: 30,
      narrationBlockIds: ["019ffbf1-6131-738a-b087-6775ff97568c"],
      assetRequirements: [],
      scene: {
        id: sceneId,
        order: 1,
        narration: "Water moves through the environment in a continuous cycle.",
        durationSeconds: 30,
        onScreenText: ["Key term"],
        transition: "cut",
        assetBindings: [],
        sourceRefs: [
          {
            documentId: "019ffbf1-3333-738a-b087-6775ff97568c",
            parsedDocumentVersion: 1,
            pageStart: 1,
            blockIds: ["019ffbf1-6131-738a-b087-6775ff97568c"],
          },
        ],
        generatedAdditions: [],
        template: "definition",
        visual: {
          term: "The water cycle",
          definition: "Water moves through the environment.",
        },
      },
    },
    status: {
      assets: "none",
      audio: "not_generated",
      validation: "ok",
      stale: false,
    },
  };
}

beforeEach(() => clearStoryboardSceneListCache());
afterEach(() => vi.restoreAllMocks());

describe("storyboard scene-list query keys", () => {
  it("includes the project id and storyboard revision", () => {
    const key = storyboardSceneListKey(projectId, 3);
    expect(key).toContain(projectId);
    expect(key).toContain("3");
    expect(storyboardSceneListKey(projectId, 3)).not.toBe(
      storyboardSceneListKey(projectId, 4),
    );
    expect(storyboardSceneListKey(projectId, 3)).not.toBe(
      storyboardSceneListKey("another-project", 3),
    );
  });

  it("scopes invalidation by project", () => {
    expect(storyboardSceneListPrefix(projectId)).toContain(projectId);
    expect(storyboardSceneListPrefix(projectId)).not.toBe(
      storyboardSceneListPrefix("another-project"),
    );
  });
});

describe("storyboard scene-list cache", () => {
  it("returns the cached value for the exact project and revision key", () => {
    cacheStoryboardSceneList(projectId, 2, sampleList(2));
    expect(cachedStoryboardSceneList(projectId, 2)?.revision).toBe(2);
    expect(cachedStoryboardSceneList(projectId, 3)).toBeUndefined();
  });

  it("keeps old revisions cached until the project is invalidated", () => {
    cacheStoryboardSceneList(projectId, 1, sampleList(1));
    cacheStoryboardSceneList(projectId, 2, sampleList(2));
    expect(cachedStoryboardSceneList(projectId, 1)?.revision).toBe(1);
    expect(cachedStoryboardSceneList(projectId, 2)?.revision).toBe(2);
    invalidateStoryboardSceneList(projectId);
    expect(cachedStoryboardSceneList(projectId, 1)).toBeUndefined();
    expect(cachedStoryboardSceneList(projectId, 2)).toBeUndefined();
  });

  it("does not invalidate other projects", () => {
    cacheStoryboardSceneList("other-project", 1, sampleList(1));
    cacheStoryboardSceneList(projectId, 1, sampleList(1));
    invalidateStoryboardSceneList(projectId);
    expect(cachedStoryboardSceneList("other-project", 1)?.revision).toBe(1);
  });
});

describe("storyboard scene-list fetcher", () => {
  it("caches the fetched list under its returned revision", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => sampleList(5),
      })),
    );
    const result = await fetchStoryboardSceneList(projectId);
    expect(result.revision).toBe(5);
    expect(cachedStoryboardSceneList(projectId, 5)?.revision).toBe(5);
  });

  it("rejects a malformed scene-list payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ revision: 1, scenes: [{ order: "nope" }] }),
      })),
    );
    await expect(fetchStoryboardSceneList(projectId)).rejects.toThrow();
  });

  it("rejects a failed scene-list response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => null,
      })),
    );
    await expect(fetchStoryboardSceneList(projectId)).rejects.toThrow();
  });
});

describe("storyboard scene-detail fetcher", () => {
  it("returns the selected scene detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => sampleDetail(),
      })),
    );
    const result = await fetchStoryboardSceneDetail(projectId, sceneId);
    expect(result.scene.stableSceneId).toBe(sceneId);
    expect(result.status.validation).toBe("ok");
  });

  it("rejects an invalid scene detail payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ scene: { order: "nope" } }),
      })),
    );
    await expect(
      fetchStoryboardSceneDetail(projectId, sceneId),
    ).rejects.toThrow();
  });

  it("rejects a failed scene detail response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => null,
      })),
    );
    await expect(
      fetchStoryboardSceneDetail(projectId, sceneId),
    ).rejects.toThrow();
  });
});

describe("approved asset picker query", () => {
  it("fetches only assets compatible with the selected scene slot", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return {
        ok: true,
        json: async () => ({
          assets: [
            {
              id: "019ffbf1-a001-7000-8000-000000000001",
              kind: "icon",
              subject: "science",
              tags: ["water", "science"],
              dimensions: { width: 128, height: 128 },
              aspectRatio: "square",
              source: "AI Visual Learning Platform original asset",
              license: "CC0-1.0",
              usageConstraints: ["Approved for MVP lesson scenes."],
              staticLocation: "/catalog/water-drop.svg",
              mediaType: "image/svg+xml",
            },
          ],
        }),
      };
    });
    vi.stubGlobal("fetch", fetch);
    const result = await fetchApprovedAssets(
      projectId,
      "process",
      "step-1-icon",
      { tags: ["water", "science"] },
    );
    expect(result.assets[0]?.license).toBe("CC0-1.0");
    expect(String(fetch.mock.calls[0]?.[0])).toContain("template=process");
    expect(String(fetch.mock.calls[0]?.[0])).toContain("slot=step-1-icon");
    expect(String(fetch.mock.calls[0]?.[0])).toContain("tags=water%2Cscience");
  });
});

describe("scene edit commands", () => {
  it("sends a revisioned scene update and validates the response", async () => {
    const detail = sampleDetail();
    const scene = detail.scene.scene as unknown as SceneSpec;
    let requestOptions: RequestInit | undefined;
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, options?: RequestInit) => {
        requestOptions = options;
        return {
          ok: true,
          json: async () => ({
            revision: 1,
            scene: detail.scene,
            invalidated: ["preview", "render", "validation"],
            warning: null,
            requiresConfirmation: false,
            resetFields: [],
          }),
        };
      },
    );
    vi.stubGlobal("fetch", fetch);
    const result = await updateStoryboardScene(projectId, sceneId, scene, 0);
    expect(result.revision).toBe(1);
    expect(requestOptions).toMatchObject({ method: "PATCH" });
  });

  it("returns a template-reset confirmation preview without accepting it", async () => {
    const detail = sampleDetail();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          revision: 0,
          scene: detail.scene,
          invalidated: ["preview", "render", "validation"],
          warning: null,
          requiresConfirmation: true,
          resetFields: ["visual.definition"],
        }),
      })),
    );
    const result = await switchStoryboardSceneTemplate(
      projectId,
      sceneId,
      "summary",
      0,
    );
    expect(result.requiresConfirmation).toBe(true);
    expect(result.resetFields).toContain("visual.definition");
  });
});
