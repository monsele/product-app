import {
  assetCatalogSearchInputSchema,
  assetCatalogSearchResponseSchema,
  isCatalogAssetCompatibleWithSlot,
  sceneAssetSlotRequirement,
  type AssetCatalogEntry,
  type AssetCatalogSearchInput,
  type AssetCatalogSearchResponse,
} from "@avlp/schemas";
import { PublicError } from "@avlp/config";

/**
 * Immutable MVP catalog. Every SVG is an original in-repository asset under
 * CC0-1.0, so its location, licence, and permitted use can be shown without a
 * remote-media dependency or an unbounded search provider.
 */
export const approvedAssetCatalog = [
  {
    id: "019ffbf1-a001-7000-8000-000000000001",
    kind: "icon",
    subject: "science",
    tags: ["water", "liquid", "science"],
    dimensions: { width: 128, height: 128 },
    aspectRatio: "square",
    source: "AI Visual Learning Platform original asset",
    license: "CC0-1.0",
    usageConstraints: [
      "Approved for MVP lesson scenes.",
      "Do not imply measurement or scale.",
    ],
    staticLocation: "/catalog/water-drop.svg",
    mediaType: "image/svg+xml",
  },
  {
    id: "019ffbf1-a002-7000-8000-000000000002",
    kind: "icon",
    subject: "science",
    tags: ["energy", "heat", "science"],
    dimensions: { width: 128, height: 128 },
    aspectRatio: "square",
    source: "AI Visual Learning Platform original asset",
    license: "CC0-1.0",
    usageConstraints: [
      "Approved for MVP lesson scenes.",
      "Use as a conceptual icon only.",
    ],
    staticLocation: "/catalog/energy-spark.svg",
    mediaType: "image/svg+xml",
  },
  {
    id: "019ffbf1-a003-7000-8000-000000000003",
    kind: "illustration",
    subject: "science",
    tags: ["plant", "biology", "growth"],
    dimensions: { width: 320, height: 180 },
    aspectRatio: "landscape",
    source: "AI Visual Learning Platform original asset",
    license: "CC0-1.0",
    usageConstraints: [
      "Approved for MVP lesson scenes.",
      "Use with explanatory labels where needed.",
    ],
    staticLocation: "/catalog/plant-cycle.svg",
    mediaType: "image/svg+xml",
  },
  {
    id: "019ffbf1-a004-7000-8000-000000000004",
    kind: "illustration",
    subject: "general",
    tags: ["cycle", "process", "system"],
    dimensions: { width: 640, height: 240 },
    aspectRatio: "wide",
    source: "AI Visual Learning Platform original asset",
    license: "CC0-1.0",
    usageConstraints: [
      "Approved for MVP lesson scenes.",
      "Use as a non-data-bearing process illustration.",
    ],
    staticLocation: "/catalog/cycle-system.svg",
    mediaType: "image/svg+xml",
  },
  {
    id: "019ffbf1-a005-7000-8000-000000000005",
    kind: "shape",
    subject: "general",
    tags: ["shape", "diagram", "structure"],
    dimensions: { width: 320, height: 180 },
    aspectRatio: "landscape",
    source: "AI Visual Learning Platform original asset",
    license: "CC0-1.0",
    usageConstraints: [
      "Approved for MVP lesson scenes.",
      "Use as an abstract supporting diagram.",
    ],
    staticLocation: "/catalog/diagram-shapes.svg",
    mediaType: "image/svg+xml",
  },
] as const satisfies readonly AssetCatalogEntry[];

export function approvedAssetById(id: string): AssetCatalogEntry | undefined {
  return approvedAssetCatalog.find((asset) => asset.id === id);
}

export function searchApprovedAssets(
  input: unknown,
): AssetCatalogSearchResponse {
  const parsed = assetCatalogSearchInputSchema.safeParse(input);
  if (!parsed.success)
    throw new PublicError(
      "validation_failed",
      "Asset catalog filters are invalid.",
      400,
      false,
      Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path.join(".") || "filters",
          issue.message,
        ]),
      ),
    );
  const filters = parsed.data;
  const requirement = compatibleRequirement(filters);
  const query = filters.query?.toLocaleLowerCase();
  const tags = filters.tags?.map((tag) => tag.toLocaleLowerCase()) ?? [];
  return assetCatalogSearchResponseSchema.parse({
    assets: approvedAssetCatalog.filter((asset) => {
      const haystack = [asset.subject, ...asset.tags].join(" ").toLowerCase();
      return (
        (query === undefined || haystack.includes(query)) &&
        tags.every((tag) =>
          asset.tags.some((assetTag) => assetTag.toLowerCase() === tag),
        ) &&
        (requirement === undefined ||
          isCatalogAssetCompatibleWithSlot(asset, requirement))
      );
    }),
  });
}

function compatibleRequirement(filters: AssetCatalogSearchInput) {
  if (filters.template === undefined || filters.slot === undefined)
    return undefined;
  return sceneAssetSlotRequirement(filters.template, filters.slot);
}
