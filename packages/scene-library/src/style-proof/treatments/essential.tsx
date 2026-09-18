/**
 * ST-094 — the Essential pack's three treatments.
 *
 * Authored intent: one idea at a time, set very large, with the subject
 * isolated in generous empty space and a warm paper ground. Motion signature is
 * `masked-reveal` — content is uncovered behind a single-axis clip and then
 * stops dead. During the hold nothing on screen moves at all, which is the
 * property a muted-excerpt reviewer should be able to attribute to Essential
 * without seeing a palette (AC11).
 */

import type { CSSProperties, JSX } from "react";
import {
  entranceProgress,
  exitProgress,
  getStyleProofIntervals,
  maskedRevealInset,
  sequentialEmphasisIndex,
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
    fontFamily: pack.typography.bodyFamily,
    height: proofCanvasHeight,
    opacity,
    overflow: "hidden",
    padding: `${pack.frame.top}px ${pack.frame.right}px ${pack.frame.bottom}px ${pack.frame.left}px`,
    position: "relative",
    width: proofCanvasWidth,
  };
}

export function EssentialHook({
  frame,
  motion,
  pack,
  resolved,
}: StyleProofTreatmentProps): JSX.Element {
  const { scene, assets, treatment } = resolved;
  if (scene.template !== "hook")
    throw new Error("EssentialHook requires a hook scene.");
  const intervals = getStyleProofIntervals(scene.durationSeconds, motion);
  const enter = entranceProgress(frame, intervals, pack);
  const leave = exitProgress(frame, intervals, pack);
  const subject = assets["subject"];
  const subjectSlot = treatment.assetSlots[0];
  const supporting = scene.visual.supportingElements ?? [];
  return (
    <main aria-label="Essential hook" style={shell(pack, leave)}>
      <div
        {...{ [styleProofRegionAttribute]: "headline" }}
        style={{
          display: "flex",
          flex: "1 1 0",
          flexDirection: "column",
          justifyContent: "center",
          minWidth: 0,
          paddingRight: pack.spacing.xl,
        }}
      >
        <ProofLabel pack={pack} style={{ marginBottom: pack.spacing.md }}>
          A question
        </ProofLabel>
        <ProofText
          fieldPath="visual.question"
          style={{ clipPath: maskedRevealInset(enter, "left") }}
        >
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
            style={{
              clipPath: maskedRevealInset(
                staggeredEntrance(frame, intervals, pack, 1, 2),
                "left",
              ),
              marginTop: pack.spacing.md,
            }}
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
        {supporting.length === 0 ? null : (
          <ul
            style={{
              display: "flex",
              gap: pack.spacing.sm,
              listStyle: "none",
              margin: `${pack.spacing.lg}px 0 0`,
              padding: 0,
            }}
          >
            {supporting.map((element, index) => (
              <li
                key={element}
                style={{
                  borderBottom: `4px solid ${pack.colors.accent}`,
                  clipPath: maskedRevealInset(
                    staggeredEntrance(
                      frame,
                      intervals,
                      pack,
                      index,
                      supporting.length,
                    ),
                    "left",
                  ),
                  fontSize: pack.typography.bodySize,
                  paddingBottom: pack.spacing.xs,
                }}
              >
                {element}
              </li>
            ))}
          </ul>
        )}
      </div>
      {subject === undefined || subjectSlot === undefined ? null : (
        <ProofImage
          asset={subject}
          pack={pack}
          region="subject"
          slot={subjectSlot}
          style={{
            alignSelf: "center",
            // The subject sits in its own generous column and is uncovered
            // upward, so its silhouette resolves after the question reads.
            clipPath: maskedRevealInset(enter, "up"),
            flex: "0 0 440px",
            height: 440,
          }}
        />
      )}
    </main>
  );
}

export function EssentialDefinition({
  frame,
  motion,
  pack,
  resolved,
}: StyleProofTreatmentProps): JSX.Element {
  const { scene, assets, treatment } = resolved;
  if (scene.template !== "definition")
    throw new Error("EssentialDefinition requires a definition scene.");
  const intervals = getStyleProofIntervals(scene.durationSeconds, motion);
  const enter = entranceProgress(frame, intervals, pack);
  const leave = exitProgress(frame, intervals, pack);
  const ruleProgress = staggeredEntrance(frame, intervals, pack, 1, 3);
  const bodyProgress = staggeredEntrance(frame, intervals, pack, 2, 3);
  const subject = assets["subject"];
  const subjectSlot = treatment.assetSlots[0];
  return (
    <main
      aria-label="Essential definition"
      style={{
        ...shell(pack, leave),
        alignItems: "center",
        flexDirection: "column",
        textAlign: "center",
      }}
    >
      <ProofText
        fieldPath="visual.term"
        style={{ clipPath: maskedRevealInset(enter, "up"), maxWidth: 1400 }}
      >
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
          {scene.visual.term}
        </h1>
      </ProofText>
      <div
        aria-hidden="true"
        style={{
          background: pack.colors.rule,
          height: 4,
          margin: `${pack.spacing.md}px 0`,
          // The rule draws outward from the centre; it is the only element that
          // changes between the entrance and the hold.
          transform: `scaleX(${ruleProgress})`,
          width: 320,
        }}
      />
      {subject === undefined || subjectSlot === undefined ? null : (
        <ProofImage
          asset={subject}
          pack={pack}
          region="subject"
          slot={subjectSlot}
          style={{
            clipPath: maskedRevealInset(ruleProgress, "up"),
            flex: "1 1 0",
            minHeight: 0,
            width: 420,
          }}
        />
      )}
      <ProofText
        fieldPath="visual.definition"
        style={{
          clipPath: maskedRevealInset(bodyProgress, "left"),
          marginTop: pack.spacing.md,
          maxWidth: 1240,
        }}
      >
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
            clipPath: maskedRevealInset(bodyProgress, "left"),
            marginTop: pack.spacing.sm,
          }}
        >
          <p
            style={{
              color: pack.colors.mutedInk,
              fontSize: pack.typography.labelSize + 8,
              margin: 0,
            }}
          >
            <ProofLabel pack={pack} style={{ marginRight: pack.spacing.xs }}>
              {scene.visual.exampleLabel}
            </ProofLabel>
            {scene.visual.exampleText}
          </p>
        </ProofText>
      )}
    </main>
  );
}

export function EssentialComparison({
  frame,
  motion,
  pack,
  resolved,
}: StyleProofTreatmentProps): JSX.Element {
  const { scene, assets, treatment } = resolved;
  if (scene.template !== "comparison")
    throw new Error("EssentialComparison requires a comparison scene.");
  const intervals = getStyleProofIntervals(scene.durationSeconds, motion);
  const enter = entranceProgress(frame, intervals, pack);
  const leave = exitProgress(frame, intervals, pack);
  const differences = scene.visual.differences;
  const active = sequentialEmphasisIndex(frame, intervals, differences.length);
  const leftSlot = treatment.assetSlots[0];
  const rightSlot = treatment.assetSlots[1];
  const left = assets["subject-left"];
  const right = assets["subject-right"];
  const subjectColumn = (
    asset: typeof left,
    slot: typeof leftSlot,
    label: string,
    fieldPath: string,
    direction: "left" | "up",
  ): JSX.Element => (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flex: "0 0 400px",
        flexDirection: "column",
        gap: pack.spacing.md,
        justifyContent: "center",
        minWidth: 0,
      }}
    >
      {asset === undefined || slot === undefined ? null : (
        <ProofImage
          asset={asset}
          pack={pack}
          region="subject"
          slot={slot}
          style={{
            clipPath: maskedRevealInset(enter, direction),
            height: 340,
            width: 340,
          }}
        />
      )}
      <ProofText fieldPath={fieldPath} style={{ textAlign: "center" }}>
        <p
          style={{
            fontFamily: pack.typography.displayFamily,
            fontSize: 48,
            fontWeight: pack.typography.displayWeight,
            letterSpacing: -1,
            margin: 0,
          }}
        >
          {label}
        </p>
      </ProofText>
    </div>
  );
  return (
    <main
      aria-label="Essential comparison"
      style={{ ...shell(pack, leave), alignItems: "stretch", gap: pack.spacing.lg }}
    >
      {subjectColumn(
        left,
        leftSlot,
        scene.visual.leftSubject.label,
        "visual.leftSubject.label",
        "left",
      )}
      <div
        {...{ [styleProofRegionAttribute]: "differences" }}
        style={{
          display: "flex",
          flex: "1 1 0",
          flexDirection: "column",
          justifyContent: "center",
          minWidth: 0,
        }}
      >
        <ProofLabel pack={pack} style={{ marginBottom: pack.spacing.sm }}>
          What differs
        </ProofLabel>
        <ol
          style={{
            display: "flex",
            flexDirection: "column",
            gap: pack.spacing.sm,
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {differences.map((difference, index) => {
            // Exactly one difference carries full ink at a time. The others
            // remain fully legible, just unemphasised: nothing is hidden.
            const isActive = index === active;
            return (
              <ProofText
                fieldPath={`visual.differences.${index}`}
                key={difference}
                style={{
                  borderLeft: `6px solid ${isActive ? pack.colors.accent : "transparent"}`,
                  clipPath: maskedRevealInset(
                    staggeredEntrance(
                      frame,
                      intervals,
                      pack,
                      index,
                      differences.length,
                    ),
                    "left",
                  ),
                  paddingLeft: pack.spacing.sm,
                }}
              >
                <li
                  style={{
                    color: isActive ? pack.colors.ink : pack.colors.mutedInk,
                    fontSize: pack.typography.bodySize,
                    fontWeight: isActive ? 600 : 400,
                    lineHeight: pack.typography.bodyLineHeight,
                  }}
                >
                  {difference}
                </li>
              </ProofText>
            );
          })}
        </ol>
        <ProofText
          fieldPath="visual.similarities"
          style={{ marginTop: pack.spacing.md }}
        >
          <p
            style={{
              color: pack.colors.mutedInk,
              fontSize: pack.typography.labelSize + 6,
              lineHeight: 1.4,
              margin: 0,
            }}
          >
            Both: {scene.visual.similarities.join(" · ")}
          </p>
        </ProofText>
      </div>
      {subjectColumn(
        right,
        rightSlot,
        scene.visual.rightSubject.label,
        "visual.rightSubject.label",
        "up",
      )}
    </main>
  );
}
