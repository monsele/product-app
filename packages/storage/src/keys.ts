import { identifierSchema, type Identifier } from "@avlp/config";
import { storageKeySchema, type StorageKey } from "./contracts.js";

type TenantScope = {
  userId: Identifier;
  projectId: Identifier;
};

type SourceOriginalKey = TenantScope & {
  documentId: Identifier;
  extension: "docx" | "pdf";
};

type ParsedKey = TenantScope & { versionId: Identifier };
type ParsedFigureKey = TenantScope & {
  versionId: Identifier;
  figureId: Identifier;
  extension: "gif" | "jpeg" | "png" | "webp";
};
type AssetKey = TenantScope & {
  assetId: Identifier;
  extension: "gif" | "jpeg" | "jpg" | "png" | "webp";
};
type AssetPrefixKey = TenantScope & { assetId: Identifier };
type AudioKey = TenantScope & {
  sceneId: Identifier;
  contentHash: string;
  extension?: "mp3" | "wav";
};
type RenderKey = TenantScope & { renderJobId: Identifier };

function tenantPrefix(scope: TenantScope): string {
  const userId = identifierSchema.parse(scope.userId);
  const projectId = identifierSchema.parse(scope.projectId);
  return `users/${userId}/projects/${projectId}`;
}

function validatedKey(value: string): StorageKey {
  return storageKeySchema.parse(value);
}

export const storageKeys = {
  projectPrefix(scope: TenantScope): StorageKey {
    return validatedKey(tenantPrefix(scope));
  },

  sourceOriginal(input: SourceOriginalKey): StorageKey {
    const documentId = identifierSchema.parse(input.documentId);
    return validatedKey(
      `${tenantPrefix(input)}/source/${documentId}/original.${input.extension}`,
    );
  },

  parsedDocling(input: ParsedKey): StorageKey {
    const versionId = identifierSchema.parse(input.versionId);
    return validatedKey(
      `${tenantPrefix(input)}/parsed/${versionId}/docling.json`,
    );
  },

  parsedMarkdown(input: ParsedKey): StorageKey {
    const versionId = identifierSchema.parse(input.versionId);
    return validatedKey(
      `${tenantPrefix(input)}/parsed/${versionId}/document.md`,
    );
  },

  parsedStagingDocling(input: ParsedKey): StorageKey {
    const versionId = identifierSchema.parse(input.versionId);
    return validatedKey(
      `${tenantPrefix(input)}/parsed-staging/${versionId}/docling.json`,
    );
  },

  parsedStagingMarkdown(input: ParsedKey): StorageKey {
    const versionId = identifierSchema.parse(input.versionId);
    return validatedKey(
      `${tenantPrefix(input)}/parsed-staging/${versionId}/document.md`,
    );
  },

  parsedNormalized(input: ParsedKey): StorageKey {
    const versionId = identifierSchema.parse(input.versionId);
    return validatedKey(
      `${tenantPrefix(input)}/parsed/${versionId}/normalized.json`,
    );
  },

  parsedStagingNormalized(input: ParsedKey): StorageKey {
    const versionId = identifierSchema.parse(input.versionId);
    return validatedKey(
      `${tenantPrefix(input)}/parsed-staging/${versionId}/normalized.json`,
    );
  },

  parsedFigureOriginal(input: ParsedFigureKey): StorageKey {
    const versionId = identifierSchema.parse(input.versionId);
    const figureId = identifierSchema.parse(input.figureId);
    return validatedKey(
      `${tenantPrefix(input)}/parsed/${versionId}/figures/${figureId}/original.${input.extension}`,
    );
  },

  parsedFigureThumbnail(input: ParsedFigureKey): StorageKey {
    const versionId = identifierSchema.parse(input.versionId);
    const figureId = identifierSchema.parse(input.figureId);
    return validatedKey(
      `${tenantPrefix(input)}/parsed/${versionId}/figures/${figureId}/thumbnail.${input.extension}`,
    );
  },

  parsedStagingFigureOriginal(input: ParsedFigureKey): StorageKey {
    const versionId = identifierSchema.parse(input.versionId);
    const figureId = identifierSchema.parse(input.figureId);
    return validatedKey(
      `${tenantPrefix(input)}/parsed-staging/${versionId}/figures/${figureId}/original.${input.extension}`,
    );
  },

  assetOriginal(input: AssetKey): StorageKey {
    const assetId = identifierSchema.parse(input.assetId);
    return validatedKey(
      `${tenantPrefix(input)}/assets/${assetId}/original.${input.extension}`,
    );
  },

  assetThumbnail(input: AssetKey): StorageKey {
    const assetId = identifierSchema.parse(input.assetId);
    return validatedKey(
      `${tenantPrefix(input)}/assets/${assetId}/thumbnail-v1.webp`,
    );
  },

  assetPrefix(input: AssetPrefixKey): StorageKey {
    const assetId = identifierSchema.parse(input.assetId);
    return validatedKey(`${tenantPrefix(input)}/assets/${assetId}`);
  },

  sceneAudio(input: AudioKey): StorageKey {
    const sceneId = identifierSchema.parse(input.sceneId);
    const contentHash = /^[0-9a-f]{64}$/i.test(input.contentHash)
      ? input.contentHash.toLowerCase()
      : undefined;
    if (contentHash === undefined)
      throw new Error("Audio contentHash must be a hexadecimal SHA-256 hash.");
    return validatedKey(
      `${tenantPrefix(input)}/audio/${sceneId}/${contentHash}.${input.extension ?? "mp3"}`,
    );
  },

  renderVideo(input: RenderKey): StorageKey {
    const renderJobId = identifierSchema.parse(input.renderJobId);
    return validatedKey(
      `${tenantPrefix(input)}/renders/${renderJobId}/lesson.mp4`,
    );
  },

  renderThumbnail(input: RenderKey): StorageKey {
    const renderJobId = identifierSchema.parse(input.renderJobId);
    return validatedKey(
      `${tenantPrefix(input)}/renders/${renderJobId}/thumbnail.png`,
    );
  },
} as const;
