import { videoTheme } from "@avlp/design-system/video-theme";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { JSX } from "react";
import {
  resolveSafeDiagramAsset,
  type SceneComponentProps,
} from "./scene-registry.js";
import { getSceneFrameTiming } from "./timing.js";

export type SummarySceneFrameState = Readonly<{
  centralModelOpacity: number;
  takeawayOpacities: readonly number[];
}>;

function opacityAt(
  frame: number,
  start: number,
  durationSeconds: number,
): number {
  const timing = getSceneFrameTiming(durationSeconds);
  return (
    interpolate(
      frame,
      [start, start + videoTheme.motion.reveal.durationInFrames],
      [0, 1],
      {
        easing: Easing.bezier(...videoTheme.motion.reveal.easing),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    ) *
    interpolate(
      frame,
      [timing.exitStartFrame, timing.durationInFrames],
      [1, 0],
      {
        easing: Easing.bezier(...videoTheme.motion.exit.easing),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    )
  );
}

export function getSummarySceneFrameState(
  frame: number,
  durationSeconds: number,
  takeawayCount: number,
): SummarySceneFrameState {
  const timing = getSceneFrameTiming(durationSeconds);
  const count = Math.max(1, takeawayCount);
  const start = timing.enterEndFrame;
  const interval = Math.max(
    1,
    Math.floor((timing.exitStartFrame - start) / (count + 1)),
  );
  return Object.freeze({
    centralModelOpacity: opacityAt(frame, start, durationSeconds),
    takeawayOpacities: Object.freeze(
      Array.from({ length: count }, (_, index) =>
        opacityAt(frame, start + interval * (index + 1), durationSeconds),
      ),
    ),
  });
}

export function SummarySceneFrame({
  frame,
  resolvedAssets,
  runtimeMode = "preview",
  scene,
}: SceneComponentProps & Readonly<{ frame: number }>): JSX.Element {
  if (scene.template !== "summary")
    throw new Error("SummaryScene requires a summary scene.");
  const state = getSummarySceneFrameState(
    frame,
    scene.durationSeconds,
    scene.visual.takeaways.length,
  );
  const denseTakeaways = scene.visual.takeaways.length >= 4;
  const centralAssetBinding = scene.assetBindings.find(
    (binding) =>
      binding.slot === scene.visual.centralAssetSlot &&
      binding.role === "illustration",
  );
  const centralAsset = resolveSafeDiagramAsset(
    centralAssetBinding?.assetId,
    resolvedAssets,
  );
  if (
    scene.visual.centralAssetSlot !== undefined &&
    runtimeMode === "render" &&
    centralAsset === undefined
  )
    throw new Error("Summary render requires a resolved central asset.");
  return (
    <main
      aria-label="Lesson summary"
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
          KEY IDEAS
        </p>
        <h1
          style={{
            fontSize: 48,
            lineHeight: 1.1,
            margin: `${videoTheme.spacing.xs}px 0 0`,
            overflowWrap: "anywhere",
          }}
        >
          {scene.title ?? "Lesson summary"}
        </h1>
      </header>
      {scene.visual.centralModel === undefined ? null : (
        <section
          data-summary-central-model
          style={{
            background: videoTheme.colors.surface,
            border: `${videoTheme.lineWidths.emphasis}px solid ${videoTheme.colors.primary}`,
            borderRadius: videoTheme.radii.md,
            fontSize: 30,
            fontWeight: 700,
            lineHeight: 1.2,
            marginBottom: videoTheme.spacing.md,
            opacity: state.centralModelOpacity,
            overflowWrap: "anywhere",
            padding: videoTheme.spacing.md,
          }}
        >
          {scene.visual.centralModel}
        </section>
      )}
      {centralAsset === undefined ? null : (
        <img
          data-summary-central-asset
          src={centralAsset.src}
          style={{
            borderRadius: videoTheme.radii.md,
            height: 160,
            marginBottom: videoTheme.spacing.md,
            objectFit: "contain",
            opacity: state.centralModelOpacity,
            width: "100%",
          }}
        />
      )}
      <ol
        aria-label="Key takeaways"
        style={{
          display: "grid",
          gap: videoTheme.spacing.xs,
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {scene.visual.takeaways.map((takeaway, index) => (
          <li
            data-summary-takeaway
            key={`${index}-${takeaway.text}`}
            style={{
              alignItems: "center",
              background: videoTheme.colors.surface,
              borderLeft: `${videoTheme.lineWidths.emphasis}px solid ${videoTheme.colors.accent}`,
              display: "grid",
              fontSize: denseTakeaways ? 18 : 25,
              gap: videoTheme.spacing.sm,
              gridTemplateColumns: "40px minmax(0, 1fr) auto",
              lineHeight: videoTheme.typography.lineHeight,
              opacity: state.takeawayOpacities[index] ?? 0,
              overflowWrap: "anywhere",
              padding: `${denseTakeaways ? 4 : videoTheme.spacing.xs}px ${videoTheme.spacing.sm}px`,
              transform: `translateY(${(1 - (state.takeawayOpacities[index] ?? 0)) * 12}px)`,
            }}
          >
            <span
              aria-hidden="true"
              style={{ color: videoTheme.colors.accent, fontWeight: 700 }}
            >
              {index + 1}
            </span>
            <span>{takeaway.text}</span>
            {takeaway.objectiveId === undefined ? null : (
              <span
                data-summary-objective-badge
                style={{
                  background: videoTheme.colors.primary,
                  borderRadius: 999,
                  color: videoTheme.colors.background,
                  fontSize: 14,
                  fontWeight: 700,
                  padding: "4px 8px",
                }}
              >
                OBJECTIVE
              </span>
            )}
          </li>
        ))}
      </ol>
      {scene.visual.callToAction === undefined ? null : (
        <p
          data-summary-call-to-action
          style={{
            color: videoTheme.colors.primary,
            fontSize: 22,
            fontWeight: 700,
            margin: `${videoTheme.spacing.md}px 0 0`,
            overflowWrap: "anywhere",
          }}
        >
          {scene.visual.callToAction}
        </p>
      )}
    </main>
  );
}

export function SummaryScene({ scene }: SceneComponentProps): JSX.Element {
  let frame = 0;
  try {
    frame = useCurrentFrame();
  } catch {
    // The registry's server-side preview parity check has no Remotion context.
  }
  return <SummarySceneFrame frame={frame} scene={scene} />;
}
