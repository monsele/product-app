/**
 * ST-109 — shared frame for v2 compositions: canvas bounds, the props every
 * composition receives, and the header most of them open with.
 *
 * Content lives between `cinemaCanvas.top` and `cinemaCanvas.bottom`, which
 * ends 40 px above the caption band (y = 876), so captions never collide with
 * validated content.
 */
import {
  cinemaPrimaryText,
  type CinemaSceneDesign,
  type SceneSpec,
} from "@avlp/schemas";
import type { CSSProperties, JSX } from "react";
import { arrival, useCinemaBeats } from "./beats.js";
import type { CinemaIdentity } from "./identity.js";
import {
  DisplayText,
  EmphasisText,
  Kicker,
  type CinemaHero,
  type CinemaIcon,
} from "./primitives.js";
import { fitText } from "./text-fit.js";

export const cinemaCanvas = Object.freeze({
  width: 1920,
  height: 1080,
  left: 120,
  right: 1800,
  top: 96,
  /** Lowest y any composition content may reach. */
  bottom: 836,
  captionTop: 876,
});

export type CinemaCompositionProps = Readonly<{
  scene: SceneSpec;
  design: CinemaSceneDesign;
  identity: CinemaIdentity;
  hero: CinemaHero;
  itemIcons: readonly (CinemaIcon | undefined)[];
  sequenceIcons: readonly (CinemaIcon | undefined)[];
  subjects: Readonly<{ left?: CinemaIcon | undefined; right?: CinemaIcon | undefined }>;
}>;

export function absolute(
  x: number,
  y: number,
  width: number,
  height?: number,
): CSSProperties {
  return {
    boxSizing: "border-box",
    left: x,
    position: "absolute",
    top: y,
    width,
    ...(height === undefined ? {} : { height }),
  };
}

/** Whether a headline would only repeat the composition's primary text. */
export function headlineRepeatsPrimary(
  scene: SceneSpec,
  design: CinemaSceneDesign,
): boolean {
  const primary = cinemaPrimaryText(scene, design.display);
  return (
    primary !== design.display.headline &&
    primary.trim().toLowerCase().replace(/[?.!]$/u, "") ===
      design.display.headline.trim().toLowerCase().replace(/[?.!]$/u, "")
  );
}

/**
 * Whether the planner took the headline word for word from content the scene
 * already shows, so a secondary line carrying it would only repeat that.
 */
export function headlineShownInContent(
  scene: SceneSpec,
  design: CinemaSceneDesign,
): boolean {
  const plain = (value: string) => value.trim().toLowerCase().replace(/[?.!]$/u, "");
  const headline = plain(design.display.headline);
  const shows = (value: unknown): boolean =>
    typeof value === "string"
      ? plain(value).includes(headline)
      : typeof value === "object" && value !== null && Object.values(value).some(shows);
  return shows(scene.visual);
}

/**
 * Whether showing the headline as a secondary line beneath the primary text
 * would tell the viewer something.
 */
export function headlineAddsInformation(
  scene: SceneSpec,
  design: CinemaSceneDesign,
): boolean {
  return (
    cinemaPrimaryText(scene, design.display) !== design.display.headline &&
    !headlineRepeatsPrimary(scene, design) &&
    !headlineShownInContent(scene, design)
  );
}

/**
 * Kicker + headline. When `primary` is set the headline is the scene's
 * primary text and carries the planned emphasis.
 */
export function SceneHeader({
  identity,
  design,
  scene,
  x,
  y,
  width,
  maxLines = 2,
  maxSize = 64,
  minSize = 36,
  align = "left",
  showHeadline = true,
}: Readonly<{
  identity: CinemaIdentity;
  design: CinemaSceneDesign;
  scene: SceneSpec;
  x: number;
  y: number;
  width: number;
  maxLines?: number;
  maxSize?: number;
  minSize?: number;
  align?: "left" | "center";
  showHeadline?: boolean;
}>): JSX.Element {
  const beats = useCinemaBeats();
  const headline = design.display.headline;
  const fit = fitText({
    text: headline,
    width,
    maxLines,
    maxSize,
    minSize,
    glyphWidth: identity.displayWidth,
  });
  const primaryIsHeadline = cinemaPrimaryText(scene, design.display) === headline;
  return (
    <header
      data-cinema-header
      style={{ ...absolute(x, y, width), textAlign: align, ...arrival(beats.reveal("headline")) }}
    >
      <Kicker identity={identity}>{design.display.kicker}</Kicker>
      {showHeadline ? (
        <DisplayText identity={identity} fontSize={fit.fontSize} style={{ marginTop: 12 }}>
          {primaryIsHeadline ? (
            <EmphasisText
              identity={identity}
              text={headline}
              words={design.display.emphasis}
              progress={beats.emphasis()}
            />
          ) : (
            headline
          )}
        </DisplayText>
      ) : null}
    </header>
  );
}

/** Height a header will occupy, for placing content beneath it. */
export function headerHeight(
  identity: CinemaIdentity,
  headline: string,
  width: number,
  options: Readonly<{ maxLines?: number; maxSize?: number; minSize?: number; showHeadline?: boolean }> = {},
): number {
  if (options.showHeadline === false) return 40;
  const fit = fitText({
    text: headline,
    width,
    maxLines: options.maxLines ?? 2,
    maxSize: options.maxSize ?? 64,
    minSize: options.minSize ?? 36,
    glyphWidth: identity.displayWidth,
  });
  // An unfittable headline still wraps past maxLines; reserve what it takes.
  return 32 + 12 + fit.lines * fit.fontSize * 1.08;
}

/** The primary text of a scene with its planned emphasis. */
export function PrimaryText({
  identity,
  scene,
  design,
  fontSize,
  style,
}: Readonly<{
  identity: CinemaIdentity;
  scene: SceneSpec;
  design: CinemaSceneDesign;
  fontSize: number;
  style?: CSSProperties;
}>): JSX.Element {
  const beats = useCinemaBeats();
  return (
    <DisplayText identity={identity} fontSize={fontSize} style={style ?? {}}>
      <EmphasisText
        identity={identity}
        text={cinemaPrimaryText(scene, design.display)}
        words={design.display.emphasis}
        progress={beats.emphasis()}
      />
    </DisplayText>
  );
}
