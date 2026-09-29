/**
 * ST-109 — `sequence`: an illustrated timeline. Stops sit on one line across
 * the frame; each arrives on its narration beat, the path draws on towards
 * it, and the stop being discussed is enlarged. Worked examples end on their
 * answer; summaries close with their call to action.
 */
import { cinemaSequenceStops } from "@avlp/schemas";
import type { JSX } from "react";
import { arrival, useCinemaBeats } from "../beats.js";
import {
  absolute,
  cinemaCanvas,
  headerHeight,
  SceneHeader,
  type CinemaCompositionProps,
} from "../frame.js";
import {
  BodyText,
  Connector,
  DisplayText,
  HeroVisual,
  ItemIcon,
  NumberBadge,
  Surface,
} from "../primitives.js";
import { fitText, fitTextGroup } from "../text-fit.js";

export function SequenceComposition({
  scene,
  design,
  identity,
  hero,
  sequenceIcons,
}: CinemaCompositionProps): JSX.Element {
  const beats = useCinemaBeats();
  const stops = cinemaSequenceStops(scene) ?? [];
  const isWorked = scene.template === "worked-example";
  const pictureHero = hero.kind === "image" && !isWorked;
  const headerWidth = pictureHero ? 1360 : cinemaCanvas.right - cinemaCanvas.left;
  const headHeight = headerHeight(identity, design.display.headline, headerWidth, { maxSize: 64 });
  const problem = isWorked ? scene.visual.problem : undefined;
  const problemFit =
    problem === undefined
      ? undefined
      : fitText({ text: problem, width: headerWidth, maxLines: 3, maxSize: 34, minSize: 24, glyphWidth: identity.bodyWidth, lineHeight: 1.3 });
  const problemHeight = problemFit === undefined ? 0 : problemFit.lines * problemFit.fontSize * 1.3 + 20;
  const hasIcons = sequenceIcons.some((icon) => icon !== undefined);
  // The timeline sits in the optical middle of the space under the header,
  // never so low that its labels lose their reading room above the captions.
  const headerBottom = cinemaCanvas.top + headHeight + problemHeight;
  const lineY = Math.round(
    Math.min(
      cinemaCanvas.bottom - 220,
      Math.max(
        headerBottom + (hasIcons ? 170 : 70),
        headerBottom + (cinemaCanvas.bottom - headerBottom) * 0.42,
      ),
    ),
  );
  const answerWidth = isWorked ? 420 : 0;
  // Each stop owns an equal column, so its centred label can never reach a
  // neighbour's label, the canvas edge or the answer card.
  const boundLeft = cinemaCanvas.left;
  const boundRight = cinemaCanvas.right - (isWorked ? answerWidth + 40 : 0);
  const column = (boundRight - boundLeft) / Math.max(1, stops.length);
  const xs = stops.map((_, index) => boundLeft + column * (index + 0.5));
  const trackLeft = xs[0] ?? boundLeft;
  const trackRight = xs.at(-1) ?? boundRight;
  // Short timelines have room to spare; spend it on larger stop labels.
  const labelWidth = Math.min(stops.length <= 3 ? 480 : 420, column - 28);
  const labelBudget = cinemaCanvas.bottom - (lineY + 60);
  const labels = fitTextGroup(stops, {
    width: labelWidth,
    maxLines: 4,
    maxSize: stops.length <= 3 ? 48 : 40,
    minSize: 24,
    glyphWidth: identity.bodyWidth,
    lineHeight: 1.25,
    maxHeight: labelBudget,
  });
  const active = beats.activeItem(stops.length);
  const badge = 60;
  return (
    <>
      <SceneHeader
        identity={identity}
        design={design}
        scene={scene}
        x={cinemaCanvas.left}
        y={cinemaCanvas.top}
        width={headerWidth}
      />
      {pictureHero ? (
        <div style={{ ...absolute(1520, 70, 280, 260), ...arrival(beats.reveal("image")) }}>
          <HeroVisual drift={beats.drift} hero={hero} identity={identity} height={260} progress={1} width={280} />
        </div>
      ) : null}
      {problem === undefined || problemFit === undefined ? null : (
        <BodyText
          identity={identity}
          fontSize={problemFit.fontSize}
          muted
          style={{ ...absolute(cinemaCanvas.left, cinemaCanvas.top + headHeight + 10, headerWidth), ...arrival(beats.reveal("detail")) }}
        >
          {problem}
        </BodyText>
      )}
      <svg
        aria-hidden
        height={cinemaCanvas.height}
        style={{ left: 0, position: "absolute", top: 0 }}
        width={cinemaCanvas.width}
      >
        <line
          x1={trackLeft}
          x2={trackRight}
          y1={lineY}
          y2={lineY}
          stroke={identity.colors.line}
          strokeDasharray={identity.surface === "paper" ? "10 8" : undefined}
          strokeWidth={Math.max(2, identity.stroke - 1)}
        />
        {xs.slice(1).map((x, index) => (
          <Connector
            key={index}
            active={active === index + 2}
            arrow={false}
            from={{ x: xs[index]! + badge / 2 + 6, y: lineY }}
            identity={identity}
            progress={beats.link(index + 1)}
            to={{ x: x - badge / 2 - 6, y: lineY }}
          />
        ))}
      </svg>
      {stops.map((stop, index) => {
        const target = `item-${index + 1}`;
        const reveal = beats.reveal(target);
        const isActive = active === index + 1;
        const icon = sequenceIcons[index];
        const x = xs[index]!;
        const labelLeft = x - labelWidth / 2;
        return (
          <div key={`${index}-${stop}`} data-cinema-item={target}>
            {icon === undefined ? null : (
              <div style={{ ...absolute(x - 70, lineY - 170, 140, 140), ...arrival(reveal, "up", 20), display: "flex", justifyContent: "center" }}>
                <ItemIcon icon={icon} identity={identity} size={isActive ? 140 : 120} />
              </div>
            )}
            <div
              style={{
                ...absolute(x - badge / 2, lineY - badge / 2, badge, badge),
                opacity: reveal,
                transform: `scale(${0.6 + reveal * 0.4 + (isActive ? 0.14 : 0)})`,
              }}
            >
              <NumberBadge identity={identity} value={index + 1} size={badge} active={isActive || reveal < 1} />
            </div>
            <BodyText
              identity={identity}
              fontSize={labels.fontSize}
              muted={!isActive && active !== 0}
              style={{
                ...absolute(labelLeft, lineY + 52, labelWidth),
                ...arrival(reveal, "up", 18),
                fontWeight: isActive ? 700 : 500,
                lineHeight: 1.25,
                textAlign: "center",
              }}
            >
              {stop}
            </BodyText>
          </div>
        );
      })}
      {isWorked ? <AnswerCard lineY={lineY} {...{ scene, design, identity, hero, itemIcons: [], sequenceIcons, subjects: {} }} width={answerWidth} /> : null}
      {scene.template === "summary" && scene.visual.callToAction !== undefined ? (
        <Surface
          identity={identity}
          tone="accent"
          style={{ ...absolute(cinemaCanvas.left, cinemaCanvas.bottom - 70, 900), padding: "12px 24px", ...arrival(beats.reveal("detail")) }}
        >
          <BodyText identity={identity} fontSize={30} style={{ color: identity.surface === "block" ? identity.colors.onAccent : identity.colors.text, fontWeight: 700 }}>
            {scene.visual.callToAction}
          </BodyText>
        </Surface>
      ) : null}
    </>
  );
}

function AnswerCard({
  scene,
  identity,
  lineY,
  width,
}: CinemaCompositionProps & Readonly<{ lineY: number; width: number }>): JSX.Element | null {
  const beats = useCinemaBeats();
  if (scene.template !== "worked-example") return null;
  const progress = beats.reveal("answer");
  const fit = fitText({
    text: scene.visual.answer,
    width: width - 56,
    maxLines: 4,
    maxSize: 48,
    minSize: 24,
    glyphWidth: identity.displayWidth,
    maxHeight: cinemaCanvas.bottom - lineY - 120,
  });
  return (
    <Surface
      data-cinema-item="answer"
      identity={identity}
      tone="accent"
      style={{
        ...absolute(cinemaCanvas.right - width, lineY - 90, width),
        opacity: progress,
        padding: 28,
        transform: `scale(${0.88 + progress * 0.12})`,
        transformOrigin: "left center",
      }}
    >
      <BodyText identity={identity} fontSize={26} style={{ color: identity.surface === "block" ? identity.colors.onAccent : identity.colors.accent, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Answer
      </BodyText>
      <DisplayText
        as="p"
        identity={identity}
        fontSize={fit.fontSize}
        style={{ color: identity.surface === "block" ? identity.colors.onAccent : identity.colors.text, marginTop: 10 }}
      >
        {scene.visual.answer}
      </DisplayText>
    </Surface>
  );
}
