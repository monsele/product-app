import { videoTheme } from "@avlp/design-system/video-theme";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { CSSProperties, JSX } from "react";
import type { IpoItem } from "@avlp/schemas";
import type { SceneComponentProps } from "./scene-registry.js";
import { getSceneFrameTiming } from "./timing.js";

export type IpoLayout = "horizontal" | "vertical";

export type IpoSceneFrameState = Readonly<{
  inputsOpacity: number;
  outputsOpacity: number;
  processOpacity: number;
}>;

export function selectIpoLayout(
  inputs: readonly IpoItem[],
  outputs: readonly IpoItem[],
): IpoLayout {
  return inputs.length <= 4 && outputs.length <= 4 ? "horizontal" : "vertical";
}

export function getIpoSceneFrameState(
  frame: number,
  durationSeconds: number,
): IpoSceneFrameState {
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
    inputsOpacity: reveal(start) * exit,
    processOpacity:
      reveal(start + videoTheme.motion.reveal.durationInFrames) * exit,
    outputsOpacity:
      reveal(start + 2 * videoTheme.motion.reveal.durationInFrames) * exit,
  });
}

function assetFor(
  scene: SceneComponentProps["scene"],
  item: IpoItem,
  fallbackSlot: string,
) {
  const slot = item.assetSlot ?? fallbackSlot;
  return scene.assetBindings.find(
    (binding) =>
      ["diagram", "icon", "illustration", "photo", "supporting"].includes(
        binding.role,
      ) && binding.slot === slot,
  );
}

function ItemList({
  items,
  opacity,
  scene,
  side,
}: Readonly<{
  items: readonly IpoItem[];
  opacity: number;
  scene: SceneComponentProps["scene"];
  side: "input" | "output";
}>): JSX.Element {
  return (
    <ul
      aria-label={`${side === "input" ? "Inputs" : "Outputs"} to the model`}
      data-ipo-items={side}
      style={{
        display: "grid",
        gap: videoTheme.spacing.sm,
        listStyle: "none",
        margin: 0,
        padding: 0,
      }}
    >
      {items.map((item, index) => {
        const asset = assetFor(scene, item, `${side}-${index + 1}-icon`);
        return (
          <li
            key={`${index}-${item.label}`}
            style={{
              alignItems: "center",
              background:
                side === "input" ? videoTheme.colors.surface : "transparent",
              border: `${videoTheme.lineWidths.emphasis}px ${side === "input" ? "solid" : "double"} ${videoTheme.colors.primary}`,
              borderRadius: side === "input" ? videoTheme.radii.md : 0,
              boxSizing: "border-box",
              display: "grid",
              gap: videoTheme.spacing.xs,
              gridTemplateColumns:
                asset === undefined ? "minmax(0, 1fr)" : "auto minmax(0, 1fr)",
              minHeight: 92,
              opacity,
              padding: `${videoTheme.spacing.xs}px ${videoTheme.spacing.sm}px`,
              transform: `translateY(${(1 - opacity) * 24}px)`,
            }}
          >
            {asset === undefined ? null : (
              <span
                aria-label={asset.altText ?? `Icon for ${item.label}`}
                data-ipo-asset-slot={asset.slot}
              >
                ●
              </span>
            )}
            <span
              style={{
                fontSize: 30,
                fontWeight: 700,
                lineHeight: videoTheme.typography.lineHeight,
                overflowWrap: "anywhere",
              }}
            >
              {item.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function IpoSceneFrame({
  frame,
  scene,
}: SceneComponentProps & Readonly<{ frame: number }>): JSX.Element {
  if (scene.template !== "input-process-output")
    throw new Error("IpoScene requires an input-process-output scene.");
  const layout = selectIpoLayout(scene.visual.inputs, scene.visual.outputs);
  const state = getIpoSceneFrameState(frame, scene.durationSeconds);
  const processAsset = assetFor(scene, scene.visual.process, "process-icon");
  const vertical = layout === "vertical";
  const connector = (
    <span
      aria-hidden="true"
      data-ipo-arrow
      style={{
        alignSelf: "center",
        color: videoTheme.colors.accent,
        fontSize: vertical ? 56 : 88,
        fontWeight: 700,
        lineHeight: 1,
        textAlign: "center",
      }}
    >
      {vertical ? "↓" : "→"}
    </span>
  );
  const process = (
    <section
      aria-label="Transformation process"
      data-ipo-process
      style={{
        alignItems: "center",
        background: videoTheme.colors.surface,
        border: `${videoTheme.lineWidths.emphasis}px solid ${videoTheme.colors.accent}`,
        borderRadius: "50%",
        boxSizing: "border-box",
        display: "grid",
        justifyItems: "center",
        minHeight: 220,
        minWidth: 220,
        opacity: state.processOpacity,
        padding: videoTheme.spacing.md,
        textAlign: "center",
        transform: `scale(${0.9 + state.processOpacity * 0.1})`,
      }}
    >
      <strong
        style={{
          color: videoTheme.colors.accent,
          fontSize: 22,
          letterSpacing: 2,
        }}
      >
        PROCESS
      </strong>
      {processAsset === undefined ? null : (
        <span
          aria-label={
            processAsset.altText ?? `Icon for ${scene.visual.process.label}`
          }
          data-ipo-asset-slot={processAsset.slot}
        >
          ●
        </span>
      )}
      <span
        style={{
          fontSize: 34,
          fontWeight: 700,
          lineHeight: videoTheme.typography.lineHeight,
          overflowWrap: "anywhere",
        }}
      >
        {scene.visual.process.label}
      </span>
    </section>
  );
  const inputs = (
    <section aria-labelledby="ipo-inputs-heading">
      <h2
        id="ipo-inputs-heading"
        style={{
          fontSize: 24,
          letterSpacing: 2,
          margin: `0 0 ${videoTheme.spacing.xs}px`,
        }}
      >
        INPUTS
      </h2>
      <ItemList
        items={scene.visual.inputs}
        opacity={state.inputsOpacity}
        scene={scene}
        side="input"
      />
    </section>
  );
  const outputs = (
    <section aria-labelledby="ipo-outputs-heading">
      <h2
        id="ipo-outputs-heading"
        style={{
          fontSize: 24,
          letterSpacing: 2,
          margin: `0 0 ${videoTheme.spacing.xs}px`,
        }}
      >
        OUTPUTS
      </h2>
      <ItemList
        items={scene.visual.outputs}
        opacity={state.outputsOpacity}
        scene={scene}
        side="output"
      />
    </section>
  );
  const flowStyle: CSSProperties = vertical
    ? {
        alignItems: "center",
        display: "grid",
        gap: videoTheme.spacing.xs,
        gridTemplateColumns: "minmax(0, 1fr)",
        justifyItems: "stretch",
        margin: "0 auto",
        maxWidth: 760,
        width: "100%",
      }
    : {
        alignItems: "center",
        display: "grid",
        gap: videoTheme.spacing.sm,
        gridTemplateColumns:
          "minmax(0, 1fr) 96px minmax(220px, 0.85fr) 96px minmax(0, 1fr)",
        width: "100%",
      };
  return (
    <main
      aria-label="Input process output model"
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
            SYSTEM MODEL
          </p>
          <h1
            style={{
              fontSize: videoTheme.typography.titleSize,
              lineHeight: videoTheme.typography.lineHeight,
              margin: `${videoTheme.spacing.xs}px 0 ${videoTheme.spacing.md}px`,
              overflowWrap: "anywhere",
            }}
          >
            {scene.title ?? "Input → Process → Output"}
          </h1>
        </header>
        <div
          data-ipo-layout={layout}
          style={{ ...flowStyle, alignSelf: "center" }}
        >
          {vertical ? (
            <>
              {inputs}
              {connector}
              {process}
              {connector}
              {outputs}
            </>
          ) : (
            <>
              {inputs}
              {connector}
              {process}
              {connector}
              {outputs}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export function IpoScene({ scene }: SceneComponentProps): JSX.Element {
  return <IpoSceneFrame frame={useCurrentFrame()} scene={scene} />;
}
