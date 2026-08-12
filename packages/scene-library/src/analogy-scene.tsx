import { videoTheme } from "@avlp/design-system/video-theme";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { JSX } from "react";
import type { SceneComponentProps } from "./scene-registry.js";
import { getSceneFrameTiming } from "./timing.js";

export type AnalogySceneFrameState = Readonly<{
  mappingOpacity: number;
  panelsOpacity: number;
}>;

export function getAnalogySceneFrameState(
  frame: number,
  durationSeconds: number,
): AnalogySceneFrameState {
  const current = Math.max(0, Math.floor(frame));
  const timing = getSceneFrameTiming(durationSeconds);
  const opacityAt = (start: number) =>
    interpolate(
      current,
      [start, start + videoTheme.motion.reveal.durationInFrames],
      [0, 1],
      {
        easing: Easing.bezier(...videoTheme.motion.reveal.easing),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    ) *
    interpolate(
      current,
      [timing.exitStartFrame, timing.durationInFrames],
      [1, 0],
      {
        easing: Easing.bezier(...videoTheme.motion.exit.easing),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );
  return Object.freeze({
    panelsOpacity: opacityAt(videoTheme.motion.enter.durationInFrames),
    mappingOpacity: opacityAt(
      videoTheme.motion.enter.durationInFrames +
        videoTheme.motion.reveal.durationInFrames,
    ),
  });
}

function isGeneratedAnalogy(scene: SceneComponentProps["scene"]): boolean {
  return scene.generatedAdditions.some(
    (addition) => addition.kind === "analogy",
  );
}

export function AnalogySceneFrame({
  frame,
  scene,
}: SceneComponentProps & Readonly<{ frame: number }>): JSX.Element {
  if (scene.template !== "analogy")
    throw new Error("AnalogyScene requires an analogy scene.");
  const state = getAnalogySceneFrameState(frame, scene.durationSeconds);
  const generated = isGeneratedAnalogy(scene);
  return (
    <main
      aria-label="Concept analogy"
      style={{
        background: videoTheme.colors.background,
        boxSizing: "border-box",
        color: videoTheme.colors.text,
        fontFamily: videoTheme.typography.fontFamily,
        height: "100%",
        padding: `${videoTheme.safeAreas.title.top}px ${videoTheme.safeAreas.title.right}px ${videoTheme.safeAreas.body.bottom}px ${videoTheme.safeAreas.title.left}px`,
        width: "100%",
      }}
    >
      <header style={{ marginBottom: videoTheme.spacing.md }}>
        <p
          style={{
            color: videoTheme.colors.primary,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            margin: 0,
          }}
        >
          USEFUL COMPARISON
        </p>
        <h1
          style={{
            fontSize: 52,
            lineHeight: 1.1,
            margin: `${videoTheme.spacing.xs}px 0 0`,
          }}
        >
          {scene.title ?? scene.visual.sourceConcept}
        </h1>
        {generated ? (
          <p
            data-analogy-generated-addition
            style={{
              color: videoTheme.colors.text,
              fontSize: 18,
              margin: `${videoTheme.spacing.xs}px 0 0`,
            }}
          >
            AI-added analogy — a learning aid, not a source fact
          </p>
        ) : null}
      </header>
      <section
        data-analogy-panels
        style={{
          display: "grid",
          gap: videoTheme.spacing.md,
          gridTemplateColumns: "minmax(0, 1fr) 80px minmax(0, 1fr)",
          opacity: state.panelsOpacity,
        }}
      >
        <article
          data-analogy-panel="concept"
          style={{
            border: `${videoTheme.lineWidths.emphasis}px solid ${videoTheme.colors.primary}`,
            borderRadius: videoTheme.radii.md,
            minHeight: 150,
            padding: videoTheme.spacing.md,
          }}
        >
          <p
            style={{
              color: videoTheme.colors.primary,
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: 1,
              margin: 0,
            }}
          >
            SOURCE CONCEPT
          </p>
          <h2
            style={{
              fontSize: 36,
              lineHeight: 1.15,
              margin: `${videoTheme.spacing.sm}px 0 0`,
              overflowWrap: "anywhere",
            }}
          >
            {scene.visual.sourceConcept}
          </h2>
        </article>
        <div
          aria-hidden="true"
          style={{
            alignItems: "center",
            color: videoTheme.colors.accent,
            display: "grid",
            fontSize: 56,
            fontWeight: 700,
            placeItems: "center",
          }}
        >
          ⇄
        </div>
        <article
          data-analogy-panel="familiar"
          style={{
            border: `${videoTheme.lineWidths.emphasis}px dashed ${videoTheme.colors.accent}`,
            borderRadius: videoTheme.radii.md,
            minHeight: 150,
            padding: videoTheme.spacing.md,
          }}
        >
          <p
            style={{
              color: videoTheme.colors.accent,
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: 1,
              margin: 0,
            }}
          >
            FAMILIAR SYSTEM
          </p>
          <h2
            style={{
              fontSize: 36,
              lineHeight: 1.15,
              margin: `${videoTheme.spacing.sm}px 0 0`,
              overflowWrap: "anywhere",
            }}
          >
            {scene.visual.familiarSystem}
          </h2>
        </article>
      </section>
      <section
        aria-label="Analogy mappings"
        data-analogy-mappings
        style={{
          display: "grid",
          gap: videoTheme.spacing.xs,
          marginTop: videoTheme.spacing.md,
          opacity: state.mappingOpacity,
        }}
      >
        {scene.visual.mappings.map((mapping, index) => (
          <div
            data-analogy-mapping
            key={`${mapping.concept}:${mapping.analogy}`}
            style={{
              alignItems: "center",
              background: videoTheme.colors.surface,
              borderLeft: `${videoTheme.lineWidths.emphasis}px solid ${videoTheme.colors.primary}`,
              display: "grid",
              fontSize: 24,
              gap: videoTheme.spacing.sm,
              gridTemplateColumns: "minmax(0, 1fr) 34px minmax(0, 1fr)",
              padding: `${videoTheme.spacing.xs}px ${videoTheme.spacing.sm}px`,
              transform: `translateY(${(1 - state.mappingOpacity) * (12 + index * 3)}px)`,
            }}
          >
            <strong style={{ overflowWrap: "anywhere" }}>
              {mapping.concept}
            </strong>
            <span
              aria-hidden="true"
              style={{ color: videoTheme.colors.accent, fontWeight: 700 }}
            >
              ↔
            </span>
            <span style={{ overflowWrap: "anywhere" }}>{mapping.analogy}</span>
          </div>
        ))}
      </section>
    </main>
  );
}

export function AnalogyScene({ scene }: SceneComponentProps): JSX.Element {
  return <AnalogySceneFrame frame={useCurrentFrame()} scene={scene} />;
}
