import { PublicError, type Identifier } from "@avlp/config";
import {
  captionCues,
  captionTracks,
  extractedFigures,
  lessonSpecs,
  parsedDocuments,
  projectAssets,
  sceneAudio,
  scenes,
  type DatabaseClient,
} from "@avlp/database";
import {
  lessonStoryboardSchema,
  previewManifestSchema,
  type PreviewManifest,
} from "@avlp/schemas";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { storageKeySchema, type ObjectStorage } from "@avlp/storage";
import { approvedAssetById } from "./approved-assets.js";

const previewCanvas = Object.freeze({ fps: 30, height: 1_080, width: 1_920 });

/** A deliberately derived, short-lived browser-preview response. Signed URLs
 * are never stored with the lesson and every source row is tenant scoped. */
export class PreviewManifestService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly storage: Pick<ObjectStorage, "createSignedDownload">,
  ) {}

  public async get(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    quality?: "standard" | "low";
  }): Promise<PreviewManifest> {
    const findLatestSpec = async (status: "approved" | "draft") => {
      const [spec] = await this.database
        .select()
        .from(lessonSpecs)
        .where(
          and(
            eq(lessonSpecs.ownerUserId, input.ownerUserId),
            eq(lessonSpecs.projectId, input.projectId),
            eq(lessonSpecs.status, status),
          ),
        )
        .orderBy(desc(lessonSpecs.generatedAt))
        .limit(1);
      return spec;
    };
    const spec =
      (await findLatestSpec("draft")) ?? (await findLatestSpec("approved"));
    if (!spec)
      throw new PublicError(
        "not_found",
        "No current storyboard is available for preview.",
        404,
      );
    const storyboard = lessonStoryboardSchema.parse(spec.payload);
    const assetIds = [
      ...new Set(
        storyboard.scenes.flatMap((scene) =>
          scene.scene.assetBindings.map((binding) => binding.assetId),
        ),
      ),
    ];
    const projectAssetRows =
      assetIds.length === 0
        ? []
        : await this.database
            .select()
            .from(projectAssets)
            .where(
              and(
                eq(projectAssets.ownerUserId, input.ownerUserId),
                eq(projectAssets.projectId, input.projectId),
                eq(projectAssets.status, "active"),
                isNull(projectAssets.deletedAt),
                inArray(projectAssets.id, assetIds),
              ),
            );
    const projectAssetById = new Map(
      projectAssetRows.map((asset) => [asset.id, asset]),
    );
    const sourceFigureRows =
      assetIds.length === 0
        ? []
        : await this.database
            .select({ figure: extractedFigures })
            .from(extractedFigures)
            .innerJoin(
              parsedDocuments,
              eq(extractedFigures.parsedDocumentId, parsedDocuments.id),
            )
            .where(
              and(
                eq(parsedDocuments.ownerUserId, input.ownerUserId),
                eq(parsedDocuments.projectId, input.projectId),
                inArray(extractedFigures.id, assetIds),
              ),
            );
    const sourceFigureById = new Map(
      sourceFigureRows.map(({ figure }) => [figure.id, figure]),
    );
    const assetEntries: Array<
      readonly [
        string,
        {
          assetId: string;
          altText: string;
          provenance:
            | "catalog"
            | "source_figure"
            | "teacher_uploaded"
            | "ai_generated";
          source: "library" | "source";
          src: string;
        },
      ]
    > = [];
    for (const assetId of assetIds) {
      const catalogAsset = approvedAssetById(assetId);
      if (catalogAsset !== undefined) {
        assetEntries.push([
          assetId,
          {
            assetId,
            altText: catalogAsset.subject,
            provenance: "catalog" as const,
            source: "library",
            src: catalogAsset.staticLocation,
          },
        ]);
        continue;
      }
      const asset = projectAssetById.get(assetId);
      const sourceFigure = sourceFigureById.get(assetId);
      const key =
        asset === undefined
          ? input.quality === "low" && sourceFigure?.thumbnailStorageKey
            ? sourceFigure.thumbnailStorageKey
            : sourceFigure?.storageKey
          : input.quality === "low" && asset.thumbnailStorageKey !== null
            ? asset.thumbnailStorageKey
            : asset.storageKey;
      if (key === undefined || key === null) continue;
      const signed = await this.storage.createSignedDownload({
        key: storageKeySchema.parse(key),
        expiresInSeconds: 300,
      });
      assetEntries.push([
        assetId,
        {
          assetId,
          altText:
            asset?.originalName ?? sourceFigure?.altText ?? "Source figure",
          // ST-085: surface provenance to the scene layer. A resolved project
          // asset carries its own; anything else is an included source figure.
          provenance:
            asset === undefined
              ? ("source_figure" as const)
              : asset.provenance === "ai_generated"
                ? ("ai_generated" as const)
                : ("teacher_uploaded" as const),
          source: "source",
          src: signed.url,
        },
      ]);
    }
    const assets = Object.fromEntries(assetEntries);
    const resolvedAssetIds = new Set(Object.keys(assets));
    const sceneRows = await this.database
      .select()
      .from(scenes)
      .where(
        and(
          eq(scenes.ownerUserId, input.ownerUserId),
          eq(scenes.projectId, input.projectId),
          eq(scenes.lessonSpecId, spec.id),
        ),
      )
      .orderBy(asc(scenes.order));
    const sceneRowByStableSceneId = new Map(
      sceneRows.map((scene) => [scene.stableSceneId, scene]),
    );
    const entries = await Promise.all(
      storyboard.scenes.map(async (storyboardScene) => {
        const scene = sceneRowByStableSceneId.get(
          storyboardScene.stableSceneId,
        );
        const missingAssetIds = storyboardScene.scene.assetBindings
          .map((binding) => binding.assetId)
          .filter((assetId) => !resolvedAssetIds.has(assetId));
        if (scene === undefined)
          return {
            sceneId: storyboardScene.stableSceneId,
            audio: { status: "missing", url: null, expiresAt: null },
            captions: [],
            missingAssetIds,
            stale: true,
          };
        const [audio] = await this.database
          .select()
          .from(sceneAudio)
          .where(
            and(
              eq(sceneAudio.ownerUserId, input.ownerUserId),
              eq(sceneAudio.projectId, input.projectId),
              eq(sceneAudio.sceneId, scene.id),
            ),
          )
          .orderBy(desc(sceneAudio.updatedAt))
          .limit(1);
        const [track] = audio
          ? await this.database
              .select()
              .from(captionTracks)
              .where(
                and(
                  eq(captionTracks.ownerUserId, input.ownerUserId),
                  eq(captionTracks.projectId, input.projectId),
                  eq(captionTracks.sceneAudioId, audio.id),
                ),
              )
              .orderBy(desc(captionTracks.updatedAt))
              .limit(1)
          : [];
        const captions =
          track?.status === "ready"
            ? await this.database
                .select({
                  startMs: captionCues.startMs,
                  endMs: captionCues.endMs,
                  text: captionCues.text,
                })
                .from(captionCues)
                .where(
                  and(
                    eq(captionCues.ownerUserId, input.ownerUserId),
                    eq(captionCues.projectId, input.projectId),
                    eq(captionCues.trackId, track.id),
                  ),
                )
                .orderBy(asc(captionCues.position))
            : [];
        const signed =
          audio?.status === "ready" && audio.storageKey
            ? await this.storage.createSignedDownload({
                key: storageKeySchema.parse(audio.storageKey),
                expiresInSeconds: 300,
              })
            : null;
        const stale =
          audio?.status !== "ready" ||
          track?.status !== "ready" ||
          captions.length === 0 ||
          missingAssetIds.length > 0;
        return {
          sceneId: scene.stableSceneId as Identifier,
          audio: {
            status: audio?.status ?? "missing",
            url: signed?.url ?? null,
            expiresAt: signed?.expiresAt.toISOString() ?? null,
          },
          captions,
          missingAssetIds,
          stale,
        };
      }),
    );
    return previewManifestSchema.parse({
      assets,
      canvas: previewCanvas,
      storyboard,
      generatedAt: new Date().toISOString(),
      scenes: entries,
    });
  }
}
