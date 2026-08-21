import {
  storyboardSceneDetailResponseSchema,
  storyboardSceneListResponseSchema,
  type StoryboardSceneDetailResponse,
  type StoryboardSceneListResponse,
} from "@avlp/schemas";

/**
 * Storyboard scene-list query cache keyed by project and storyboard revision.
 * The scene list is the authoritative lightweight read model for the editor;
 * any storyboard mutation that bumps the revision naturally produces a new key
 * and forces a fresh fetch instead of showing a stale list.
 */
export function storyboardSceneListKey(
  projectId: string,
  revision: number,
): string {
  return `storyboard:scenes:${projectId}:${revision}`;
}

/** Key prefix for all cached scene-list entries of one project. */
export function storyboardSceneListPrefix(projectId: string): string {
  return `storyboard:scenes:${projectId}:`;
}

type SceneListCacheEntry = {
  value: StoryboardSceneListResponse;
  revision: number;
};

const sceneListCache = new Map<string, SceneListCacheEntry>();

export function cachedStoryboardSceneList(
  projectId: string,
  revision: number,
): StoryboardSceneListResponse | undefined {
  return sceneListCache.get(storyboardSceneListKey(projectId, revision))?.value;
}

export function cacheStoryboardSceneList(
  projectId: string,
  revision: number,
  value: StoryboardSceneListResponse,
): void {
  sceneListCache.set(storyboardSceneListKey(projectId, revision), {
    value,
    revision,
  });
}

/** Drops every cached revision for one project. */
export function invalidateStoryboardSceneList(projectId: string): void {
  const prefix = storyboardSceneListPrefix(projectId);
  for (const key of sceneListCache.keys())
    if (key.startsWith(prefix)) sceneListCache.delete(key);
}

/** Test-only hook to reset the module cache between test cases. */
export function clearStoryboardSceneListCache(): void {
  sceneListCache.clear();
}

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

export async function fetchStoryboardSceneList(
  projectId: string,
): Promise<StoryboardSceneListResponse> {
  const response = await fetch(
    apiUrl(`/projects/${encodeURIComponent(projectId)}/storyboard/scenes`),
    { credentials: "include", cache: "no-store" },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error("storyboard-scenes");
  const parsed = storyboardSceneListResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error("storyboard-scenes");
  cacheStoryboardSceneList(projectId, parsed.data.revision, parsed.data);
  return parsed.data;
}

export async function fetchStoryboardSceneDetail(
  projectId: string,
  sceneId: string,
): Promise<StoryboardSceneDetailResponse> {
  const response = await fetch(
    apiUrl(
      `/projects/${encodeURIComponent(projectId)}/storyboard/scenes/${encodeURIComponent(sceneId)}`,
    ),
    { credentials: "include", cache: "no-store" },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error("storyboard-scene-detail");
  const parsed = storyboardSceneDetailResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error("storyboard-scene-detail");
  return parsed.data;
}
