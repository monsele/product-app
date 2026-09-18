/**
 * ST-094 — the Everyday pack's three treatments.
 *
 * Authored intent: a warm, friendly ground with rounded containers and a single
 * illustration vocabulary — 8px dark outlines, flat fills, one warm and one
 * teal accent — reused across every scene and both subjects.
 *
 * Motion signature is `object-settle`: whole illustrated objects travel a short
 * distance and settle with one damped overshoot, and their labels travel with
 * them. Nothing is uncovered behind a mask (that is Essential) and no imagery
 * drifts during the hold (that is Editorial).
 */

import type { CSSProperties, JSX } from "react";
import {
  entranceProgress,
  exitProgress,
  getStyleProofIntervals,
  objectSettle,
  staggeredEntrance,
} from "../motion.js";
import { ProofImage, ProofLabel, ProofText } from "../primitives.js";
import { styleProofRegionAttribute } from "../validation.js";
import {
  proofCanvasHeight,
  proofCanvasWidth,
  type StyleProofTreatmentProps,
} from "./types.js";

function shell(
  pack: StyleProofTreatmentProps["pack"],
  opacity: number,
): CSSProperties {
  return {
    background: pack.colors.background,
    boxSizing: "border-box",
    color: pack.colors.ink,
    display: "flex",
    flexDirection: "column",
    fontFamily: pack.typography.bodyFamily,
    height: proofCanvasHeight,
    opacity,
    overflow: "hidden",
    padding: `${pack.frame.top}px ${pack.frame.right}px ${pack.frame.bottom}px ${pack.frame.left}px`,
    position: "relative",
    width: proofCanvasWidth,
  };
}

function card(pack: StyleProofTreatmentProps["pack"]): CSSProperties {
  return {
    background: pack.colors.surface,
    border: `6px solid ${pack.colors.ink}`,
    borderRadius: 40,
    boxSizing: "border-box",
  };
}

export function EverydayHook({
  frame,
  motion,
  pack,
  resolved,
}: StyleProofTreatmentProps): JSX.Element {
  const { scene, assets, treatment } = resolved;
  if (scene.template !== "hook")
    throw new Error("EverydayHook requires a hook scene.");
  const intervals = getStyleProofIntervals(scene.durationSeconds, motion);
  const leave = exitProgress(frame, intervals, pack);
  const enter = entranceProgress(frame, intervals, pack);
  const cardSettle = objectSettle(frame, intervals, 0, 2, -120);
  const sceneSettle = objectSettle(frame, intervals, 1, 2, 160);
  const situation = assets["situation"];
  const slot = treatment.assetSlots[0];
  const supporting = scene.visual.supportingElements ?? [];
  return (
    <main aria-label="Everyday hook" style={shell(pack, leave)}>
      <div
        {...{ [styleProofRegionAttribute]: "headline" }}
        style={{
          ...card(pack),
          alignSelf: "flex-start",
          maxWidth: 1180,
          opacity: enter,
          padding: `${pack.spacing.md}px ${pack.spacing.lg}px`,
          transform: `translateY(${cardSettle.offset}px) rotate(${cardSettle.rotation * 0.2}deg)`,
        }}
      >
        <ProofLabel
          color={pack.colors.rule}
          pack={pack}
          style={{ marginBottom: pack.spacing.xs }}
        >
          Have you noticed?
        </ProofLabel>
        <ProofText fieldPath="visual.question">
          <h1
            style={{
              fontFamily: pack.typography.displayFamily,
              fontSize: pack.typography.displaySize,
              fontWeight: pack.typography.displayWeight,
              letterSpacing: pack.typography.displayTracking,
              lineHeight: pack.typography.displayLineHeight,
              margin: 0,
            }}
          >
            {scene.visual.question}
          </h1>
        </ProofText>
        {scene.visual.prompt === undefined ? null : (
          <ProofText
            fieldPath="visual.prompt"
            style={{ marginTop: pack.spacing.xs }}
          >
            <p
              style={{
                color: pack.colors.mutedInk,
                fontSize: pack.typography.bodySize,
                lineHeight: pack.typography.bodyLineHeight,
                margin: 0,
              }}
            >
              {scene.visual.prompt}
            </p>
          </ProofText>
        )}
      </div>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flex: "1 1 0",
          gap: pack.spacing.lg,
          marginTop: pack.spacing.md,
          minHeight: 0,
        }}
      >
        {situation === undefined || slot === undefined ? null : (
          <ProofImage
            asset={situation}
            pack={pack}
            region="situation"
            slot={slot}
            style={{
              flex: "1 1 0",
              height: "100%",
              minWidth: 0,
              opacity: enter,
              transform: `translateX(${sceneSettle.offset}px) rotate(${sceneSettle.rotation * 0.15}deg)`,
            }}
          />
        )}
        {supporting.length === 0 ? null : (
          <ul
            style={{
              display: "flex",
              flex: "0 0 300px",
              flexDirection: "column",
              gap: pack.spacing.sm,
              listStyle: "none",
              margin: 0,
              padding: 0,
            }}
          >
            {supporting.map((element, index) => {
              const chip = objectSettle(
                frame,
                intervals,
                index,
                supporting.length,
                60,
              );
              return (
                <li
                  key={element}
                  style={{
                    ...card(pack),
                    fontSize: pack.typography.labelSize + 4,
                    fontWeight: 700,
                    opacity: staggeredEntrance(
                      frame,
                      intervals,
                      pack,
                      index,
                      supporting.length,
                    ),
                    padding: `${pack.spacing.xs}px ${pack.spacing.sm}px`,
                    textAlign: "center",
                    transform: `translateX(${chip.offset}px)`,
                  }}
                >
                  {element}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

export function EverydayDefinition({
  frame,
  motion,
  pack,
  resolved,
}: StyleProofTreatmentProps): JSX.Element {
  const { scene, assets, treatment } = resolved;
  if (scene.template !== "definition")
    throw new Error("EverydayDefinition requires a definition scene.");
  const intervals = getStyleProofIntervals(scene.durationSeconds, motion);
  const leave = exitProgress(frame, intervals, pack);
  const enter = entranceProgress(frame, intervals, pack);
  const objectsSettle = objectSettle(frame, intervals, 0, 2, -140);
  const textSettle = objectSettle(frame, intervals, 1, 2, 90);
  const objects = assets["objects"];
  const slot = treatment.assetSlots[0];
  return (
    <main
      aria-label="Everyday definition"
      style={{ ...shell(pack, leave), flexDirection: "row", gap: pack.spacing.lg }}
    >
      {objects === undefined || slot === undefined ? null : (
        <div
          style={{
            ...card(pack),
            display: "flex",
            flex: "1 1 0",
            minWidth: 0,
            opacity: enter,
            padding: pack.spacing.md,
            transform: `translateY(${objectsSettle.offset}px) rotate(${objectsSettle.rotation * 0.25}deg)`,
          }}
        >
          <ProofImage
            asset={objects}
            pack={pack}
            region="objects"
            slot={slot}
            style={{ flex: "1 1 0", height: "100%", minWidth: 0 }}
          />
        </div>
      )}
      <div
        {...{ [styleProofRegionAttribute]: "explanation" }}
        style={{
          display: "flex",
          flex: "0 0 640px",
          flexDirection: "column",
          justifyContent: "center",
          minWidth: 0,
          transform: `translateX(${textSettle.offset}px)`,
        }}
      >
        {/* The term rides a tag pinned to the explanation card, so the two
            arrive as one object rather than as two independent fades. */}
        <div
          style={{
            background: pack.colors.accent,
            border: `6px solid ${pack.colors.ink}`,
            borderRadius: 999,
            color: "#FFFFFF",
            opacity: enter,
            padding: `${pack.spacing.xs}px ${pack.spacing.md}px`,
            marginBottom: -20,
            marginLeft: pack.spacing.md,
            position: "relative",
            zIndex: 1,
          }}
        >
          <ProofText fieldPath="visual.term">
            <p
              style={{
                fontFamily: pack.typography.displayFamily,
                fontSize: 44,
                fontWeight: pack.typography.displayWeight,
                margin: 0,
              }}
            >
              {scene.visual.term}
            </p>
          </ProofText>
        </div>
        <div
          style={{
            ...card(pack),
            opacity: enter,
            padding: `${pack.spacing.lg}px ${pack.spacing.md}px ${pack.spacing.md}px`,
          }}
        >
          <ProofText fieldPath="visual.definition">
            <p
              style={{
                fontSize: pack.typography.bodySize,
                lineHeight: pack.typography.bodyLineHeight,
                margin: 0,
              }}
            >
              {scene.visual.definition}
            </p>
          </ProofText>
          {scene.visual.exampleLabel === undefined ||
          scene.visual.exampleText === undefined ? null : (
            <ProofText
              fieldPath="visual.exampleText"
              style={{
                borderTop: `4px dashed ${pack.colors.rule}`,
                marginTop: pack.spacing.sm,
                opacity: staggeredEntrance(frame, intervals, pack, 1, 2),
                paddingTop: pack.spacing.sm,
              }}
            >
              <p
                style={{
                  color: pack.colors.mutedInk,
                  fontSize: pack.typography.labelSize + 6,
                  margin: 0,
                }}
              >
                <ProofLabel
                  color={pack.colors.rule}
                  pack={pack}
                  style={{ marginRight: pack.spacing.xs }}
                >
                  {scene.visual.exampleLabel}
                </ProofLabel>
                {scene.visual.exampleText}
              </p>
            </ProofText>
          )}
        </div>
      </div>
    </main>
  );
}

export function EverydayComparison({
  frame,
  motion,
  pack,
  resolved,
}: StyleProofTreatmentProps): JSX.Element {
  const { scene, assets, treatment } = resolved;
  if (scene.template !== "comparison")
    throw new Error("EverydayComparison requires a comparison scene.");
  const intervals = getStyleProofIntervals(scene.durationSeconds, motion);
  const leave = exitProgress(frame, intervals, pack);
  const enter = entranceProgress(frame, intervals, pack);
  const differences = scene.visual.differences;
  const scenario = (
    asset: (typeof assets)[string] | undefined,
    slot: (typeof treatment.assetSlots)[number] | undefined,
    label: string,
    fieldPath: string,
    index: number,
  ): JSX.Element => {
    const settle = objectSettle(frame, intervals, index, 2, index === 0 ? -160 : 160);
    return (
      <div
        style={{
          ...card(pack),
          display: "flex",
          flex: "1 1 0",
          flexDirection: "column",
          gap: pack.spacing.sm,
          minWidth: 0,
          opacity: enter,
          padding: pack.spacing.md,
          // Card and label move as one object — the Everyday gesture.
          transform: `translateX(${settle.offset}px) rotate(${settle.rotation * 0.2}deg)`,
        }}
      >
        {asset === undefined || slot === undefined ? null : (
          <ProofImage
            asset={asset}
            pack={pack}
            region="scenario"
            slot={slot}
            style={{ flex: "1 1 0", minHeight: 0 }}
          />
        )}
        <ProofText fieldPath={fieldPath} style={{ textAlign: "center" }}>
          <p
            style={{
              fontFamily: pack.typography.displayFamily,
              fontSize: 46,
              fontWeight: pack.typography.displayWeight,
              margin: 0,
            }}
          >
            {label}
          </p>
        </ProofText>
      </div>
    );
  };
  return (
    <main aria-label="Everyday comparison" style={shell(pack, leave)}>
      <div
        style={{
          display: "flex",
          flex: "1 1 0",
          gap: pack.spacing.lg,
          minHeight: 0,
        }}
      >
        {scenario(
          assets["scenario-left"],
          treatment.assetSlots[0],
          scene.visual.leftSubject.label,
          "visual.leftSubject.label",
          0,
        )}
        {scenario(
          assets["scenario-right"],
          treatment.assetSlots[1],
          scene.visual.rightSubject.label,
          "visual.rightSubject.label",
          1,
        )}
      </div>
      <ProofText
        fieldPath="visual.similarities"
        style={{ flex: "0 0 76px", marginTop: pack.spacing.sm, minHeight: 0 }}
      >
        <p
          style={{
            color: pack.colors.mutedInk,
            fontSize: pack.typography.labelSize,
            lineHeight: 1.3,
            margin: 0,
          }}
        >
          Both: {scene.visual.similarities.join(" · ")}
        </p>
      </ProofText>
      <div
        {...{ [styleProofRegionAttribute]: "differences" }}
        style={{
          display: "flex",
          // A fixed strip height: the scenario cards above shrink to make room,
          // so adding a fourth difference cannot push the chips down into the
          // caption band.
          flex: "0 0 148px",
          gap: pack.spacing.sm,
          minHeight: 0,
        }}
      >
        {differences.map((difference, index) => {
          // 44px of travel: the strip's bottom edge sits 54px above the
          // caption region, so this gesture stays inside the safe area for
          // every frame of the entrance rather than only once settled.
          const chip = objectSettle(
            frame,
            intervals,
            index,
            differences.length,
            44,
          );
          return (
            <ProofText
              fieldPath={`visual.differences.${index}`}
              key={difference}
              style={{
                ...card(pack),
                flex: "1 1 0",
                minHeight: 0,
                minWidth: 0,
                opacity: staggeredEntrance(
                  frame,
                  intervals,
                  pack,
                  index,
                  differences.length,
                ),
                padding: `${pack.spacing.xs}px ${pack.spacing.sm}px`,
                transform: `translateY(${chip.offset}px)`,
              }}
            >
              <p
                style={{
                  fontSize: pack.typography.labelSize + 2,
                  lineHeight: 1.3,
                  margin: 0,
                }}
              >
                {difference}
              </p>
            </ProofText>
          );
        })}
      </div>
    </main>
  );
}
