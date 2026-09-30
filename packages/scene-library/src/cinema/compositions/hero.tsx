/**
 * ST-109 — hero-diagram family.
 *
 * - `hero-annotated`: one hero visual in the centre; callouts are drawn out to
 *   it as each part is named, to its own part of a native shape drawing or
 *   to the frame of a picture; a definition annotates its picture with the term, its meaning and its example.
 * - `hero-indexed`: the hero on the left carries numbered markers; a matching
 *   numbered key fills the right (two columns beyond ten parts).
 */
import type { DiagramAnchor, SceneSpec } from "@avlp/schemas";
import type { JSX } from "react";
import { arrival, useCinemaBeats } from "../beats.js";
import {
  absolute,
  cinemaCanvas,
  headerHeight,
  headlineRepeatsPrimary,
  PrimaryText,
  SceneHeader,
  type CinemaCompositionProps,
} from "../frame.js";
import {
  BodyText,
  Connector,
  HeroVisual,
  heroFrameInset,
  ItemIcon,
  Kicker,
  NumberBadge,
  ShapeDiagram,
  shapePartPoints,
  Surface,
} from "../primitives.js";
import { estimateLines, estimateLineWidth, fitText, fitTextGroup } from "../text-fit.js";

export function HeroAnnotatedComposition(props: CinemaCompositionProps): JSX.Element {
  return props.scene.template === "definition" ? (
    <AnnotatedDefinition {...props} />
  ) : (
    <AnnotatedDiagram {...props} />
  );
}

const calloutColumn = 420;
const calloutGutter = 80;
const calloutGap = 14;

/**
 * Callout cards fill the two margins at the largest type that fits, in the
 * order of the parts they name. A shapes-only diagram has no picture to
 * frame, so its drawing is built from the labels and each callout runs to its
 * own part of the shape. A picture's callouts stop at its frame: a label's
 * anchor says roughly where its part is, not the exact spot.
 */
function AnnotatedDiagram({ scene, design, identity, hero }: CinemaCompositionProps): JSX.Element {
  const beats = useCinemaBeats();
  if (scene.template !== "labelled-diagram")
    throw new Error("The annotated hero presents labelled diagrams and definitions.");
  const labels = scene.visual.labels;
  const shape = hero.kind === "shape" ? hero.shape : undefined;
  const top = cinemaCanvas.top + headerHeight(identity, design.display.headline, 1400, { maxSize: 56 }) + 24;
  const box = {
    x: cinemaCanvas.left + calloutColumn + calloutGutter,
    y: top,
    width: cinemaCanvas.right - cinemaCanvas.left - 2 * (calloutColumn + calloutGutter),
    height: cinemaCanvas.bottom - top,
  };
  const points =
    shape === undefined
      ? labels.map((label) => {
          const [fx, fy] = markerPosition[label.anchor];
          return { x: box.width * fx, y: box.height * fy };
        })
      : shapePartPoints(shape, labels.map((label) => label.anchor), box.width, box.height);
  const middle = box.width / 2;

  // A part left or right of the centre line takes that margin; parts on the
  // line go to the lighter margin. Then the margins are evened out by moving
  // the parts nearest the line, so no callout crosses more of the drawing
  // than it must.
  const side: ("left" | "right" | undefined)[] = points.map((point) =>
    point.x < middle - 1 ? "left" : point.x > middle + 1 ? "right" : undefined,
  );
  const count = (wanted: "left" | "right") => side.filter((entry) => entry === wanted).length;
  side.forEach((entry, index) => {
    if (entry === undefined) side[index] = count("left") <= count("right") ? "left" : "right";
  });
  for (const heavy of ["left", "right"] as const) {
    const light = heavy === "left" ? "right" : "left";
    while (count(heavy) - count(light) > 1) {
      const movable = side
        .map((entry, index) => ({ entry, index, distance: Math.abs(points[index]!.x - middle) }))
        .filter(({ entry }) => entry === heavy)
        .sort((a, b) => a.distance - b.distance || b.index - a.index)[0]!;
      side[movable.index] = light;
    }
  }

  const perSide = Math.max(count("left"), count("right"));
  const padding = 16;
  const textWidth = calloutColumn - 52;
  const lineHeight = 1.25;
  const fit = fitTextGroup(
    labels.map((label) => label.text),
    {
      width: textWidth,
      maxLines: 4,
      maxSize: 36,
      minSize: 24,
      glyphWidth: identity.bodyWidth,
      lineHeight,
      maxHeight: (box.height - calloutGap * (perSide - 1)) / perSide - padding * 2,
    },
  );
  const cardHeight = (text: string) =>
    Math.ceil(estimateLines(text, fit.fontSize, textWidth, identity.bodyWidth) * fit.fontSize * lineHeight) + padding * 2;
  const cards = (["left", "right"] as const).flatMap((wanted) => {
    const stack = labels
      .map((label, index) => ({ label, index, point: points[index]!, height: cardHeight(label.text) }))
      .filter(({ index }) => side[index] === wanted)
      .sort((a, b) => a.point.y - b.point.y || a.index - b.index);
    // Each card sits level with its part, then moves only as far as it must
    // to clear its neighbours and stay above the caption band.
    let cursor = top;
    const placed = stack.map((card) => {
      const y = Math.max(cursor, top + card.point.y - card.height / 2);
      cursor = y + card.height + calloutGap;
      return { ...card, side: wanted, x: wanted === "left" ? cinemaCanvas.left : cinemaCanvas.right - calloutColumn, y };
    });
    let limit: number = cinemaCanvas.bottom;
    for (let index = placed.length - 1; index >= 0; index -= 1) {
      const card = placed[index]!;
      const y = Math.min(card.y, limit - card.height);
      placed[index] = { ...card, y };
      limit = y - calloutGap;
    }
    return placed;
  });
  const active = beats.activeItem(labels.length);
  return (
    <>
      <SceneHeader identity={identity} design={design} scene={scene} x={cinemaCanvas.left} y={cinemaCanvas.top} width={1400} maxSize={56} />
      <div style={{ ...absolute(box.x, box.y, box.width, box.height), ...arrival(beats.reveal("image"), "none") }}>
        {shape === undefined ? (
          <HeroVisual drift={beats.drift * 0.5} hero={hero} identity={identity} height={box.height} progress={1} width={box.width} />
        ) : (
          <ShapeDiagram
            identity={identity}
            shape={shape}
            width={box.width}
            height={box.height}
            progress={1}
            parts={points.map((point, index) => ({ ...point, reveal: beats.reveal(`item-${index + 1}`), active: active === index + 1 }))}
          />
        )}
      </div>
      <svg aria-hidden height={cinemaCanvas.height} style={{ left: 0, position: "absolute", top: 0 }} width={cinemaCanvas.width}>
        {cards.map((card) => {
          const centre = card.y + card.height / 2;
          const to =
            shape === undefined
              ? { x: card.side === "left" ? box.x : box.x + box.width, y: Math.min(box.y + box.height - 24, Math.max(box.y + 24, centre)) }
              : { x: box.x + card.point.x, y: box.y + card.point.y };
          const reveal = beats.reveal(`item-${card.index + 1}`);
          const isActive = active === card.index + 1;
          return (
            <g key={card.label.id}>
              <Connector
                active={isActive}
                arrow={false}
                from={{ x: card.side === "left" ? card.x + calloutColumn : card.x, y: centre }}
                identity={identity}
                progress={reveal}
                to={to}
              />
              <circle
                cx={to.x}
                cy={to.y}
                r={isActive ? 12 : 9}
                fill={isActive ? identity.colors.accent : identity.colors.emphasis}
                opacity={reveal}
                stroke={identity.colors.background}
                strokeWidth={3}
              />
            </g>
          );
        })}
      </svg>
      {cards.map((card) => {
        const isActive = active === card.index + 1;
        return (
          <Surface
            key={card.label.id}
            active={isActive}
            data-cinema-item={`item-${card.index + 1}`}
            identity={identity}
            style={{
              ...absolute(card.x, card.y, calloutColumn, card.height),
              ...arrival(beats.reveal(`item-${card.index + 1}`), card.side === "left" ? "left" : "right", 20),
              alignItems: "center",
              display: "flex",
              padding: "0 20px",
            }}
          >
            <BodyText identity={identity} fontSize={fit.fontSize} style={{ fontWeight: isActive ? 700 : 600, lineHeight }}>
              {card.label.text}
            </BodyText>
          </Surface>
        );
      })}
    </>
  );
}

function AnnotatedDefinition({ scene, design, identity, hero }: CinemaCompositionProps): JSX.Element {
  const beats = useCinemaBeats();
  if (scene.template !== "definition") throw new Error("Expected a definition scene.");
  const showHeadline = !headlineRepeatsPrimary(scene, design) && design.display.headline !== scene.visual.term;
  const top = cinemaCanvas.top + (showHeadline ? 90 : 0);
  const heroBox = { x: 640, y: top + 20, width: 640, height: cinemaCanvas.bottom - top - 20 };
  const column = 460;
  const termFit = fitText({ text: scene.visual.term, width: column, maxLines: 4, maxSize: 84, minSize: 40, glyphWidth: identity.displayWidth, maxHeight: 340 });
  const definitionFit = fitText({ text: scene.visual.definition, width: column - 48, maxLines: 8, maxSize: 40, minSize: 24, glyphWidth: identity.bodyWidth, lineHeight: 1.3, maxHeight: 420 });
  const example =
    scene.visual.exampleText === undefined ? undefined : `${scene.visual.exampleLabel ?? "Example"}: ${scene.visual.exampleText}`;
  const exampleFit =
    example === undefined
      ? undefined
      : fitText({ text: example, width: column - 48, maxLines: 4, maxSize: 32, minSize: 24, glyphWidth: identity.bodyWidth, lineHeight: 1.3 });
  const termY = top + 40;
  // The term's connector leaves from where the term ends, and from the
  // middle of its first line.
  const termEnd =
    termFit.lines > 1
      ? column
      : Math.min(column, estimateLineWidth(scene.visual.term, termFit.fontSize, identity.displayWidth));
  const definitionY = top + 60;
  const exampleY = cinemaCanvas.bottom - 220;
  return (
    <>
      {showHeadline ? (
        <SceneHeader identity={identity} design={design} scene={scene} x={cinemaCanvas.left} y={cinemaCanvas.top} width={1680} maxLines={1} maxSize={48} />
      ) : null}
      <div style={{ ...absolute(heroBox.x, heroBox.y, heroBox.width, heroBox.height), ...arrival(beats.reveal("image"), "none") }}>
        <HeroVisual drift={beats.drift} hero={hero} identity={identity} height={heroBox.height} progress={1} width={heroBox.width} />
      </div>
      <svg aria-hidden height={cinemaCanvas.height} style={{ left: 0, position: "absolute", top: 0 }} width={cinemaCanvas.width}>
        <Connector arrow={false} identity={identity} from={{ x: cinemaCanvas.left + termEnd + 24, y: termY + 43 + termFit.fontSize * 0.54 }} to={{ x: heroBox.x + 60, y: heroBox.y + heroBox.height * 0.3 }} progress={Math.min(beats.reveal("headline"), beats.reveal("image"))} />
        <Connector arrow={false} identity={identity} from={{ x: cinemaCanvas.right - column - 10, y: definitionY + 60 }} to={{ x: heroBox.x + heroBox.width - 60, y: heroBox.y + heroBox.height * 0.45 }} progress={Math.min(beats.reveal("detail"), beats.reveal("image"))} />
        {example === undefined ? null : (
          <Connector arrow={false} identity={identity} from={{ x: cinemaCanvas.left + column + 10, y: exampleY + 60 }} to={{ x: heroBox.x + 80, y: heroBox.y + heroBox.height * 0.75 }} progress={Math.min(beats.reveal("detail"), beats.reveal("image"))} />
        )}
      </svg>
      <div style={{ ...absolute(cinemaCanvas.left, termY, column), ...arrival(beats.reveal("headline"), "left", 30) }}>
        <Kicker identity={identity}>{design.display.kicker}</Kicker>
        <PrimaryText identity={identity} scene={scene} design={design} fontSize={termFit.fontSize} style={{ marginTop: 12 }} />
      </div>
      <Surface identity={identity} style={{ ...absolute(cinemaCanvas.right - column, definitionY, column), padding: 24, ...arrival(beats.reveal("detail"), "right", 30) }}>
        <BodyText identity={identity} fontSize={definitionFit.fontSize} style={{ fontWeight: 600 }}>
          {scene.visual.definition}
        </BodyText>
      </Surface>
      {example === undefined || exampleFit === undefined ? null : (
        <Surface identity={identity} tone="accent" style={{ ...absolute(cinemaCanvas.left, exampleY, column), padding: 24, ...arrival(beats.reveal("detail"), "up", 24) }}>
          <BodyText
            identity={identity}
            fontSize={exampleFit.fontSize}
            style={{ color: identity.surface === "block" ? identity.colors.onAccent : identity.colors.text, fontWeight: 600 }}
          >
            {example}
          </BodyText>
        </Surface>
      )}
    </>
  );
}

const markerPosition: Readonly<Record<DiagramAnchor, readonly [number, number]>> = {
  "top-left": [0.2, 0.2],
  top: [0.5, 0.14],
  "top-right": [0.8, 0.2],
  right: [0.86, 0.5],
  "bottom-right": [0.8, 0.8],
  bottom: [0.5, 0.86],
  "bottom-left": [0.2, 0.8],
  left: [0.14, 0.5],
  center: [0.5, 0.5],
};

function indexedEntries(scene: SceneSpec): readonly Readonly<{ text: string; anchor?: DiagramAnchor }>[] {
  if (scene.template === "labelled-diagram")
    return scene.visual.labels.map((label) => ({ text: label.text, anchor: label.anchor }));
  if (scene.template === "process") return (scene.visual.steps ?? []).map((text) => ({ text }));
  throw new Error(`The indexed hero does not present ${scene.template} scenes.`);
}

export function HeroIndexedComposition({ scene, design, identity, hero, itemIcons }: CinemaCompositionProps): JSX.Element {
  const beats = useCinemaBeats();
  const entries = indexedEntries(scene);
  const heroBox = { x: cinemaCanvas.left, y: cinemaCanvas.top, width: 860, height: cinemaCanvas.bottom - cinemaCanvas.top };
  const keyX = heroBox.x + heroBox.width + 70;
  const keyWidth = cinemaCanvas.right - keyX;
  const headHeight = headerHeight(identity, design.display.headline, keyWidth, { maxLines: 3, maxSize: 56 });
  const listTop = cinemaCanvas.top + headHeight + 30;
  const columns = entries.length > 10 ? 2 : 1;
  const rows = Math.ceil(entries.length / columns);
  const gap = columns === 2 ? 10 : 14;
  const cellWidth = (keyWidth - (columns - 1) * 24) / columns;
  // A short key keeps compact rows rather than spreading over the full height.
  const rowHeight = Math.min(
    130,
    (cinemaCanvas.bottom - listTop - gap * (rows - 1)) / Math.max(1, rows),
  );
  const badge = Math.max(48, Math.min(56, Math.round(rowHeight * 0.7)));
  const fit = fitTextGroup(
    entries.map((entry) => entry.text),
    {
      width: cellWidth - badge - 16,
      maxLines: 3,
      maxSize: 34,
      minSize: 24,
      glyphWidth: identity.bodyWidth,
      lineHeight: 1.2,
      maxHeight: rowHeight - 4,
    },
  );
  const active = beats.activeItem(entries.length);
  const seen = new Map<string, number>();
  // A native shape drawing carries its markers on its own parts. Beyond eight
  // parts they would crowd the drawing, so markers keep to the anchor grid.
  const inset = heroFrameInset(identity);
  const anchors = entries.flatMap((entry) => (entry.anchor === undefined ? [] : [entry.anchor]));
  const shapePoints =
    hero.kind === "shape" && anchors.length === entries.length && entries.length <= 8
      ? shapePartPoints(hero.shape, anchors, heroBox.width - inset * 2, heroBox.height - inset * 2)
      : undefined;
  return (
    <>
      <div style={{ ...absolute(heroBox.x, heroBox.y, heroBox.width, heroBox.height), ...arrival(beats.reveal("image"), "none") }}>
        <HeroVisual
          drift={beats.drift}
          hero={hero}
          identity={identity}
          height={heroBox.height}
          progress={1}
          shapeParts={shapePoints?.map((point, index) => ({ ...point, reveal: beats.reveal(`item-${index + 1}`), active: active === index + 1 }))}
          width={heroBox.width}
        />
      </div>
      {entries.map((entry, index) => {
        if (entry.anchor === undefined) return null;
        const repeat = seen.get(entry.anchor) ?? 0;
        seen.set(entry.anchor, repeat + 1);
        const [fx, fy] = markerPosition[entry.anchor];
        const part = shapePoints?.[index];
        // Markers sharing an anchor cluster in rows of four, growing toward
        // the picture's centre so they stay on it.
        const x =
          part === undefined
            ? heroBox.x + heroBox.width * fx + (repeat % 4) * 56 * (fx > 0.5 ? -1 : 1) - 26
            : heroBox.x + inset + part.x - 26;
        const y =
          part === undefined
            ? heroBox.y + heroBox.height * fy + Math.floor(repeat / 4) * 56 * (fy > 0.5 ? -1 : 1) - 26
            : heroBox.y + inset + part.y - 26;
        const reveal = beats.reveal(`item-${index + 1}`);
        return (
          <div key={`m-${index}`} style={{ ...absolute(x, y, 52, 52), opacity: reveal, transform: `scale(${0.5 + reveal * 0.5 + (active === index + 1 ? 0.2 : 0)})` }}>
            <NumberBadge identity={identity} value={index + 1} size={52} active={active === index + 1} />
          </div>
        );
      })}
      <SceneHeader identity={identity} design={design} scene={scene} x={keyX} y={cinemaCanvas.top} width={keyWidth} maxLines={3} maxSize={56} />
      <ol
        style={{
          ...absolute(keyX, listTop, keyWidth, cinemaCanvas.bottom - listTop),
          columnGap: 24,
          display: "grid",
          gridAutoFlow: "column",
          gridTemplateColumns: columns === 2 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)",
          gridTemplateRows: `repeat(${rows}, ${rowHeight}px)`,
          listStyle: "none",
          margin: 0,
          padding: 0,
          rowGap: gap,
        }}
      >
        {entries.map((entry, index) => {
          const isActive = active === index + 1;
          const icon = itemIcons[index];
          return (
            <li
              key={`${index}-${entry.text}`}
              data-cinema-item={`item-${index + 1}`}
              style={{ alignItems: "center", display: "flex", gap: 16, ...arrival(beats.reveal(`item-${index + 1}`), "right", 20) }}
            >
              {icon === undefined ? (
                <NumberBadge identity={identity} value={index + 1} size={badge} active={isActive} />
              ) : (
                <ItemIcon icon={icon} identity={identity} size={badge} />
              )}
              <BodyText identity={identity} fontSize={fit.fontSize} muted={!isActive && active !== 0} style={{ fontWeight: isActive ? 700 : 500, lineHeight: 1.2 }}>
                {entry.text}
              </BodyText>
            </li>
          );
        })}
      </ol>
    </>
  );
}
