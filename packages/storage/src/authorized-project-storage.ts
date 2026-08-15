import { identifierSchema, type Identifier } from "@avlp/config";
import { z } from "zod";
import {
  sha256ChecksumSchema,
  type ObjectStorage,
  type SignedStorageRequest,
} from "./contracts.js";
import { storageKeys } from "./keys.js";

export interface ProjectStorageAuthorizer {
  assertProjectAccess(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<unknown>;
}

const projectObjectLocatorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("source_original"),
    documentId: identifierSchema,
    extension: z.enum(["docx", "pdf"]),
  }),
  z.object({
    kind: z.literal("parsed_docling"),
    versionId: identifierSchema,
  }),
  z.object({
    kind: z.literal("parsed_normalized"),
    versionId: identifierSchema,
  }),
  z.object({
    kind: z.literal("parsed_figure_original"),
    versionId: identifierSchema,
    figureId: identifierSchema,
    extension: z.enum(["gif", "jpeg", "png", "webp"]),
  }),
  z.object({
    kind: z.literal("parsed_figure_thumbnail"),
    versionId: identifierSchema,
    figureId: identifierSchema,
    extension: z.enum(["gif", "jpeg", "png", "webp"]),
  }),
  z.object({
    kind: z.literal("asset_original"),
    assetId: identifierSchema,
    extension: z.enum(["gif", "jpeg", "jpg", "png", "webp"]),
  }),
  z.object({
    kind: z.literal("scene_audio"),
    sceneId: identifierSchema,
    contentHash: sha256ChecksumSchema,
  }),
  z.object({
    kind: z.literal("render_video"),
    renderJobId: identifierSchema,
  }),
  z.object({
    kind: z.literal("render_thumbnail"),
    renderJobId: identifierSchema,
  }),
]);
export type ProjectObjectLocator = z.input<typeof projectObjectLocatorSchema>;

const projectUploadObjectLocatorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("source_original"),
    documentId: identifierSchema,
    extension: z.enum(["docx", "pdf"]),
  }),
  z.object({
    kind: z.literal("asset_original"),
    assetId: identifierSchema,
    extension: z.enum(["gif", "jpeg", "jpg", "png", "webp"]),
  }),
]);
export type ProjectUploadObjectLocator = z.input<
  typeof projectUploadObjectLocatorSchema
>;

const projectObjectRequestSchema = z.object({
  projectId: identifierSchema,
  object: projectObjectLocatorSchema,
});

export const signedProjectDownloadRequestSchema =
  projectObjectRequestSchema.extend({
    expiresInSeconds: z.number().int().positive().optional(),
    downloadFileName: z.string().min(1).max(255).optional(),
  });
export type SignedProjectDownloadRequest = z.input<
  typeof signedProjectDownloadRequestSchema
>;

export const signedProjectUploadRequestSchema = z.object({
  projectId: identifierSchema,
  object: projectUploadObjectLocatorSchema,
  contentType: z.string().min(1).max(255),
  contentLength: z.number().int().positive(),
  checksumSha256: sha256ChecksumSchema,
  expiresInSeconds: z.number().int().positive().optional(),
  metadata: z
    .record(z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/), z.string().max(2048))
    .optional(),
});
export type SignedProjectUploadRequest = z.input<
  typeof signedProjectUploadRequestSchema
>;

type ProjectUrlStorage = Pick<
  ObjectStorage,
  "createSignedDownload" | "createSignedUpload"
>;

/**
 * The only public signing surface for project objects. Callers provide a
 * semantic locator, never a raw storage key; the key is derived after the
 * authenticated owner scope has been authorized.
 */
export class AuthorizedProjectStorage {
  public constructor(
    private readonly storage: ProjectUrlStorage,
    private readonly authorizer: ProjectStorageAuthorizer,
  ) {}

  public async createSignedDownload(
    authenticatedUserId: Identifier,
    input: SignedProjectDownloadRequest,
  ): Promise<SignedStorageRequest> {
    const ownerUserId = identifierSchema.parse(authenticatedUserId);
    const request = signedProjectDownloadRequestSchema.parse(input);
    await this.authorizer.assertProjectAccess(ownerUserId, request.projectId);
    return this.storage.createSignedDownload({
      key: projectObjectKey(ownerUserId, request),
      ...(request.expiresInSeconds === undefined
        ? {}
        : { expiresInSeconds: request.expiresInSeconds }),
      ...(request.downloadFileName === undefined
        ? {}
        : { downloadFileName: request.downloadFileName }),
    });
  }

  public async createSignedUpload(
    authenticatedUserId: Identifier,
    input: SignedProjectUploadRequest,
  ): Promise<SignedStorageRequest> {
    const ownerUserId = identifierSchema.parse(authenticatedUserId);
    const request = signedProjectUploadRequestSchema.parse(input);
    await this.authorizer.assertProjectAccess(ownerUserId, request.projectId);
    return this.storage.createSignedUpload({
      key: projectObjectKey(ownerUserId, request),
      contentType: request.contentType,
      contentLength: request.contentLength,
      checksumSha256: request.checksumSha256,
      ...(request.expiresInSeconds === undefined
        ? {}
        : { expiresInSeconds: request.expiresInSeconds }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
    });
  }
}

function projectObjectKey(
  ownerUserId: Identifier,
  request: z.output<typeof projectObjectRequestSchema>,
) {
  const scope = {
    userId: ownerUserId,
    projectId: request.projectId,
  };
  switch (request.object.kind) {
    case "source_original":
      return storageKeys.sourceOriginal({ ...scope, ...request.object });
    case "parsed_docling":
      return storageKeys.parsedDocling({ ...scope, ...request.object });
    case "parsed_normalized":
      return storageKeys.parsedNormalized({ ...scope, ...request.object });
    case "parsed_figure_original":
      return storageKeys.parsedFigureOriginal({ ...scope, ...request.object });
    case "parsed_figure_thumbnail":
      return storageKeys.parsedFigureThumbnail({ ...scope, ...request.object });
    case "asset_original":
      return storageKeys.assetOriginal({ ...scope, ...request.object });
    case "scene_audio":
      return storageKeys.sceneAudio({ ...scope, ...request.object });
    case "render_video":
      return storageKeys.renderVideo({ ...scope, ...request.object });
    case "render_thumbnail":
      return storageKeys.renderThumbnail({ ...scope, ...request.object });
  }
}
