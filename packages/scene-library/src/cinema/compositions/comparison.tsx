/**
 * ST-109 — comparison family.
 *
 * - `comparison-split`: two subjects face each other from the frame edges and
 *   the paired points are revealed down the middle (comparison, analogy, and
 *   input-process-output with the process at the centre);
 * - `comparison-stacked`: one subject above the other, joined by a
 *   transformation arrow, with the points listed alongside.
 */
import type { SceneSpec } from "@avlp/schemas";
import type { JSX } from "react";
import { arrival, useCinemaBeats } from "../beats.js";
import {
  absolute,
  cinemaCanvas,
  headerHeight,
  SceneHeader,
  type CinemaCompositionProps,
} from "../frame.js";
import { surfaceFill, type CinemaIdentity } from "../identity.js";
import {
  BodyText,
  Connector,
  DisplayText,
  HeroVisual,
  ItemIcon,
  Surface,
  type CinemaHero,
  type CinemaIcon,
} from "../primitives.js";
import { fitText, fitTextGroup } from "../text-fit.js";

type Side = Readonly<{
  label: string;
  caption: string;
  image?: CinemaIcon | undefined;
  /** Items listed inside the panel itself (IPO inputs and outputs). */
  items?: readonly Readonly<{ text: string; target: string; icon?: CinemaIcon | undefined }>[];
}>;

type Point = Readonly<{ text: string; target: string; marker: string }>;

/** What each side and the middle show, per scene type. */
function comparisonContent(
  scene: SceneSpec,
  subjects: CinemaCompositionProps["subjects"],
  itemIcons: CinemaCompositionProps["itemIcons"],
): Readonly<{ left: Side; right: Side; points: readonly Point[]; centre?: string; centreIcon?: CinemaIcon | undefined }> {
  if (scene.template === "comparison") {
    const differences = scene.visual.differences.map((text, index) => ({
      text,
      target: `item-${index + 1}`,
      marker: "≠",
    }));
    const similarities = scene.visual.similarities.map((text, index) => ({
      text,
      target: `item-${differences.length + index + 1}`,
      marker: "=",
    }));
    return {
      left: { label: scene.visual.leftSubject.label, caption: "", image: subjects.left },
      right: { label: scene.visual.rightSubject.label, caption: "", image: subjects.right },
      points: [...differences, ...similarities],
    };
  }
  if (scene.template === "analogy")
    return {
      left: { label: scene.visual.sourceConcept, caption: "The idea" },
      right: { label: scene.visual.familiarSystem, caption: "Is like" },
      points: scene.visual.mappings.map((mapping, index) => ({
        text: `${mapping.concept} ↔ ${mapping.analogy}`,
        target: `item-${index + 1}`,
        marker: "↔",
      })),
    };
  if (scene.template === "input-process-output") {
    const inputs = scene.visual.inputs;
    const outputs = scene.visual.outputs;
    return {
      left: {
        label: "Inputs",
        caption: "",
        items: inputs.map((item, index) => ({ text: item.label, target: `item-${index + 1}`, icon: itemIcons[index] })),
      },
      right: {
        label: "Outputs",
        caption: "",
        items: outputs.map((item, index) => ({
          text: item.label,
          target: `item-${inputs.length + 2 + index}`,
          icon: itemIcons[inputs.length + 1 + index],
        })),
      },
      points: [],
      centre: scene.visual.process.label,
      centreIcon: itemIcons[inputs.length],
    };
  }
  throw new Error(`The comparison family does not present ${scene.template} scenes.`);
}

function SidePanel({
  identity,
  side,
  target,
  x,
  y,
  width,
  height,
  hero,
}: Readonly<{
  identity: CinemaIdentity;
  side: Side;
  target: "left" | "right";
  x: number;
  y: number;
  width: number;
  height: number;
  hero?: CinemaHero | undefined;
}>): JSX.Element {
  const beats = useCinemaBeats();
  const reveal = beats.reveal(target);
  const labelFit = fitText({
    text: side.label,
    width: width - 56,
    maxLines: 3,
    maxSize: 60,
    minSize: 30,
    glyphWidth: identity.displayWidth,
  });
  const itemFit =
    side.items === undefined
      ? undefined
      : fitTextGroup(
          side.items.map((item) => item.text),
          { width: width - 56 - 72, maxLines: 2, maxSize: 34, minSize: 24, glyphWidth: identity.bodyWidth },
        );
  const pictureHeight = side.image !== undefined || hero !== undefined ? Math.min(300, height * 0.5) : 0;
  const active = beats.activeItem(40);
  return (
    <Surface
      data-cinema-side={target}
      identity={identity}
      style={{
        ...absolute(x, y, width, height),
        ...arrival(reveal, target === "left" ? "left" : "right", 50),
        display: "flex",
        flexDirection: "column",
        gap: 18,
        justifyContent: "center",
        padding: 28,
      }}
    >
      {side.image !== undefined ? (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <ItemIcon backdrop={surfaceFill(identity)} icon={side.image} identity={identity} size={pictureHeight} />
        </div>
      ) : hero !== undefined ? (
        <HeroVisual drift={beats.drift} hero={hero} identity={identity} height={pictureHeight} progress={1} width={width - 56} />
      ) : null}
      {side.caption.length === 0 ? null : (
        <BodyText identity={identity} fontSize={26} muted style={{ fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {side.caption}
        </BodyText>
      )}
      <DisplayText as="h2" identity={identity} fontSize={labelFit.fontSize}>
        {side.label}
      </DisplayText>
      {side.items === undefined || itemFit === undefined ? null : (
        <div style={{ display: "grid", gap: 14 }}>
          {side.items.map((item) => (
            <div
              key={item.target}
              data-cinema-item={item.target}
              style={{ alignItems: "center", display: "flex", gap: 16, ...arrival(beats.reveal(item.target), "up", 16) }}
            >
              {item.icon === undefined ? null : <ItemIcon backdrop={surfaceFill(identity)} icon={item.icon} identity={identity} size={56} />}
              <BodyText
                identity={identity}
                fontSize={itemFit.fontSize}
                style={{ fontWeight: active === Number(item.target.slice(5)) ? 700 : 500 }}
              >
                {item.text}
              </BodyText>
            </div>
          ))}
        </div>
      )}
    </Surface>
  );
}

function PointList({
  identity,
  points,
  width,
  height,
  columns = 1,
}: Readonly<{
  identity: CinemaIdentity;
  points: readonly Point[];
  width: number;
  height: number;
  columns?: 1 | 2;
}>): JSX.Element {
  const beats = useCinemaBeats();
  const active = beats.activeItem(points.length);
  const gap = 16;
  const markerWidth = columns === 1 ? 44 : 30;
  const fit = pointListFit(identity, points, width, height, columns);
  return (
    <div
      style={{
        display: "grid",
        gap,
        gridTemplateColumns: columns === 1 ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))",
        width,
      }}
    >
      {points.map((point, index) => {
        const isActive = active === index + 1;
        return (
          <Surface
            key={point.target}
            active={isActive}
            data-cinema-item={point.target}
            identity={identity}
            style={{
              alignItems: "center",
              display: "flex",
              gap: 14,
              padding: "12px 20px",
              transform: `${arrival(beats.reveal(point.target), "up", 18).transform} scale(${isActive ? 1.02 : 1})`,
              opacity: beats.reveal(point.target),
            }}
          >
            <span
              aria-hidden
              style={{
                color: point.marker === "≠" ? identity.colors.accent : identity.colors.emphasis,
                flexShrink: 0,
                fontFamily: identity.fonts.display,
                fontSize: columns === 1 ? 40 : 30,
                fontWeight: 700,
                lineHeight: 1,
                textAlign: "center",
                width: markerWidth,
              }}
            >
              {point.marker}
            </span>
            <BodyText identity={identity} fontSize={fit.fontSize} muted={!isActive && active !== 0} style={{ fontWeight: isActive ? 700 : 500 }}>
              {point.text}
            </BodyText>
          </Surface>
        );
      })}
    </div>
  );
}

/** One type size for the paired points, sized to the list's box. */
function pointListFit(
  identity: CinemaIdentity,
  points: readonly Point[],
  width: number,
  height: number,
  columns: 1 | 2,
) {
  const gap = 16;
  const rows = Math.max(1, Math.ceil(points.length / columns));
  const cellWidth = (width - gap * (columns - 1)) / columns;
  const markerWidth = columns === 1 ? 44 : 30;
  const rowBudget = (height - gap * (rows - 1)) / rows;
  return fitTextGroup(
    points.map((point) => point.text),
    {
      width: cellWidth - 40 - markerWidth - 14,
      maxLines: 4,
      maxSize: 34,
      minSize: 24,
      glyphWidth: identity.bodyWidth,
      lineHeight: 1.3,
      maxHeight: rowBudget - 24,
    },
  );
}

export function ComparisonSplitComposition({
  scene,
  design,
  identity,
  hero,
  itemIcons,
  subjects,
}: CinemaCompositionProps): JSX.Element {
  const beats = useCinemaBeats();
  const content = comparisonContent(scene, subjects, itemIcons);
  const headerWidth = 1500;
  const headHeight = headerHeight(identity, design.display.headline, headerWidth, { maxSize: 60 });
  const top = cinemaCanvas.top + headHeight + 36;
  const height = cinemaCanvas.bottom - top;
  const columns = content.points.length > 4 ? 2 : 1;
  // Dense paired points take width from the subject panels rather than
  // dropping below the readable type floor.
  const panelWidth =
    content.points.length > 4
      ? ([400, 340, 300].find(
          (panel) =>
            pointListFit(identity, content.points, cinemaCanvas.right - cinemaCanvas.left - 2 * (panel + 40), height, columns).fits,
        ) ?? 300)
      : 480;
  const centreX = cinemaCanvas.left + panelWidth + 40;
  const centreWidth = cinemaCanvas.right - cinemaCanvas.left - 2 * (panelWidth + 40);
  const analogyHero = scene.template === "analogy" && hero.kind === "image" ? hero : undefined;
  return (
    <>
      <SceneHeader
        align="center"
        identity={identity}
        design={design}
        scene={scene}
        x={(cinemaCanvas.width - headerWidth) / 2}
        y={cinemaCanvas.top}
        width={headerWidth}
        maxSize={60}
      />
      <SidePanel identity={identity} side={content.left} target="left" x={cinemaCanvas.left} y={top} width={panelWidth} height={height} />
      <SidePanel
        identity={identity}
        side={content.right}
        target="right"
        x={cinemaCanvas.right - panelWidth}
        y={top}
        width={panelWidth}
        height={height}
        hero={analogyHero}
      />
      {content.centre === undefined ? (
        <div style={{ ...absolute(centreX, top, centreWidth, height), alignItems: "center", display: "flex" }}>
          <PointList
            identity={identity}
            points={content.points}
            width={centreWidth}
            height={height}
            columns={columns}
          />
        </div>
      ) : (
        <IpoCentre
          identity={identity}
          label={content.centre}
          icon={content.centreIcon}
          target={`item-${scene.template === "input-process-output" ? scene.visual.inputs.length + 1 : 1}`}
          x={centreX}
          y={top}
          width={centreWidth}
          height={height}
          leftEdge={cinemaCanvas.left + panelWidth}
          rightEdge={cinemaCanvas.right - panelWidth}
          linkProgress={[beats.link(1), beats.link(2)]}
        />
      )}
    </>
  );
}

function IpoCentre({
  identity,
  label,
  icon,
  target,
  x,
  y,
  width,
  height,
  leftEdge,
  rightEdge,
  linkProgress,
}: Readonly<{
  identity: CinemaIdentity;
  label: string;
  icon?: CinemaIcon | undefined;
  target: string;
  x: number;
  y: number;
  width: number;
  height: number;
  leftEdge: number;
  rightEdge: number;
  linkProgress: readonly [number, number];
}>): JSX.Element {
  const beats = useCinemaBeats();
  const reveal = beats.reveal(target);
  const size = Math.min(width - 160, height - 40, 420);
  const cy = y + height / 2;
  const fit = fitText({ text: label, width: size - 60, maxLines: 3, maxSize: 52, minSize: 26, glyphWidth: identity.displayWidth });
  return (
    <>
      <svg aria-hidden height={cinemaCanvas.height} style={{ left: 0, position: "absolute", top: 0 }} width={cinemaCanvas.width}>
        <Connector identity={identity} from={{ x: leftEdge + 12, y: cy }} to={{ x: x + (width - size) / 2 - 12, y: cy }} progress={linkProgress[0]} />
        <Connector identity={identity} from={{ x: x + (width + size) / 2 + 12, y: cy }} to={{ x: rightEdge - 12, y: cy }} progress={linkProgress[1]} />
      </svg>
      <div
        data-cinema-item={target}
        style={{
          ...absolute(x + (width - size) / 2, cy - size / 2, size, size),
          alignItems: "center",
          background: identity.surface === "block" ? identity.colors.accent : identity.colors.softAccent,
          border: `${identity.stroke}px solid ${identity.colors.accent}`,
          borderRadius: identity.radius === 0 ? 0 : "50%",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          justifyContent: "center",
          opacity: reveal,
          padding: 30,
          transform: `scale(${0.8 + reveal * 0.2})`,
        }}
      >
        {icon === undefined ? null : <ItemIcon backdrop={identity.surface === "block" ? identity.colors.accent : identity.colors.softAccent} icon={icon} identity={identity} size={Math.round(size * 0.3)} />}
        <DisplayText
          as="p"
          identity={identity}
          fontSize={fit.fontSize}
          style={{ color: identity.surface === "block" ? identity.colors.onAccent : identity.colors.text, textAlign: "center" }}
        >
          {label}
        </DisplayText>
      </div>
    </>
  );
}

export function ComparisonStackedComposition({
  scene,
  design,
  identity,
  hero,
  itemIcons,
  subjects,
}: CinemaCompositionProps): JSX.Element {
  const beats = useCinemaBeats();
  const content = comparisonContent(scene, subjects, itemIcons);
  const leftWidth = 820;
  const gap = 90;
  const cardHeight = (cinemaCanvas.bottom - cinemaCanvas.top - gap) / 2;
  const rightX = cinemaCanvas.left + leftWidth + 70;
  const rightWidth = cinemaCanvas.right - rightX;
  const headHeight = headerHeight(identity, design.display.headline, rightWidth, { maxLines: 3, maxSize: 60 });
  const listTop = cinemaCanvas.top + headHeight + 36;
  const arrowY = cinemaCanvas.top + cardHeight;
  const analogyHero = scene.template === "analogy" && hero.kind === "image" ? hero : undefined;
  return (
    <>
      <StackedCard identity={identity} side={content.left} target="left" x={cinemaCanvas.left} y={cinemaCanvas.top} width={leftWidth} height={cardHeight} />
      <svg aria-hidden height={cinemaCanvas.height} style={{ left: 0, position: "absolute", top: 0 }} width={cinemaCanvas.width}>
        <Connector
          identity={identity}
          active
          from={{ x: cinemaCanvas.left + leftWidth / 2, y: arrowY + 10 }}
          to={{ x: cinemaCanvas.left + leftWidth / 2, y: arrowY + gap - 10 }}
          progress={beats.reveal("right")}
        />
      </svg>
      <StackedCard
        identity={identity}
        side={content.right}
        target="right"
        x={cinemaCanvas.left}
        y={arrowY + gap}
        width={leftWidth}
        height={cardHeight}
        hero={analogyHero}
      />
      <SceneHeader identity={identity} design={design} scene={scene} x={rightX} y={cinemaCanvas.top} width={rightWidth} maxLines={3} maxSize={60} />
      <div style={absolute(rightX, listTop, rightWidth, cinemaCanvas.bottom - listTop)}>
        <PointList identity={identity} points={content.points} width={rightWidth} height={cinemaCanvas.bottom - listTop} />
      </div>
    </>
  );
}

function StackedCard({
  identity,
  side,
  target,
  x,
  y,
  width,
  height,
  hero,
}: Readonly<{
  identity: CinemaIdentity;
  side: Side;
  target: "left" | "right";
  x: number;
  y: number;
  width: number;
  height: number;
  hero?: CinemaHero | undefined;
}>): JSX.Element {
  const beats = useCinemaBeats();
  const picture = side.image !== undefined || hero !== undefined;
  const pictureSize = picture ? height - 56 : 0;
  const textWidth = width - 56 - (picture ? pictureSize + 28 : 0);
  const fit = fitText({ text: side.label, width: textWidth, maxLines: 3, maxSize: 64, minSize: 30, glyphWidth: identity.displayWidth });
  return (
    <Surface
      data-cinema-side={target}
      identity={identity}
      tone={target === "right" ? "accent" : "plain"}
      style={{ ...absolute(x, y, width, height), ...arrival(beats.reveal(target), "up", 30), alignItems: "center", display: "flex", gap: 28, padding: 28 }}
    >
      {side.image !== undefined ? (
        <ItemIcon backdrop={surfaceFill(identity, target === "right" ? "accent" : "plain")} icon={side.image} identity={identity} size={pictureSize} />
      ) : hero !== undefined ? (
        <HeroVisual drift={beats.drift} hero={hero} identity={identity} height={pictureSize} progress={1} width={pictureSize} />
      ) : null}
      <div style={{ display: "grid", gap: 8, width: textWidth }}>
        {side.caption.length === 0 ? null : (
          <BodyText
            identity={identity}
            fontSize={26}
            muted={!(identity.surface === "block" && target === "right")}
            style={{
              ...(identity.surface === "block" && target === "right" ? { color: identity.colors.onAccent } : {}),
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {side.caption}
          </BodyText>
        )}
        <DisplayText
          as="h2"
          identity={identity}
          fontSize={fit.fontSize}
          style={identity.surface === "block" && target === "right" ? { color: identity.colors.onAccent } : {}}
        >
          {side.label}
        </DisplayText>
      </div>
    </Surface>
  );
}
