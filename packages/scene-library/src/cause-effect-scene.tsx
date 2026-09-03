import { videoTheme } from "@avlp/design-system/video-theme";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { CSSProperties, JSX } from "react";
import type { CauseEffectNode } from "@avlp/schemas";
import type { SceneComponentProps } from "./scene-registry.js";
import { getSceneFrameTiming } from "./timing.js";
import { GraphDiagram } from "./graph-diagram.js";

export type CauseEffectLayout = "chain" | "branching";
export type CauseEffectSceneFrameState = Readonly<{
  causesOpacity: number;
  mechanismOpacity: number;
  effectsOpacity: number;
  connectionOpacity: number;
}>;

export function selectCauseEffectLayout(
  causes: readonly CauseEffectNode[],
  effects: readonly CauseEffectNode[],
): CauseEffectLayout {
  return causes.length === 1 && effects.length === 1 ? "chain" : "branching";
}

export function getCauseEffectSceneFrameState(
  frame: number,
  durationSeconds: number,
): CauseEffectSceneFrameState {
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
    causesOpacity: reveal(start) * exit,
    mechanismOpacity:
      reveal(start + videoTheme.motion.reveal.durationInFrames) * exit,
    effectsOpacity:
      reveal(start + 2 * videoTheme.motion.reveal.durationInFrames) * exit,
    connectionOpacity:
      reveal(start + videoTheme.motion.reveal.durationInFrames / 2) * exit,
  });
}

function assetFor(
  scene: Extract<SceneComponentProps["scene"], { template: "cause-effect" }>,
  node: CauseEffectNode,
) {
  return node.assetSlot === undefined
    ? undefined
    : scene.assetBindings.find(
        (binding) =>
          binding.slot === node.assetSlot &&
          ["diagram", "icon", "illustration", "photo", "supporting"].includes(
            binding.role,
          ),
      );
}

function CausalNode({
  node,
  opacity,
  scene,
  kind,
}: Readonly<{
  node: CauseEffectNode;
  opacity: number;
  scene: Extract<SceneComponentProps["scene"], { template: "cause-effect" }>;
  kind: "cause" | "mechanism" | "effect";
}>): JSX.Element {
  const asset = assetFor(scene, node);
  const accent =
    kind === "mechanism" ? videoTheme.colors.accent : videoTheme.colors.primary;
  return (
    <article
      data-cause-effect-node={kind}
      data-cause-effect-node-id={node.id}
      style={{
        alignItems: "center",
        background: videoTheme.colors.surface,
        border: `${videoTheme.lineWidths.emphasis}px solid ${accent}`,
        borderRadius: videoTheme.radii.md,
        boxSizing: "border-box",
        display: "grid",
        gap: videoTheme.spacing.xs,
        gridTemplateColumns:
          asset === undefined ? "minmax(0, 1fr)" : "auto minmax(0, 1fr)",
        minHeight: 104,
        opacity,
        padding: videoTheme.spacing.sm,
        transform: `translateY(${(1 - opacity) * 20}px)`,
      }}
    >
      {asset === undefined ? null : (
        <span
          aria-label={asset.altText ?? `Icon for ${node.label}`}
          data-cause-effect-asset-slot={asset.slot}
          style={{ color: accent, fontSize: 30 }}
        >
          ●
        </span>
      )}
      <span
        style={{
          fontSize: 28,
          fontWeight: 700,
          lineHeight: videoTheme.typography.lineHeight,
          overflowWrap: "anywhere",
        }}
      >
        {node.label}
      </span>
    </article>
  );
}

function CausalColumn({
  heading,
  kind,
  nodes,
  opacity,
  scene,
}: Readonly<{
  heading: string;
  kind: "cause" | "mechanism" | "effect";
  nodes: readonly CauseEffectNode[];
  opacity: number;
  scene: Extract<SceneComponentProps["scene"], { template: "cause-effect" }>;
}>): JSX.Element {
  return (
    <section
      aria-label={heading}
      style={{ display: "grid", gap: videoTheme.spacing.sm, minWidth: 0 }}
    >
      <h2
        style={{
          color:
            kind === "mechanism"
              ? videoTheme.colors.accent
              : videoTheme.colors.primary,
          fontSize: 22,
          letterSpacing: 2,
          margin: 0,
        }}
      >
        {heading}
      </h2>
      <div style={{ display: "grid", gap: videoTheme.spacing.sm }}>
        {nodes.map((node) => (
          <CausalNode
            key={node.id}
            kind={kind}
            node={node}
            opacity={opacity}
            scene={scene}
          />
        ))}
      </div>
    </section>
  );
}

function DirectionArrow({
  opacity,
}: Readonly<{ opacity: number }>): JSX.Element {
  return (
    <span
      aria-label="causes lead to effects"
      data-cause-effect-arrow
      style={{
        alignSelf: "center",
        color: videoTheme.colors.accent,
        fontSize: 76,
        fontWeight: 700,
        lineHeight: 1,
        opacity,
        textAlign: "center",
      }}
    >
      →
    </span>
  );
}

export function CauseEffectSceneFrame({
  frame,
  scene,
}: SceneComponentProps & Readonly<{ frame: number }>): JSX.Element {
  if (scene.template !== "cause-effect")
    throw new Error("CauseEffectScene requires a cause-effect scene.");
  if (scene.visual.nodes !== undefined && scene.visual.edges !== undefined) {
    const kindAccent: Record<string, string> = {
      cause: videoTheme.colors.primary,
      mechanism: videoTheme.colors.accent,
      effect: videoTheme.colors.primary,
    };
    const accentById = new Map(
      scene.visual.nodes.map((node) => [node.id, kindAccent[node.kind]!]),
    );
    return (
      <GraphDiagram
        durationSeconds={scene.durationSeconds}
        edges={scene.visual.edges}
        eyebrow="CAUSE AND EFFECT"
        frame={frame}
        narration={scene.narration}
        nodeAccent={(nodeId) =>
          accentById.get(nodeId) ?? videoTheme.colors.primary
        }
        nodes={scene.visual.nodes}
        title={scene.title ?? "How one change leads to another"}
      />
    );
  }
  const causes = scene.visual.causes ?? [];
  const effects = scene.visual.effects ?? [];
  const state = getCauseEffectSceneFrameState(frame, scene.durationSeconds);
  const layout = selectCauseEffectLayout(causes, effects);
  const hasMechanism = scene.visual.mechanism !== undefined;
  const columns: CSSProperties = {
    alignItems: "center",
    display: "grid",
    gap: videoTheme.spacing.sm,
    gridTemplateColumns: hasMechanism
      ? "minmax(0, 1fr) 80px minmax(0, 1fr) 80px minmax(0, 1fr)"
      : "minmax(0, 1fr) 100px minmax(0, 1fr)",
    width: "100%",
  };
  return (
    <main
      aria-label="Cause and effect"
      style={{
        background: videoTheme.colors.background,
        color: videoTheme.colors.text,
        fontFamily: videoTheme.typography.fontFamily,
        height: "100%",
        width: "100%",
      }}
    >
      <section
        style={{
          boxSizing: "border-box",
          display: "grid",
          gridTemplateRows: "auto minmax(0, 1fr)",
          height: "100%",
          padding: `${videoTheme.safeAreas.title.top}px ${videoTheme.safeAreas.title.right}px ${videoTheme.safeAreas.body.bottom}px ${videoTheme.safeAreas.title.left}px`,
        }}
      >
        <header>
          <p
            style={{
              color: videoTheme.colors.primary,
              fontSize: videoTheme.typography.bodySize,
              fontWeight: 700,
              letterSpacing: 2,
              margin: 0,
            }}
          >
            CAUSE AND EFFECT
          </p>
          <h1
            style={{
              display: "-webkit-box",
              fontSize: videoTheme.typography.titleSize,
              lineHeight: 1.1,
              margin: `${videoTheme.spacing.xs}px 0 ${videoTheme.spacing.md}px`,
              maxHeight: 124,
              overflow: "hidden",
              overflowWrap: "anywhere",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
            }}
          >
            {scene.title ?? "How one change leads to another"}
          </h1>
        </header>
        <div
          data-cause-effect-layout={layout}
          style={{ ...columns, alignSelf: "center" }}
        >
          <CausalColumn
            heading="CAUSE"
            kind="cause"
            nodes={causes}
            opacity={state.causesOpacity}
            scene={scene}
          />
          <DirectionArrow opacity={state.connectionOpacity} />
          {scene.visual.mechanism === undefined ? null : (
            <>
              <CausalColumn
                heading="MECHANISM"
                kind="mechanism"
                nodes={[scene.visual.mechanism]}
                opacity={state.mechanismOpacity}
                scene={scene}
              />
              <DirectionArrow opacity={state.connectionOpacity} />
            </>
          )}
          <CausalColumn
            heading="EFFECT"
            kind="effect"
            nodes={effects}
            opacity={state.effectsOpacity}
            scene={scene}
          />
        </div>
      </section>
    </main>
  );
}

export function CauseEffectScene({ scene }: SceneComponentProps): JSX.Element {
  return <CauseEffectSceneFrame frame={useCurrentFrame()} scene={scene} />;
}
