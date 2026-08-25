import {
  assetCatalogSearchResponseSchema,
  completeProjectAssetUploadResponseSchema,
  projectAssetListResponseSchema,
  projectAssetUploadSessionSchema,
  storyboardSceneDetailResponseSchema,
  storyboardSceneEditResponseSchema,
  storyboardSceneListResponseSchema,
  type SceneSpec,
  type AssetCatalogSearchResponse,
  type SceneTemplate,
  type StoryboardSceneEditResponse,
  type StoryboardSceneDetailResponse,
  type StoryboardSceneListResponse,
  type ProjectAssetListResponse,
  type CompleteProjectAssetUploadResponse,
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

export async function fetchApprovedAssets(
  projectId: string,
  template: SceneTemplate,
  slot: string,
  filters: Readonly<{ tags?: readonly string[] }> = {},
): Promise<AssetCatalogSearchResponse> {
  const parameters = new URLSearchParams({ slot, template });
  const tags = filters.tags
    ?.map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  if (tags !== undefined && tags.length > 0)
    parameters.set("tags", tags.join(","));
  const response = await fetch(
    apiUrl(
      `/projects/${encodeURIComponent(projectId)}/assets?${parameters.toString()}`,
    ),
    { credentials: "include", cache: "no-store" },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error("approved-assets");
  const parsed = assetCatalogSearchResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error("approved-assets");
  return parsed.data;
}

export async function fetchTeacherAssets(projectId: string): Promise<ProjectAssetListResponse> {
  const response = await fetch(apiUrl(`/projects/${encodeURIComponent(projectId)}/teacher-assets`), { credentials: "include", cache: "no-store" });
  const parsed = projectAssetListResponseSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success) throw new Error("teacher-assets");
  return parsed.data;
}

export async function completeTeacherAssetUpload(
  projectId: string,
  sessionId: string,
): Promise<CompleteProjectAssetUploadResponse> {
  const completedResponse = await fetch(apiUrl(`/projects/${encodeURIComponent(projectId)}/teacher-assets/uploads/${encodeURIComponent(sessionId)}/complete`), { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" });
  const completed = completeProjectAssetUploadResponseSchema.safeParse(await completedResponse.json().catch(() => null));
  if (!completedResponse.ok || !completed.success)
    throw new Error("The image could not be validated. Please retry it.");
  return completed.data;
}

export async function uploadTeacherAsset(
  projectId: string,
  file: File,
): Promise<{ sessionId: string; completion: CompleteProjectAssetUploadResponse }> {
  const mediaType = file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp" ? file.type : undefined;
  if (mediaType === undefined) throw new Error("Choose a PNG, JPEG, or WebP image.");
  const { calculateSha256 } = await import("../upload/source-upload-checksum");
  const sessionResponse = await fetch(apiUrl(`/projects/${encodeURIComponent(projectId)}/teacher-assets/uploads`), { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: file.name, mediaType, sizeBytes: file.size, sha256: await calculateSha256(await file.arrayBuffer()) }) });
  const session = projectAssetUploadSessionSchema.safeParse(await sessionResponse.json().catch(() => null));
  if (!sessionResponse.ok || !session.success) throw new Error("Unable to start the image upload.");
  const upload = await fetch(session.data.uploadUrl, { method: "PUT", headers: session.data.requiredHeaders, body: file });
  if (!upload.ok) throw new Error("The image upload failed.");
  return {
    sessionId: session.data.sessionId,
    completion: await completeTeacherAssetUpload(projectId, session.data.sessionId),
  };
}

function teacherAssetErrorMessage(payload: unknown): string | undefined {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  )
    return payload.error.message;
  return undefined;
}

export async function deleteTeacherAsset(
  projectId: string,
  assetId: string,
): Promise<void> {
  const response = await fetch(
    apiUrl(
      `/projects/${encodeURIComponent(projectId)}/teacher-assets/${encodeURIComponent(assetId)}`,
    ),
    { method: "DELETE", credentials: "include", cache: "no-store" },
  );
  if (response.ok) return;
  const message = teacherAssetErrorMessage(
    await response.json().catch(() => null),
  );
  throw new Error(message ?? "The uploaded image could not be removed.");
}

function parseSceneListPayload(payload: unknown): StoryboardSceneListResponse {
  const parsed = storyboardSceneListResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error("storyboard-scenes");
  return parsed.data;
}

function mutationErrorMessage(payload: unknown, fallback: string): string {
  return typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
    ? payload.error.message
    : fallback;
}

export class SceneMutationError extends Error {
  public constructor(
    message: string,
    public readonly fields: Readonly<Record<string, string>> = {},
  ) {
    super(message);
  }
}

async function postSceneMutation(
  path: string,
  body: unknown,
  method: "POST" | "DELETE" = "POST",
): Promise<StoryboardSceneListResponse> {
  const response = await fetch(apiUrl(path), {
    method,
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new SceneMutationError(
      mutationErrorMessage(payload, "The storyboard could not be updated."),
      extractFieldErrors(payload),
    );
  return parseSceneListPayload(payload);
}

function extractFieldErrors(
  payload: unknown,
): Readonly<Record<string, string>> {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("error" in payload) ||
    typeof payload.error !== "object" ||
    payload.error === null ||
    !("fieldErrors" in payload.error) ||
    typeof payload.error.fieldErrors !== "object" ||
    payload.error.fieldErrors === null
  )
    return {};
  return Object.fromEntries(
    Object.entries(payload.error.fieldErrors).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

async function editSceneMutation(
  path: string,
  body: unknown,
  method: "PATCH" | "POST",
): Promise<StoryboardSceneEditResponse> {
  const response = await fetch(apiUrl(path), {
    method,
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new SceneMutationError(
      mutationErrorMessage(payload, "The scene could not be saved."),
      extractFieldErrors(payload),
    );
  const parsed = storyboardSceneEditResponseSchema.safeParse(payload);
  if (!parsed.success)
    throw new SceneMutationError("The saved scene response was invalid.");
  return parsed.data;
}

export function updateStoryboardScene(
  projectId: string,
  sceneId: string,
  scene: SceneSpec,
  expectedRevision: number,
): Promise<StoryboardSceneEditResponse> {
  return editSceneMutation(
    `/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}`,
    { scene, expectedRevision },
    "PATCH",
  );
}

export function switchStoryboardSceneTemplate(
  projectId: string,
  sceneId: string,
  template: SceneTemplate,
  expectedRevision: number,
  confirmReset = false,
): Promise<StoryboardSceneEditResponse> {
  return editSceneMutation(
    `/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}/change-template`,
    { template, expectedRevision, confirmReset },
    "POST",
  );
}

export async function addStoryboardScene(
  projectId: string,
  template: SceneTemplate,
  expectedRevision: number,
): Promise<StoryboardSceneListResponse> {
  const result = await postSceneMutation(
    `/projects/${encodeURIComponent(projectId)}/scenes`,
    { template, expectedRevision },
  );
  cacheStoryboardSceneList(projectId, result.revision, result);
  return result;
}

export async function duplicateStoryboardScene(
  projectId: string,
  sceneId: string,
  expectedRevision: number,
): Promise<StoryboardSceneListResponse> {
  const result = await postSceneMutation(
    `/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}/duplicate`,
    { expectedRevision },
  );
  cacheStoryboardSceneList(projectId, result.revision, result);
  return result;
}

export async function deleteStoryboardScene(
  projectId: string,
  sceneId: string,
  expectedRevision: number,
): Promise<StoryboardSceneListResponse> {
  const result = await postSceneMutation(
    `/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}`,
    { expectedRevision },
    "DELETE",
  );
  cacheStoryboardSceneList(projectId, result.revision, result);
  return result;
}

export async function reorderStoryboardScenes(
  projectId: string,
  sceneIds: readonly string[],
  expectedRevision: number,
): Promise<StoryboardSceneListResponse> {
  const result = await postSceneMutation(
    `/projects/${encodeURIComponent(projectId)}/scenes/reorder`,
    { sceneIds, expectedRevision },
  );
  cacheStoryboardSceneList(projectId, result.revision, result);
  return result;
}
