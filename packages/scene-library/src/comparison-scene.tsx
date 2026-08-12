import { videoTheme } from "@avlp/design-system/video-theme";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { CSSProperties, JSX } from "react";
import type { ComparisonSubject } from "@avlp/schemas";
import type { SceneComponentProps } from "./scene-registry.js";
import { getSceneFrameTiming } from "./timing.js";

export type ComparisonSceneFrameState = Readonly<{
  differencesOpacity: number;
  similaritiesOpacity: number;
  subjectsOpacity: number;
}>;

export function getComparisonSceneFrameState(
  frame: number,
  durationSeconds: number,
): ComparisonSceneFrameState {
  const timing = getSceneFrameTiming(durationSeconds);
  const current = Math.max(0, Math.floor(frame));
  const reveal = (start: number) =>
    interpolate(
      current,
      [start, start + videoTheme.motion.reveal.durationInFrames],
      [0, 1],
      {
        easing: Easing.bezier(...videoTheme.motion.reveal.easing),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );
  const exit = interpolate(
    current,
    [timing.exitStartFrame, timing.durationInFrames],
    [1, 0],
    {
      easing: Easing.bezier(...videoTheme.motion.exit.easing),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const start = videoTheme.motion.enter.durationInFrames;
  return Object.freeze({
    subjectsOpacity: reveal(start) * exit,
    similaritiesOpacity:
      reveal(start + videoTheme.motion.reveal.durationInFrames) * exit,
    differencesOpacity:
      reveal(start + 2 * videoTheme.motion.reveal.durationInFrames) * exit,
  });
}

function subjectAsset(
  scene: Extract<SceneComponentProps["scene"], { template: "comparison" }>,
  subject: ComparisonSubject,
  fallbackSlot: "left-subject-image" | "right-subject-image",
) {
  const slot = subject.assetSlot ?? fallbackSlot;
  return scene.assetBindings.find(
    (binding) =>
      binding.slot === slot &&
      ["diagram", "illustration", "photo", "supporting"].includes(binding.role),
  );
}

function SubjectCard({
  asset,
  label,
  opacity,
  side,
}: Readonly<{
  asset: ReturnType<typeof subjectAsset>;
  label: string;
  opacity: number;
  side: "left" | "right";
}>): JSX.Element {
  return (
    <section
      aria-label={label}
      data-comparison-subject={side}
      style={{
        alignItems: "center",
        background: videoTheme.colors.surface,
        border: `${videoTheme.lineWidths.emphasis}px solid ${videoTheme.colors.primary}`,
        borderRadius: videoTheme.radii.md,
        boxSizing: "border-box",
        display: "grid",
        gap: videoTheme.spacing.sm,
        gridTemplateColumns: asset === undefined ? "minmax(0, 1fr)" : "120px minmax(0, 1fr)",
        minHeight: 120,
        opacity,
        padding: videoTheme.spacing.sm,
        transform: `translateY(${(1 - opacity) * 24}px)`,
      }}
    >
      {asset === undefined ? null : (
        <div
          aria-label={asset.altText ?? `Image for ${label}`}
          data-comparison-asset-slot={asset.slot}
          style={{
            background: videoTheme.colors.background,
            borderRadius: videoTheme.radii.md,
            display: "grid",
            height: 112,
            placeItems: "center",
            width: 112,
          }}
        >
          <span aria-hidden="true" style={{ color: videoTheme.colors.accent, fontSize: 48 }}>
            ◉
          </span>
        </div>
      )}
      <h2
        style={{
          fontSize: 32,
          lineHeight: videoTheme.typography.lineHeight,
          margin: 0,
          overflowWrap: "anywhere",
        }}
      >
        {label}
      </h2>
    </section>
  );
}

function TraitList({
  heading,
  items,
  opacity,
  variant,
}: Readonly<{
  heading: string;
  items: readonly string[];
  opacity: number;
  variant: "difference" | "similarity";
}>): JSX.Element {
  const accent = variant === "similarity" ? videoTheme.colors.accent : videoTheme.colors.primary;
  return (
    <section
      aria-label={heading}
      data-comparison-traits={variant}
      style={{ opacity, transform: `translateY(${(1 - opacity) * 18}px)` }}
    >
      <h2 style={{ color: accent, fontSize: 24, letterSpacing: 2, margin: `0 0 ${videoTheme.spacing.xs}px` }}>
        {heading}
      </h2>
      <ul style={{ display: "grid", gap: videoTheme.spacing.xs, listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((item) => (
          <li
            key={item}
            style={{
              borderLeft: `${videoTheme.lineWidths.emphasis}px solid ${accent}`,
              fontSize: 23,
              lineHeight: videoTheme.typography.lineHeight,
              paddingLeft: videoTheme.spacing.sm,
              overflowWrap: "anywhere",
            }}
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ComparisonSceneFrame({
  frame,
  scene,
}: SceneComponentProps & Readonly<{ frame: number }>): JSX.Element {
  if (scene.template !== "comparison")
    throw new Error("ComparisonScene requires a comparison scene.");
  const state = getComparisonSceneFrameState(frame, scene.durationSeconds);
  const leftAsset = subjectAsset(scene, scene.visual.leftSubject, "left-subject-image");
  const rightAsset = subjectAsset(scene, scene.visual.rightSubject, "right-subject-image");
  const sectionStyle: CSSProperties = {
    boxSizing: "border-box",
    display: "grid",
    gap: videoTheme.spacing.md,
    gridTemplateRows: "auto auto minmax(0, 1fr)",
    height: "100%",
    padding: `${videoTheme.safeAreas.title.top}px ${videoTheme.safeAreas.title.right}px ${videoTheme.safeAreas.body.bottom}px ${videoTheme.safeAreas.title.left}px`,
  };
  return (
    <main aria-label="Concept comparison" style={{ background: videoTheme.colors.background, color: videoTheme.colors.text, fontFamily: videoTheme.typography.fontFamily, height: "100%", width: "100%" }}>
      <section style={sectionStyle}>
        <header>
          <p style={{ color: videoTheme.colors.primary, fontSize: videoTheme.typography.bodySize, fontWeight: 700, letterSpacing: 2, margin: 0 }}>
            COMPARE AND CONTRAST
          </p>
          <h1 style={{ display: "-webkit-box", fontSize: 56, lineHeight: 1.1, margin: `${videoTheme.spacing.xs}px 0 0`, maxHeight: 124, overflow: "hidden", overflowWrap: "anywhere", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}>
            {scene.title ?? `${scene.visual.leftSubject.label} and ${scene.visual.rightSubject.label}`}
          </h1>
        </header>
        <div data-comparison-subjects style={{ display: "grid", gap: videoTheme.spacing.md, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
          <SubjectCard asset={leftAsset} label={scene.visual.leftSubject.label} opacity={state.subjectsOpacity} side="left" />
          <SubjectCard asset={rightAsset} label={scene.visual.rightSubject.label} opacity={state.subjectsOpacity} side="right" />
        </div>
        <div data-comparison-layout style={{ alignSelf: "start", display: "grid", gap: videoTheme.spacing.lg, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
          <TraitList heading="SHARED TRAITS" items={scene.visual.similarities} opacity={state.similaritiesOpacity} variant="similarity" />
          <TraitList heading="KEY DIFFERENCES" items={scene.visual.differences} opacity={state.differencesOpacity} variant="difference" />
        </div>
      </section>
    </main>
  );
}

export function ComparisonScene({ scene }: SceneComponentProps): JSX.Element {
  return <ComparisonSceneFrame frame={useCurrentFrame()} scene={scene} />;
}
