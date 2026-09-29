/**
 * ST-109 — `takeaway`: a closing arrangement.
 *
 * - summary: the central idea set large with the takeaways gathered as cards
 *   and the call to action as a closing question;
 * - hook: the question set large and centred, supporting ideas as cards;
 * - worked example: the current step fills a single card and advances with
 *   the narration, then transforms into the answer. Showing one step at a
 *   time lets this arrangement present any validated worked example.
 */
import { cinemaPrimaryText } from "@avlp/schemas";
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
  DisplayText,
  HeroVisual,
  Kicker,
  NumberBadge,
  Surface,
} from "../primitives.js";
import { fitText, fitTextGroup } from "../text-fit.js";
import { primaryFit } from "./detail.js";

export function TakeawayComposition(props: CinemaCompositionProps): JSX.Element {
  if (props.scene.template === "worked-example") return <WorkedTakeaway {...props} />;
  return <CardsTakeaway {...props} />;
}

function CardsTakeaway({ scene, design, identity, hero }: CinemaCompositionProps): JSX.Element {
  const beats = useCinemaBeats();
  const isSummary = scene.template === "summary";
  const cards: readonly string[] =
    scene.template === "summary"
      ? scene.visual.takeaways.map((takeaway) => takeaway.text)
      : scene.template === "hook"
        ? (scene.visual.supportingElements ?? [])
        : [];
  const statement =
    scene.template === "summary"
      ? (scene.visual.centralModel ?? design.display.headline)
      : cinemaPrimaryText(scene, design.display);
  const secondary = scene.template === "hook" ? scene.visual.prompt : undefined;
  const closing = scene.template === "summary" ? scene.visual.callToAction : undefined;
  const picture = hero.kind === "image";
  const statementWidth = picture ? 1180 : 1500;
  const cardsTop = cards.length === 0 ? cinemaCanvas.bottom : cinemaCanvas.bottom - (cards.length > 2 ? 250 : 200);
  const closingHeight = closing === undefined ? 0 : 76;
  const statementBudget = cardsTop - cinemaCanvas.top - 90 - closingHeight - (secondary === undefined ? 0 : 70);
  const fit = primaryFit(identity, statement, statementWidth, 4, isSummary ? 88 : 128, 40, statementBudget);
  const cardWidth = cards.length === 0 ? 0 : (cinemaCanvas.right - cinemaCanvas.left - 24 * (cards.length - 1)) / cards.length;
  const cardFit = fitTextGroup(cards, {
    width: cardWidth - 48 - (isSummary ? 60 : 0),
    maxLines: 4,
    maxSize: 34,
    minSize: 24,
    glyphWidth: identity.bodyWidth,
    lineHeight: 1.25,
    maxHeight: cinemaCanvas.bottom - cardsTop - 48,
  });
  const active = beats.activeItem(cards.length);
  const statementX = picture ? cinemaCanvas.left + 460 : (cinemaCanvas.width - statementWidth) / 2;
  return (
    <>
      {picture ? (
        <div style={{ ...absolute(cinemaCanvas.left, cinemaCanvas.top, 420, cardsTop - cinemaCanvas.top - 30), ...arrival(beats.reveal("image")) }}>
          <HeroVisual drift={beats.drift} hero={hero} identity={identity} height={cardsTop - cinemaCanvas.top - 30} progress={1} width={420} />
        </div>
      ) : null}
      <div
        style={{
          ...absolute(statementX, cinemaCanvas.top, statementWidth, cardsTop - cinemaCanvas.top - 30),
          display: "flex",
          flexDirection: "column",
          gap: 22,
          justifyContent: "center",
          textAlign: picture ? "left" : "center",
        }}
      >
        <div style={arrival(beats.reveal("headline"))}>
          <Kicker identity={identity}>{design.display.kicker}</Kicker>
        </div>
        <div style={arrival(beats.reveal("headline"), "up", 40)}>
          {isSummary ? (
            <DisplayText identity={identity} fontSize={fit.fontSize}>
              {statement}
            </DisplayText>
          ) : (
            <PrimaryText identity={identity} scene={scene} design={design} fontSize={fit.fontSize} />
          )}
        </div>
        {isSummary && scene.visual.centralModel !== undefined && !headlineRepeatsPrimary(scene, design) ? (
          <BodyText identity={identity} fontSize={30} muted style={{ fontWeight: 600 }}>
            {design.display.headline}
          </BodyText>
        ) : null}
        {secondary === undefined ? null : (
          <BodyText identity={identity} fontSize={36} muted style={{ ...arrival(beats.reveal("detail")), fontWeight: 600 }}>
            {secondary}
          </BodyText>
        )}
        {closing === undefined ? null : (
          <Surface
            identity={identity}
            tone="accent"
            style={{ alignSelf: picture ? "flex-start" : "center", padding: "12px 26px", ...arrival(beats.reveal("detail")) }}
          >
            <BodyText identity={identity} fontSize={32} style={{ color: identity.surface === "block" ? identity.colors.onAccent : identity.colors.text, fontWeight: 700 }}>
              {closing}
            </BodyText>
          </Surface>
        )}
      </div>
      {cards.map((card, index) => {
        const target = `item-${index + 1}`;
        const isActive = active === index + 1;
        return (
          <Surface
            key={`${index}-${card}`}
            active={isActive}
            data-cinema-item={target}
            identity={identity}
            style={{
              ...absolute(cinemaCanvas.left + index * (cardWidth + 24), cardsTop, cardWidth, cinemaCanvas.bottom - cardsTop),
              ...arrival(beats.reveal(target), "up", 30),
              alignItems: "center",
              display: "flex",
              gap: 18,
              padding: 24,
            }}
          >
            {isSummary ? <NumberBadge identity={identity} value={index + 1} size={52} active={isActive} /> : null}
            <BodyText identity={identity} fontSize={cardFit.fontSize} style={{ fontWeight: isActive ? 700 : 600, lineHeight: 1.25 }}>
              {card}
            </BodyText>
          </Surface>
        );
      })}
    </>
  );
}

function WorkedTakeaway({ scene, design, identity }: CinemaCompositionProps): JSX.Element {
  const beats = useCinemaBeats();
  if (scene.template !== "worked-example") throw new Error("Expected a worked example.");
  const width = cinemaCanvas.right - cinemaCanvas.left;
  const headHeight = headerHeight(identity, design.display.headline, width, { maxLines: 1, maxSize: 52 });
  const problemFit = fitText({
    text: scene.visual.problem,
    width,
    maxLines: 7,
    maxSize: 36,
    minSize: 24,
    glyphWidth: identity.bodyWidth,
    lineHeight: 1.3,
    maxHeight: 240,
  });
  const problemHeight = Math.min(240, problemFit.lines * problemFit.fontSize * 1.3);
  const stageTop = cinemaCanvas.top + headHeight + 24 + problemHeight + 36;
  const dotsHeight = 56;
  const stageHeight = cinemaCanvas.bottom - stageTop - dotsHeight - 20;
  const steps = scene.visual.steps;
  const active = Math.max(1, beats.activeItem(steps.length));
  const answer = beats.reveal("answer");
  const stepFit = fitTextGroup(steps, {
    width: width - 160,
    maxLines: 6,
    maxSize: 48,
    minSize: 24,
    glyphWidth: identity.bodyWidth,
    lineHeight: 1.3,
    maxHeight: stageHeight - 60,
  });
  const answerFit = fitText({
    text: scene.visual.answer,
    width: width - 120,
    maxLines: 6,
    maxSize: 132,
    minSize: 24,
    glyphWidth: identity.displayWidth,
    maxHeight: stageHeight - 110,
  });
  const current = steps[active - 1] ?? "";
  const stepProgress = beats.reveal(`item-${active}`);
  // Cards take the height their content needs, centred in the stage, so a
  // short answer is a confident statement rather than an empty panel.
  const stepLines = fitText({
    text: current,
    width: width - 160,
    maxLines: 6,
    maxSize: stepFit.fontSize,
    minSize: stepFit.fontSize,
    glyphWidth: identity.bodyWidth,
    lineHeight: 1.3,
  }).lines;
  const stepHeight = Math.min(stageHeight, Math.max(160, stepLines * stepFit.fontSize * 1.3 + 60));
  const answerHeight = Math.min(
    stageHeight,
    Math.max(200, 60 + 32 + 14 + answerFit.lines * answerFit.fontSize * 1.08 + 20),
  );
  const stepTop = stageTop + (stageHeight - stepHeight) / 2;
  const answerTop = stageTop + (stageHeight - answerHeight) / 2;
  return (
    <>
      <SceneHeader identity={identity} design={design} scene={scene} x={cinemaCanvas.left} y={cinemaCanvas.top} width={width} maxLines={1} maxSize={52} />
      <BodyText
        identity={identity}
        fontSize={problemFit.fontSize}
        muted
        style={{ ...absolute(cinemaCanvas.left, cinemaCanvas.top + headHeight + 24, width), ...arrival(beats.reveal("detail")), fontWeight: 500, lineHeight: 1.3 }}
      >
        {scene.visual.problem}
      </BodyText>
      <Surface
        data-cinema-item={`item-${active}`}
        identity={identity}
        active
        style={{
          ...absolute(cinemaCanvas.left, stepTop, width, stepHeight),
          alignItems: "center",
          display: "flex",
          gap: 32,
          opacity: (1 - answer) * stepProgress,
          padding: "30px 40px",
          transform: `scale(${1 - answer * 0.06})`,
        }}
      >
        <NumberBadge identity={identity} value={active} size={72} active />
        <BodyText identity={identity} fontSize={stepFit.fontSize} style={{ fontWeight: 600, lineHeight: 1.3 }}>
          {current}
        </BodyText>
      </Surface>
      <Surface
        data-cinema-item="answer"
        identity={identity}
        tone="accent"
        style={{
          ...absolute(cinemaCanvas.left, answerTop, width, answerHeight),
          display: "flex",
          flexDirection: "column",
          gap: 14,
          justifyContent: "center",
          opacity: answer,
          padding: "30px 60px",
          transform: `scale(${0.94 + answer * 0.06})`,
        }}
      >
        <BodyText
          identity={identity}
          fontSize={26}
          style={{ color: identity.surface === "block" ? identity.colors.onAccent : identity.colors.accent, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}
        >
          The answer
        </BodyText>
        <DisplayText as="p" identity={identity} fontSize={answerFit.fontSize} style={{ color: identity.surface === "block" ? identity.colors.onAccent : identity.colors.text }}>
          {scene.visual.answer}
        </DisplayText>
      </Surface>
      <div style={{ ...absolute(cinemaCanvas.left, cinemaCanvas.bottom - dotsHeight, width, dotsHeight), alignItems: "center", display: "flex", gap: 14 }}>
        {steps.map((_, index) => (
          <div key={index} style={{ opacity: 0.35 + 0.65 * beats.reveal(`item-${index + 1}`) }}>
            <NumberBadge identity={identity} value={index + 1} size={index + 1 === active && answer < 0.5 ? 56 : 48} active={index + 1 <= active} />
          </div>
        ))}
      </div>
    </>
  );
}
