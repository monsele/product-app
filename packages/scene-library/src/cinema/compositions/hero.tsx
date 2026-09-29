/**
 * ST-109 — hero-diagram family.
 *
 * - `hero-annotated`: one hero visual in the centre; callouts are drawn out to
 *   it as each part is named. Labelled-diagram geometry comes from the
 *   existing collision-free callout planner; a definition annotates its
 *   picture with the term, its meaning and its example.
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
import { planDiagramCallouts } from "../../diagram-layout.js";
import {
  BodyText,
  Connector,
  HeroVisual,
  ItemIcon,
  Kicker,
  NumberBadge,
  Surface,
} from "../primitives.js";
import { fitText, fitTextGroup } from "../text-fit.js";

export function HeroAnnotatedComposition(props: CinemaCompositionProps): JSX.Element {
  return props.scene.template === "definition" ? (
    <AnnotatedDefinition {...props} />
  ) : (
    <AnnotatedDiagram {...props} />
  );
}

function AnnotatedDiagram({ scene, design, identity, hero }: CinemaCompositionProps): JSX.Element {
  const beats = useCinemaBeats();
  if (scene.template !== "labelled-diagram")
    throw new Error("The annotated hero presents labelled diagrams and definitions.");
  const plan = planDiagramCallouts(scene.visual.labels);
  const rect = plan.diagramRect;
  const active = beats.activeItem(scene.visual.labels.length);
  const indexById = new Map(scene.visual.labels.map((label, index) => [label.id, index]));
  return (
    <>
      <SceneHeader identity={identity} design={design} scene={scene} x={cinemaCanvas.left} y={cinemaCanvas.top} width={1400} maxSize={56} />
      <div style={{ ...absolute(rect.x, rect.y, rect.width, rect.height), ...arrival(beats.reveal("image"), "none") }}>
        <HeroVisual drift={beats.drift * 0.5} hero={hero} identity={identity} height={rect.height} progress={1} width={rect.width} />
      </div>
      <svg aria-hidden height={cinemaCanvas.height} style={{ left: 0, position: "absolute", top: 0 }} width={cinemaCanvas.width}>
        {plan.callouts.map((callout) => {
          const index = indexById.get(callout.id) ?? 0;
          return (
            <Connector
              key={callout.id}
              active={active === index + 1}
              arrow={false}
              from={{ x: callout.side === "left" ? callout.x + callout.width : callout.x, y: callout.y + callout.height / 2 }}
              identity={identity}
              progress={beats.reveal(`item-${index + 1}`)}
              to={{ x: callout.targetX, y: callout.targetY }}
            />
          );
        })}
      </svg>
      {plan.callouts.map((callout) => {
        const index = indexById.get(callout.id) ?? 0;
        const label = scene.visual.labels[index]!;
        const isActive = active === index + 1;
        return (
          <Surface
            key={callout.id}
            active={isActive}
            data-cinema-item={`item-${index + 1}`}
            identity={identity}
            style={{
              ...absolute(callout.x, callout.y, callout.width, callout.height),
              ...arrival(beats.reveal(`item-${index + 1}`), callout.side === "left" ? "left" : "right", 20),
              alignItems: "center",
              display: "flex",
              padding: `4px ${Math.round(callout.fontSize * 0.55)}px`,
            }}
          >
            <BodyText identity={identity} fontSize={callout.fontSize} style={{ fontWeight: isActive ? 700 : 600, lineHeight: 1.25 }}>
              {label.text}
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
        <Connector arrow={false} identity={identity} from={{ x: cinemaCanvas.left + column + 10, y: termY + 50 }} to={{ x: heroBox.x + 60, y: heroBox.y + heroBox.height * 0.3 }} progress={beats.reveal("headline")} />
        <Connector arrow={false} identity={identity} from={{ x: cinemaCanvas.right - column - 10, y: definitionY + 60 }} to={{ x: heroBox.x + heroBox.width - 60, y: heroBox.y + heroBox.height * 0.45 }} progress={beats.reveal("detail")} />
        {example === undefined ? null : (
          <Connector arrow={false} identity={identity} from={{ x: cinemaCanvas.left + column + 10, y: exampleY + 60 }} to={{ x: heroBox.x + 80, y: heroBox.y + heroBox.height * 0.75 }} progress={beats.reveal("detail")} />
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
  return (
    <>
      <div style={{ ...absolute(heroBox.x, heroBox.y, heroBox.width, heroBox.height), ...arrival(beats.reveal("image"), "none") }}>
        <HeroVisual drift={beats.drift} hero={hero} identity={identity} height={heroBox.height} progress={1} width={heroBox.width} />
      </div>
      {entries.map((entry, index) => {
        if (entry.anchor === undefined) return null;
        const repeat = seen.get(entry.anchor) ?? 0;
        seen.set(entry.anchor, repeat + 1);
        const [fx, fy] = markerPosition[entry.anchor];
        // Markers sharing an anchor cluster in rows of four, growing toward
        // the picture's centre so they stay on it.
        const x = heroBox.x + heroBox.width * fx + (repeat % 4) * 56 * (fx > 0.5 ? -1 : 1) - 26;
        const y = heroBox.y + heroBox.height * fy + Math.floor(repeat / 4) * 56 * (fy > 0.5 ? -1 : 1) - 26;
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
