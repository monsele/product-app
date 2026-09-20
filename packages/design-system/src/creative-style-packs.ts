/**
 * ST-101 release metadata for production creative packs. These are finite,
 * immutable renderer references rather than user-editable theme input. The
 * resolved manifest continues to carry only registered IDs and versions.
 */
export const releasedCreativeStylePackVersion = "1.0.0" as const;

export type ReleasedCreativeStylePackId = "systems" | "field-notes" | "prism";

export type ReleasedCreativeStylePack = Readonly<{
  id: ReleasedCreativeStylePackId;
  version: typeof releasedCreativeStylePackVersion;
  motionSignature: string;
  font: Readonly<{
    family: string;
    file: string;
    checksumSha256: string;
  }>;
  colors: Readonly<{
    background: string;
    surface: string;
    text: string;
    accent: string;
  }>;
}>;

export const releasedCreativeStylePacks: Readonly<
  Record<ReleasedCreativeStylePackId, ReleasedCreativeStylePack>
> = Object.freeze({
  systems: Object.freeze({
    id: "systems",
    version: releasedCreativeStylePackVersion,
    motionSignature:
      "Relationship paths trace and a single signal settles before the readable hold.",
    font: Object.freeze({
      family: "Inter",
      file: "@fontsource/inter/files/inter-latin-600-normal.woff2",
      checksumSha256:
        "f9a06e79cd3a2a20951c0f0e28f66dd0e6d3fda73911d640a2125c8fcb78f21a",
    }),
    colors: Object.freeze({
      background: "#101828",
      surface: "#172A45",
      text: "#E6F0FF",
      accent: "#6EE7F2",
    }),
  }),
  "field-notes": Object.freeze({
    id: "field-notes",
    version: releasedCreativeStylePackVersion,
    motionSignature:
      "Observation rules draw on and annotation marks settle before the readable hold.",
    font: Object.freeze({
      family: "Source Serif 4",
      file: "@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2",
      checksumSha256:
        "f2b7e1cf1d277b7608231868135648f8ad8e2b58d8e97ca088bee15dc357bee7",
    }),
    colors: Object.freeze({
      background: "#F2E9D8",
      surface: "#E3D3B9",
      text: "#30352B",
      accent: "#9A4F32",
    }),
  }),
  prism: Object.freeze({
    id: "prism",
    version: releasedCreativeStylePackVersion,
    motionSignature:
      "Geometric chapter forms resolve into a stable high-contrast composition before the readable hold.",
    font: Object.freeze({
      family: "Inter",
      file: "@fontsource/inter/files/inter-latin-700-normal.woff2",
      checksumSha256:
        "6f56409fd3d64bb85f7d070bce20749db2d66b6d63cec586cc22d1c761be2491",
    }),
    colors: Object.freeze({
      background: "#29105A",
      surface: "#4C1D95",
      text: "#FFFFFF",
      accent: "#FACC15",
    }),
  }),
});
