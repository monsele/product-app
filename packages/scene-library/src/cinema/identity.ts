/**
 * ST-108 (ADR-015) — the resolved visual identity of a v2 video.
 *
 * A pack is an identity, not a layout: it supplies the complete palette,
 * typography and a small set of drawing tokens, and every v2 composition
 * paints only with what this resolves. Colours derive from the manifest's
 * validated settings; nothing here reads the legacy `videoTheme` palette,
 * which is what let dark-theme text and highlights leak into light packs.
 */
import {
  creativeDesignContrastRatio,
  creativeDesignPackNames,
  type CreativeDesignPackId,
  type CreativeDesignSettings,
} from "@avlp/schemas";

export type CinemaEmphasisStyle =
  | "underline"
  | "highlight"
  | "color"
  | "block"
  | "circle";
export type CinemaSurfaceStyle = "flat" | "card" | "outline" | "paper" | "block";
export type CinemaImageFrame =
  | "none"
  | "rule"
  | "blob"
  | "rounded"
  | "paper"
  | "block";

export type CinemaIdentity = Readonly<{
  packId: CreativeDesignPackId;
  name: string;
  colors: Readonly<{
    background: string;
    surface: string;
    text: string;
    /** Secondary text, still ≥4.5:1 against the background. */
    muted: string;
    accent: string;
    /** Text drawn on an accent fill. */
    onAccent: string;
    emphasis: string;
    /** Hairlines, rules and inactive connectors. */
    line: string;
    softAccent: string;
    softEmphasis: string;
  }>;
  fonts: Readonly<{ display: string; body: string }>;
  displayWeight: number;
  /** Relative average glyph width of the display face, for text fitting. */
  displayWidth: number;
  bodyWidth: number;
  kickerUppercase: boolean;
  radius: number;
  stroke: number;
  emphasisStyle: CinemaEmphasisStyle;
  surface: CinemaSurfaceStyle;
  imageFrame: CinemaImageFrame;
  /** Light identities blend flat artwork into the page (multiply). */
  lightBackground: boolean;
}>;

function channel(color: string, offset: number): number {
  return Number.parseInt(color.slice(offset, offset + 2), 16);
}

/** Linear mix of two #rrggbb colours; `amount` 1 returns `to`. */
export function mixColor(from: string, to: string, amount: number): string {
  const value = (offset: number) =>
    Math.round(
      channel(from, offset) + (channel(to, offset) - channel(from, offset)) * amount,
    )
      .toString(16)
      .padStart(2, "0");
  return `#${value(1)}${value(3)}${value(5)}`;
}

function luminance(color: string): number {
  return (
    (0.2126 * channel(color, 1) + 0.7152 * channel(color, 3) + 0.0722 * channel(color, 5)) /
    255
  );
}

function readableOn(fill: string, candidates: readonly string[]): string {
  const best = [...candidates, "#000000", "#ffffff"].reduce((left, right) =>
    creativeDesignContrastRatio(right, fill) > creativeDesignContrastRatio(left, fill)
      ? right
      : left,
  );
  return candidates.find((candidate) => creativeDesignContrastRatio(candidate, fill) >= 4.5) ?? best;
}

/**
 * The strongest muted text that keeps 4.5:1 against the background and the
 * surface (muted text sits on cards too). Falls back to the text colour,
 * which the manifest preflight holds at 4.5:1 against both.
 */
function mutedText(text: string, background: string, surface: string): string {
  for (const amount of [0.32, 0.26, 0.2, 0.14, 0.08, 0]) {
    const muted = mixColor(text, background, amount);
    if (
      creativeDesignContrastRatio(muted, background) >= 4.5 &&
      creativeDesignContrastRatio(muted, surface) >= 4.5
    )
      return muted;
  }
  return text;
}

const fontStacks = {
  atkinson: '"Atkinson Hyperlegible", Arial, sans-serif',
  inter: '"Inter", Arial, sans-serif',
  serif: '"Source Serif 4", Georgia, serif',
  nunito: '"Nunito", Arial, sans-serif',
} as const;

type PackTokens = Omit<
  CinemaIdentity,
  "packId" | "name" | "colors" | "fonts" | "displayWidth" | "bodyWidth" | "lightBackground"
>;

const packTokens: Readonly<Record<CreativeDesignPackId, PackTokens>> = {
  essential: {
    displayWeight: 700,
    kickerUppercase: true,
    radius: 6,
    stroke: 4,
    emphasisStyle: "underline",
    surface: "flat",
    imageFrame: "none",
  },
  editorial: {
    displayWeight: 700,
    kickerUppercase: true,
    radius: 0,
    stroke: 2,
    emphasisStyle: "color",
    surface: "flat",
    imageFrame: "rule",
  },
  everyday: {
    displayWeight: 700,
    kickerUppercase: false,
    radius: 28,
    stroke: 6,
    emphasisStyle: "highlight",
    surface: "card",
    imageFrame: "blob",
  },
  systems: {
    displayWeight: 700,
    kickerUppercase: true,
    radius: 10,
    stroke: 3,
    emphasisStyle: "color",
    surface: "outline",
    imageFrame: "rounded",
  },
  "field-notes": {
    displayWeight: 600,
    kickerUppercase: false,
    radius: 4,
    stroke: 3,
    emphasisStyle: "circle",
    surface: "paper",
    imageFrame: "paper",
  },
  prism: {
    displayWeight: 700,
    kickerUppercase: true,
    radius: 0,
    stroke: 8,
    emphasisStyle: "block",
    surface: "block",
    imageFrame: "block",
  },
};

export function resolveCinemaIdentity(
  packId: CreativeDesignPackId,
  settings: CreativeDesignSettings,
): CinemaIdentity {
  const { colors } = settings;
  const fonts =
    settings.fontPair === "source-serif-inter"
      ? { display: fontStacks.serif, body: fontStacks.inter }
      : settings.fontPair === "nunito-inter"
        ? { display: fontStacks.nunito, body: fontStacks.inter }
        : { display: fontStacks.atkinson, body: fontStacks.inter };
  const displayWidth =
    settings.fontPair === "source-serif-inter"
      ? 0.52
      : settings.fontPair === "nunito-inter"
        ? 0.57
        : 0.58;
  return Object.freeze({
    packId,
    name: creativeDesignPackNames[packId],
    colors: Object.freeze({
      background: colors.background,
      surface: colors.surface,
      text: colors.text,
      muted: mutedText(colors.text, colors.background, colors.surface),
      accent: colors.accent,
      onAccent: readableOn(colors.accent, [colors.background, colors.text]),
      emphasis: colors.diagramEmphasis,
      line: mixColor(colors.text, colors.background, 0.72),
      softAccent: mixColor(colors.accent, colors.background, 0.8),
      softEmphasis: mixColor(colors.diagramEmphasis, colors.background, 0.84),
    }),
    fonts: Object.freeze(fonts),
    displayWidth,
    bodyWidth: 0.56,
    lightBackground: luminance(colors.background) > 0.6,
    ...packTokens[packId],
  });
}

/** The colour a surface actually paints, for pictures placed on it. */
export function surfaceFill(
  identity: CinemaIdentity,
  tone: "plain" | "accent" = "plain",
): string {
  const { colors } = identity;
  switch (identity.surface) {
    case "flat":
      return colors.background;
    case "card":
      return tone === "accent" ? colors.softAccent : colors.surface;
    case "block":
      return tone === "accent" ? colors.accent : colors.surface;
    default:
      return colors.surface;
  }
}

/** Styles for a content surface in this identity. Framing is decided here
 * by the identity and requested by the composition — never compulsory. */
export function surfaceStyle(
  identity: CinemaIdentity,
  options: Readonly<{ active?: boolean; tone?: "plain" | "accent" }> = {},
): Readonly<Record<string, string | number>> {
  const { colors } = identity;
  const accentTone = options.tone === "accent";
  switch (identity.surface) {
    case "flat":
      return {
        background: "transparent",
        borderTop: `${Math.max(2, identity.stroke - 1)}px solid ${options.active === true || accentTone ? colors.accent : colors.line}`,
        borderRadius: 0,
      };
    case "card":
      return {
        background: accentTone ? colors.softAccent : colors.surface,
        borderRadius: identity.radius,
        boxShadow: `0 10px 28px ${mixColor(colors.text, colors.background, 0.86)}`,
      };
    case "outline":
      return {
        background: colors.surface,
        border: `${identity.stroke - 1}px solid ${options.active === true || accentTone ? colors.accent : colors.line}`,
        borderRadius: identity.radius,
      };
    case "paper":
      return {
        background: colors.surface,
        border: `2px dashed ${options.active === true || accentTone ? colors.accent : colors.line}`,
        borderRadius: identity.radius,
      };
    case "block":
      return {
        background: accentTone ? colors.accent : colors.surface,
        borderRadius: 0,
        color: accentTone ? colors.onAccent : colors.text,
      };
  }
}
