/**
 * ST-094 — the Editorial pack's three treatments.
 *
 * Authored intent: photographic evidence carries the argument, set on dark
 * ground with a serif headline voice and a visible source line. Compositions
 * are asymmetric and run to the canvas edge, which is the structural difference
 * from Essential's centred, inset pages.
 *
 * Motion signature is `image-push-annotation`: the evidence image drifts and
 * scales continuously for the whole scene while annotation rules draw out from
 * it and labels wipe in behind them. Text never drifts — only imagery does.
 */

import type { CSSProperties, JSX } from "react";
import {
  annotationDraw,
  editorialImagePush,
  entranceProgress,
  exitProgress,
  getStyleProofIntervals,
  maskedRevealInset,
  staggeredEntrance,
} from "../motion.js";
import {
  formatSourceLine,
  ProofImage,
  ProofLabel,
  ProofText,
} from "../primitives.js";
import {
  styleProofCaptionReserve,
  styleProofRegionAttribute,
} from "../validation.js";
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
    position: "relative",
    width: proofCanvasWidth,
  };
}

function SourceLine({
  credit,
  pack,
  progress,
  sourceRefs,
  style,
}: Readonly<{
  credit: string;
  pack: StyleProofTreatmentProps["pack"];
  progress: number;
  sourceRefs: readonly Readonly<{ pageStart: number; pageEnd?: number | undefined }>[];
  style?: CSSProperties;
}>): JSX.Element {
  return (
    <p
      {...{ [styleProofRegionAttribute]: "source" }}
      style={{
        clipPath: maskedRevealInset(progress, "left"),
        color: pack.colors.mutedInk,
        fontSize: pack.typography.labelSize,
        letterSpacing: 0.4,
        margin: 0,
        ...style,
      }}
    >
      {formatSourceLine(sourceRefs, credit)}
    </p>
  );
}

export function EditorialHook({
  frame,
  motion,
  pack,
  resolved,
}: StyleProofTreatmentProps): JSX.Element {
  const { scene, assets, treatment } = resolved;
  if (scene.template !== "hook")
    throw new Error("EditorialHook requires a hook scene.");
  const intervals = getStyleProofIntervals(scene.durationSeconds, motion);
  const enter = entranceProgress(frame, intervals, pack);
  const leave = exitProgress(frame, intervals, pack);
  const push = editorialImagePush(frame, intervals, "x");
  const evidence = assets["evidence"];
  const slot = treatment.assetSlots[0];
  const supporting = scene.visual.supportingElements ?? [];
  return (
    <main aria-label="Editorial hook" style={shell(pack, leave)}>
      <div
        {...{ [styleProofRegionAttribute]: "headline" }}
        style={{
          boxSizing: "border-box",
          display: "flex",
          flex: "0 0 54%",
          flexDirection: "column",
          justifyContent: "center",
          minWidth: 0,
          padding: `${pack.frame.top}px ${pack.spacing.xl}px ${pack.frame.bottom}px ${pack.frame.left}px`,
        }}
      >
        <ProofLabel pack={pack} style={{ marginBottom: pack.spacing.md }}>
          The question
        </ProofLabel>
        <ProofText
          fieldPath="visual.question"
          style={{ clipPath: maskedRevealInset(enter, "up") }}
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
        <div
          aria-hidden="true"
          style={{
            background: pack.colors.rule,
            height: 3,
            margin: `${pack.spacing.md}px 0`,
            transformOrigin: "left center",
            transform: `scaleX(${staggeredEntrance(frame, intervals, pack, 1, 3)})`,
            width: 260,
          }}
        />
        {scene.visual.prompt === undefined ? null : (
          <ProofText
            fieldPath="visual.prompt"
            style={{
              clipPath: maskedRevealInset(
                staggeredEntrance(frame, intervals, pack, 2, 3),
                "left",
              ),
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
          <p
            style={{
              color: pack.colors.accent,
              fontSize: pack.typography.labelSize,
              letterSpacing: pack.typography.labelTracking,
              margin: `${pack.spacing.md}px 0 0`,
              textTransform: "uppercase",
            }}
          >
            {supporting.join("  /  ")}
          </p>
        )}
      </div>
      {evidence === undefined || slot === undefined ? null : (
        <div
          style={{
            flex: "1 1 0",
            minWidth: 0,
            position: "relative",
          }}
        >
          <ProofImage
            asset={evidence}
            pack={pack}
            region="evidence"
            slot={slot}
            style={{ height: "100%", width: "100%" }}
            transform={`scale(${push.scale}) translateX(${push.translate}px)`}
          />
          <SourceLine
            credit="Original photography for ST-094"
            pack={pack}
            progress={staggeredEntrance(frame, intervals, pack, 2, 3)}
            sourceRefs={scene.sourceRefs}
            style={{
              bottom: pack.spacing.md,
              left: pack.spacing.md,
              position: "absolute",
              right: pack.spacing.md,
            }}
          />
        </div>
      )}
    </main>
  );
}

export function EditorialDefinition({
  frame,
  motion,
  pack,
  resolved,
}: StyleProofTreatmentProps): JSX.Element {
  const { scene, assets, treatment } = resolved;
  if (scene.template !== "definition")
    throw new Error("EditorialDefinition requires a definition scene.");
  const intervals = getStyleProofIntervals(scene.durationSeconds, motion);
  const leave = exitProgress(frame, intervals, pack);
  const enter = entranceProgress(frame, intervals, pack);
  const push = editorialImagePush(frame, intervals, "y");
  const evidence = assets["evidence"];
  const slot = treatment.assetSlots[0];
  const annotations = [
    { label: "Term", value: scene.visual.term },
    { label: "Means", value: scene.visual.definition },
    ...(scene.visual.exampleLabel !== undefined &&
    scene.visual.exampleText !== undefined
      ? [{ label: scene.visual.exampleLabel, value: scene.visual.exampleText }]
      : []),
  ];
  return (
    <main aria-label="Editorial definition" style={shell(pack, leave)}>
      {evidence === undefined || slot === undefined ? null : (
        <div style={{ flex: "0 0 52%", minWidth: 0, position: "relative" }}>
          <ProofImage
            asset={evidence}
            pack={pack}
            region="evidence"
            slot={slot}
            style={{ height: "100%", width: "100%" }}
            transform={`scale(${push.scale}) translateY(${push.translate}px)`}
          />
        </div>
      )}
      <div
        {...{ [styleProofRegionAttribute]: "annotation" }}
        style={{
          boxSizing: "border-box",
          display: "flex",
          flex: "1 1 0",
          flexDirection: "column",
          justifyContent: "center",
          minWidth: 0,
          padding: `${pack.frame.top}px ${pack.frame.right}px ${pack.frame.bottom}px ${pack.spacing.xl}px`,
        }}
      >
        <ProofLabel pack={pack} style={{ marginBottom: pack.spacing.md }}>
          Evidence
        </ProofLabel>
        {annotations.map((annotation, index) => {
          const draw = annotationDraw(
            frame,
            intervals,
            pack,
            index,
            annotations.length,
          );
          const fieldPath =
            index === 0
              ? "visual.term"
              : index === 1
                ? "visual.definition"
                : "visual.exampleText";
          return (
            <div
              key={annotation.label}
              style={{
                display: "flex",
                gap: pack.spacing.sm,
                marginBottom: pack.spacing.md,
              }}
            >
              {/* The rule draws leftward, out of the photograph and towards
                  its label — the annotation gesture, not a decorative wipe. */}
              <div
                aria-hidden="true"
                style={{
                  background: pack.colors.rule,
                  flex: "0 0 auto",
                  height: 3,
                  marginTop: 22,
                  transformOrigin: "left center",
                  transform: `scaleX(${draw})`,
                  width: 56,
                }}
              />
              <ProofText
                fieldPath={fieldPath}
                style={{ clipPath: maskedRevealInset(draw, "left"), minWidth: 0 }}
              >
                <p
                  style={{
                    color: pack.colors.mutedInk,
                    fontSize: pack.typography.labelSize,
                    letterSpacing: pack.typography.labelTracking,
                    margin: 0,
                    textTransform: "uppercase",
                  }}
                >
                  {annotation.label}
                </p>
                <p
                  style={{
                    fontFamily:
                      index === 0
                        ? pack.typography.displayFamily
                        : pack.typography.bodyFamily,
                    fontSize:
                      index === 0
                        ? pack.typography.displaySize * 0.62
                        : pack.typography.bodySize,
                    fontWeight: index === 0 ? pack.typography.displayWeight : 400,
                    lineHeight:
                      index === 0
                        ? pack.typography.displayLineHeight
                        : pack.typography.bodyLineHeight,
                    margin: `${pack.spacing.xs}px 0 0`,
                  }}
                >
                  {annotation.value}
                </p>
              </ProofText>
            </div>
          );
        })}
        <SourceLine
          credit="Original photography for ST-094"
          pack={pack}
          progress={enter}
          sourceRefs={scene.sourceRefs}
        />
      </div>
    </main>
  );
}

export function EditorialComparison({
  frame,
  motion,
  pack,
  resolved,
}: StyleProofTreatmentProps): JSX.Element {
  const { scene, assets, treatment } = resolved;
  if (scene.template !== "comparison")
    throw new Error("EditorialComparison requires a comparison scene.");
  const intervals = getStyleProofIntervals(scene.durationSeconds, motion);
  const leave = exitProgress(frame, intervals, pack);
  const differences = scene.visual.differences;
  const panel = (
    asset: (typeof assets)[string] | undefined,
    slot: (typeof treatment.assetSlots)[number] | undefined,
    label: string,
    fieldPath: string,
    axis: "x" | "y",
  ): JSX.Element => {
    const push = editorialImagePush(frame, intervals, axis);
    return (
      <div style={{ flex: "1 1 0", minWidth: 0, position: "relative" }}>
        {asset === undefined || slot === undefined ? null : (
          <ProofImage
            asset={asset}
            pack={pack}
            region="evidence"
            slot={slot}
            style={{ height: "100%", width: "100%" }}
            transform={
              axis === "x"
                ? `scale(${push.scale}) translateX(${push.translate}px)`
                : `scale(${push.scale}) translateY(${push.translate}px)`
            }
          />
        )}
        <ProofText
          fieldPath={fieldPath}
          style={{
            bottom: pack.spacing.md,
            clipPath: maskedRevealInset(
              entranceProgress(frame, intervals, pack),
              "left",
            ),
            left: 0,
            position: "absolute",
          }}
        >
          <p
            style={{
              background: pack.colors.background,
              color: pack.colors.ink,
              fontFamily: pack.typography.displayFamily,
              fontSize: 54,
              fontWeight: pack.typography.displayWeight,
              margin: 0,
              padding: `${pack.spacing.xs}px ${pack.spacing.md}px`,
            }}
          >
            {label}
          </p>
        </ProofText>
      </div>
    );
  };
  return (
    <main
      aria-label="Editorial comparison"
      style={{
        ...shell(pack, leave),
        flexDirection: "column",
        // The caption band is reserved, not overlaid: Editorial's evidence
        // panels run to the canvas edge, but its readable text never enters
        // the shared caption region.
        paddingBottom: styleProofCaptionReserve,
      }}
    >
      <div style={{ display: "flex", flex: "1 1 0", gap: 4, minHeight: 0 }}>
        {panel(
          assets["evidence-left"],
          treatment.assetSlots[0],
          scene.visual.leftSubject.label,
          "visual.leftSubject.label",
          "x",
        )}
        {panel(
          assets["evidence-right"],
          treatment.assetSlots[1],
          scene.visual.rightSubject.label,
          "visual.rightSubject.label",
          "y",
        )}
      </div>
      <div
        {...{ [styleProofRegionAttribute]: "differences" }}
        style={{
          boxSizing: "border-box",
          display: "flex",
          flex: "0 0 296px",
          gap: pack.spacing.lg,
          minHeight: 0,
          overflow: "hidden",
          padding: `${pack.spacing.sm}px ${pack.frame.right}px ${pack.spacing.sm}px ${pack.frame.left}px`,
        }}
      >
        <div style={{ flex: "0 0 auto" }}>
          <ProofLabel pack={pack}>What differs</ProofLabel>
          <SourceLine
            credit="Original photography"
            pack={pack}
            progress={entranceProgress(frame, intervals, pack)}
            sourceRefs={scene.sourceRefs}
            style={{ marginTop: pack.spacing.xs, maxWidth: 260 }}
          />
        </div>
        <ol
          style={{
            // An explicit grid rather than CSS multi-column: `columns` let a
            // second-column item lay out past the canvas edge, which the
            // browser preflight caught as `outside_canvas`.
            columnGap: pack.spacing.lg,
            display: "grid",
            flex: "1 1 0",
            gridAutoFlow: "column",
            gridTemplateColumns:
              differences.length > 2 ? "1fr 1fr" : "1fr",
            gridTemplateRows: `repeat(${Math.ceil(differences.length / (differences.length > 2 ? 2 : 1))}, auto)`,
            listStyle: "none",
            margin: 0,
            minWidth: 0,
            overflow: "hidden",
            padding: 0,
            rowGap: pack.spacing.xs,
          }}
        >
          {differences.map((difference, index) => (
            <ProofText
              fieldPath={`visual.differences.${index}`}
              key={difference}
              style={{
                breakInside: "avoid",
                clipPath: maskedRevealInset(
                  annotationDraw(
                    frame,
                    intervals,
                    pack,
                    index,
                    differences.length,
                  ),
                  "left",
                ),
              }}
            >
              <li
                style={{
                  fontSize: pack.typography.bodySize,
                  lineHeight: pack.typography.bodyLineHeight,
                }}
              >
                <span
                  style={{
                    color: pack.colors.accent,
                    fontWeight: 700,
                    marginRight: pack.spacing.xs,
                  }}
                >
                  {index + 1}
                </span>
                {difference}
              </li>
            </ProofText>
          ))}
        </ol>
        <ProofText
          fieldPath="visual.similarities"
          style={{ flex: "0 0 400px", minWidth: 0 }}
        >
          <p
            style={{
              color: pack.colors.mutedInk,
              fontSize: pack.typography.labelSize,
              lineHeight: 1.4,
              margin: 0,
            }}
          >
            Both: {scene.visual.similarities.join(" · ")}
          </p>
        </ProofText>
      </div>
    </main>
  );
}
