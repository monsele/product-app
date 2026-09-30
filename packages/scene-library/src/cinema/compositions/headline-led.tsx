/**
 * ST-109 — headline-led compositions for hook, definition, analogy and
 * summary scenes:
 *
 * - `illustrated-headline`: the picture takes the right half of the frame and
 *   the headline sits low on the left, asymmetric and bottom-aligned;
 * - `statement`: one oversized statement with selective emphasis, no picture;
 * - `chapter`: a numbered chapter opener with an outsized numeral and the
 *   picture inset beneath it.
 */
import { cinemaPrimaryText } from "@avlp/schemas";
import type { JSX } from "react";
import { arrival, useCinemaBeats } from "../beats.js";
import {
  absolute,
  cinemaCanvas,
  headlineAddsInformation,
  PrimaryText,
  type CinemaCompositionProps,
} from "../frame.js";
import { mixColor } from "../identity.js";
import { BodyText, HeroVisual, Kicker } from "../primitives.js";
import {
  detailFontSize,
  estimatedDetailHeight,
  primaryFit,
  SceneDetail,
} from "./detail.js";

/** A small secondary line showing the scene title when it adds information. */
function TitleLine({
  identity,
  scene,
  design,
  width,
}: Pick<CinemaCompositionProps, "identity" | "scene" | "design"> & Readonly<{ width: number }>): JSX.Element | null {
  if (!headlineAddsInformation(scene, design)) return null;
  return (
    <BodyText identity={identity} fontSize={30} muted style={{ fontWeight: 600, width }}>
      {design.display.headline}
    </BodyText>
  );
}

export function IllustratedHeadlineComposition({
  scene,
  design,
  identity,
  hero,
}: CinemaCompositionProps): JSX.Element {
  const beats = useCinemaBeats();
  const textWidth = 760;
  const primary = cinemaPrimaryText(scene, design.display);
  const framed = identity.imageFrame === "rounded" || identity.imageFrame === "paper" || identity.imageFrame === "block";
  const image = framed
    ? { x: 1000, y: 150, width: 800, height: 660 }
    : { x: 940, y: 0, width: 980, height: 860 };
  const detailSize = detailFontSize(identity, scene, textWidth, 290, 36);
  const detailHeight = estimatedDetailHeight(identity, scene, textWidth, detailSize);
  const primaryBudget = cinemaCanvas.bottom - cinemaCanvas.top - 60 - detailHeight - 90;
  const fit = primaryFit(identity, primary, textWidth, 6, 112, 34, primaryBudget);
  return (
    <>
      <div
        style={{
          ...absolute(image.x, image.y, image.width, image.height),
          ...arrival(beats.reveal("image"), "left", 40),
        }}
      >
        <HeroVisual
          bleed={!framed}
          drift={beats.drift}
          hero={hero}
          identity={identity}
          height={image.height}
          progress={1}
          width={image.width}
        />
      </div>
      <div
        style={{
          ...absolute(cinemaCanvas.left, cinemaCanvas.top, textWidth, cinemaCanvas.bottom - cinemaCanvas.top),
          display: "flex",
          flexDirection: "column",
          gap: 22,
          justifyContent: "flex-end",
        }}
      >
        <div style={arrival(beats.reveal("headline"))}>
          <Kicker identity={identity}>{design.display.kicker}</Kicker>
        </div>
        <div style={arrival(beats.reveal("headline"), "up", 40)}>
          <PrimaryText identity={identity} scene={scene} design={design} fontSize={fit.fontSize} />
        </div>
        <TitleLine identity={identity} scene={scene} design={design} width={textWidth} />
        <SceneDetail identity={identity} scene={scene} width={textWidth} fontSize={detailSize} />
      </div>
    </>
  );
}

export function StatementComposition({
  scene,
  design,
  identity,
}: CinemaCompositionProps): JSX.Element {
  const beats = useCinemaBeats();
  const primary = cinemaPrimaryText(scene, design.display);
  const colorField = identity.surface === "block";
  const width = colorField ? 1420 : 1560;
  const detailWidth = Math.min(width, 1300);
  const detailSize = detailFontSize(identity, scene, detailWidth, 300, 38);
  const detailHeight = estimatedDetailHeight(identity, scene, detailWidth, detailSize);
  // Everything in the centred column but the statement: the kicker, the
  // rule, the title line and the detail, with the gap after each.
  const gap = 30;
  const others =
    32 + gap +
    Math.max(4, identity.stroke) + gap +
    (headlineAddsInformation(scene, design) ? 40 + gap : 0) +
    (detailHeight > 0 ? detailHeight + gap : 0);
  const available = cinemaCanvas.bottom - cinemaCanvas.top - 30 - others;
  const fit = primaryFit(identity, primary, width, 5, 168, 40, Math.min(520, available));
  return (
    <>
      {colorField ? (
        <div
          aria-hidden
          style={{
            ...absolute(1640, 0, 280, cinemaCanvas.height),
            background: identity.colors.accent,
            transform: `translateX(${(1 - beats.reveal("headline")) * 280}px)`,
          }}
        />
      ) : null}
      <div
        style={{
          ...absolute(cinemaCanvas.left, cinemaCanvas.top + 30, width, cinemaCanvas.bottom - cinemaCanvas.top - 30),
          display: "flex",
          flexDirection: "column",
          gap,
          justifyContent: "center",
        }}
      >
        <div style={arrival(beats.reveal("headline"))}>
          <Kicker identity={identity}>{design.display.kicker}</Kicker>
        </div>
        <div style={arrival(beats.reveal("headline"), "up", 48)}>
          <PrimaryText identity={identity} scene={scene} design={design} fontSize={fit.fontSize} />
        </div>
        <div
          aria-hidden
          style={{
            background: identity.colors.accent,
            height: Math.max(4, identity.stroke),
            transform: `scaleX(${beats.reveal("detail")})`,
            transformOrigin: "left",
            width: 160,
          }}
        />
        <TitleLine identity={identity} scene={scene} design={design} width={detailWidth} />
        <SceneDetail identity={identity} scene={scene} width={detailWidth} fontSize={detailSize} />
      </div>
    </>
  );
}

export function ChapterComposition({
  scene,
  design,
  identity,
  hero,
}: CinemaCompositionProps): JSX.Element {
  const beats = useCinemaBeats();
  const chapter = String(design.chapter ?? scene.order).padStart(2, "0");
  const outline = identity.packId === "essential" || identity.packId === "systems";
  const right = { x: 700, width: cinemaCanvas.right - 700 };
  const primary = cinemaPrimaryText(scene, design.display);
  const detailSize = detailFontSize(identity, scene, right.width, 330, 36);
  const detailHeight = estimatedDetailHeight(identity, scene, right.width, detailSize);
  const fit = primaryFit(
    identity,
    primary,
    right.width,
    5,
    104,
    34,
    cinemaCanvas.bottom - cinemaCanvas.top - 90 - detailHeight - 80,
  );
  const numeral = beats.reveal("headline");
  return (
    <>
      <div
        aria-hidden
        data-cinema-chapter-numeral={chapter}
        style={{
          ...absolute(cinemaCanvas.left - 10, cinemaCanvas.top - 10, 520),
          color: outline ? "transparent" : identity.colors.accent,
          fontFamily: identity.fonts.display,
          fontSize: 300,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          lineHeight: 1,
          opacity: numeral,
          transform: `translateY(${(1 - numeral) * 60}px)`,
          WebkitTextStroke: outline ? `${identity.stroke + 2}px ${identity.colors.accent}` : undefined,
        }}
      >
        {chapter}
      </div>
      <div
        aria-hidden
        style={{
          ...absolute(640, cinemaCanvas.top, Math.max(2, identity.stroke - 1), cinemaCanvas.bottom - cinemaCanvas.top),
          background: identity.colors.line,
          transform: `scaleY(${numeral})`,
          transformOrigin: "top",
        }}
      />
      <div style={{ ...absolute(cinemaCanvas.left, 430, 460, 400), ...arrival(beats.reveal("image"), "up", 30) }}>
        <HeroVisual drift={beats.drift} hero={hero} identity={identity} height={400} progress={1} width={460} />
      </div>
      <div
        style={{
          ...absolute(right.x, cinemaCanvas.top, right.width, cinemaCanvas.bottom - cinemaCanvas.top),
          display: "flex",
          flexDirection: "column",
          gap: 24,
          justifyContent: "center",
        }}
      >
        <div style={arrival(beats.reveal("headline"))}>
          <Kicker identity={identity}>{`Chapter ${chapter} · ${design.display.kicker}`}</Kicker>
        </div>
        <div style={arrival(beats.reveal("headline"), "up", 36)}>
          <PrimaryText identity={identity} scene={scene} design={design} fontSize={fit.fontSize} />
        </div>
        <TitleLine identity={identity} scene={scene} design={design} width={right.width} />
        <div style={{ borderTop: `2px solid ${mixColor(identity.colors.line, identity.colors.background, 0.3)}`, paddingTop: 24 }}>
          <SceneDetail identity={identity} scene={scene} width={right.width} fontSize={detailSize} />
        </div>
      </div>
    </>
  );
}
