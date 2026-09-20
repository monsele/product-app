import { videoTheme } from "@avlp/design-system/video-theme";
import type { SourceTableVisual } from "@avlp/schemas";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { CSSProperties, JSX } from "react";
import {
  resolveSafeDiagramAsset,
  resolveSafeTableVisual,
  type SceneComponentProps,
} from "./scene-registry.js";
import {
  diagramCalloutPadding,
  DIAGRAM_BASE_RECT,
  planDiagramCallouts,
} from "./diagram-layout.js";
import { getSceneFrameTiming } from "./timing.js";

export function getLabelledDiagramFrameState(
  frame: number,
  durationSeconds: number,
  labelIndex: number,
): Readonly<{ opacity: number }> {
  const timing = getSceneFrameTiming(durationSeconds);
  const start =
    videoTheme.motion.enter.durationInFrames +
    labelIndex * videoTheme.motion.reveal.durationInFrames;
  const entered = interpolate(
    Math.max(0, Math.floor(frame)),
    [start, start + videoTheme.motion.reveal.durationInFrames],
    [0, 1],
    {
      easing: Easing.bezier(...videoTheme.motion.reveal.easing),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const exit = interpolate(
    Math.max(0, Math.floor(frame)),
    [timing.exitStartFrame, timing.durationInFrames],
    [1, 0],
    {
      easing: Easing.bezier(...videoTheme.motion.exit.easing),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  return Object.freeze({ opacity: entered * exit });
}

/**
 * ST-093: a deterministic, allowlisted rendering of an approved source
 * table. It receives only validated structured data (see
 * `sourceTableVisualSchema`) — no HTML, pixel coordinates, or AI-generated
 * markup — and lays it out as a fixed grid within the diagram slot.
 */
function TableVisual({ table }: Readonly<{ table: SourceTableVisual }>): JSX.Element {
  const columnWidth = `${100 / table.columns.length}%`;
  return (
    <div
      aria-label={table.title ?? "Source table"}
      data-source-table-id={table.tableId}
      style={{
        boxSizing: "border-box",
        display: "grid",
        height: "100%",
        overflow: "hidden",
        padding: videoTheme.spacing.md,
        width: "100%",
      }}
    >
      <div
        role="table"
        style={{
          border: `2px solid ${videoTheme.colors.accent}`,
          borderRadius: videoTheme.radii.md,
          display: "grid",
          gridTemplateColumns: `repeat(${table.columns.length}, ${columnWidth})`,
          overflow: "hidden",
          width: "100%",
        }}
      >
        {table.columns.map((column, columnIndex) => (
          <div
            key={`header-${columnIndex}`}
            role="columnheader"
            style={{
              background: videoTheme.colors.primary,
              borderBottom: `2px solid ${videoTheme.colors.accent}`,
              boxSizing: "border-box",
              color: videoTheme.colors.background,
              fontSize: 22,
              fontWeight: 700,
              overflow: "hidden",
              overflowWrap: "anywhere",
              padding: videoTheme.spacing.sm,
              textOverflow: "ellipsis",
            }}
          >
            {column}
          </div>
        ))}
        {table.rows.map((row, rowIndex) =>
          row.map((cell, columnIndex) => (
            <div
              key={`cell-${rowIndex}-${columnIndex}`}
              role="cell"
              style={{
                background:
                  rowIndex % 2 === 0
                    ? videoTheme.colors.surface
                    : videoTheme.colors.background,
                borderTop: `1px solid ${videoTheme.colors.accent}`,
                boxSizing: "border-box",
                color: videoTheme.colors.text,
                fontSize: 20,
                overflow: "hidden",
                overflowWrap: "anywhere",
                padding: videoTheme.spacing.sm,
              }}
            >
              {cell}
            </div>
          )),
        )}
      </div>
      {table.truncated ? (
        <p
          style={{
            color: videoTheme.colors.accent,
            fontSize: 18,
            margin: `${videoTheme.spacing.xs}px 0 0`,
          }}
        >
          {table.rows.length < table.rowCount
            ? `Showing ${table.rows.length} of ${table.rowCount} rows.`
            : "Some table columns or cell text are not shown due to display limits."}
        </p>
      ) : null}
    </div>
  );
}

export function LabelledDiagramSceneFrame({
  creativePresentation,
  frame,
  resolvedAssets,
  runtimeMode = "preview",
  scene,
}: SceneComponentProps & Readonly<{ frame: number }>): JSX.Element {
  if (scene.template !== "labelled-diagram")
    throw new Error("LabelledDiagramScene requires a labelled-diagram scene.");
  const plan = planDiagramCallouts(scene.visual.labels, DIAGRAM_BASE_RECT);
  const labelIndexById = new Map(
    scene.visual.labels.map((label, index) => [label.id, index] as const),
  );
  const asset = scene.assetBindings.find(
    (binding) =>
      binding.slot === scene.visual.baseAssetSlot && binding.role === "diagram",
  );
  const resolvedAsset = resolveSafeDiagramAsset(asset?.assetId, resolvedAssets);
  const resolvedTable = resolveSafeTableVisual(asset?.assetId, resolvedAssets);
  if (
    scene.visual.kind === "asset" &&
    runtimeMode === "render" &&
    resolvedAsset === undefined &&
    resolvedTable === undefined
  )
    throw new Error("Labelled diagram render requires a resolved diagram asset.");
  const canvas: CSSProperties = {
    background: creativePresentation?.background ?? videoTheme.colors.background,
    color: creativePresentation?.text ?? videoTheme.colors.text,
    fontFamily: creativePresentation?.fontFamily ?? videoTheme.typography.fontFamily,
    height: "100%",
    overflow: "hidden",
    position: "relative",
    width: "100%",
  };
  return (
    <main aria-label="Labelled diagram" style={canvas}>
      <header
        style={{
          left: videoTheme.safeAreas.title.left,
          position: "absolute",
          top: videoTheme.safeAreas.title.top,
          zIndex: 2,
        }}
      >
        <p
          style={{
            color: videoTheme.colors.primary,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            margin: 0,
          }}
        >
          LABELLED DIAGRAM
        </p>
        <h1
          style={{
            fontSize: 48,
            lineHeight: 1.1,
            margin: `${videoTheme.spacing.xs}px 0 0`,
            maxWidth: 900,
          }}
        >
          {scene.title ?? "Parts and relationships"}
        </h1>
      </header>
      <section
        aria-label="Diagram base"
        data-diagram-base-kind={scene.visual.kind}
        style={{
          alignItems: "center",
          background: videoTheme.colors.surface,
          border: `${videoTheme.lineWidths.emphasis}px solid ${videoTheme.colors.primary}`,
          borderRadius: videoTheme.radii.md,
          boxSizing: "border-box",
          display: "grid",
          height: plan.diagramRect.height,
          justifyItems: "center",
          left: plan.diagramRect.x,
          overflow: "hidden",
          position: "absolute",
          top: plan.diagramRect.y,
          width: plan.diagramRect.width,
        }}
      >
        {scene.visual.kind === "asset" &&
        resolvedTable !== undefined &&
        resolvedTable.table !== undefined ? (
          <TableVisual table={resolvedTable.table} />
        ) : scene.visual.kind === "asset" && resolvedAsset !== undefined ? (
          <img
            alt={resolvedAsset.altText}
            data-diagram-asset-slot="diagram"
            data-diagram-asset-source={resolvedAsset.source}
            src={resolvedAsset.src}
            style={{
              background: videoTheme.colors.background,
              height: "100%",
              objectFit: "contain",
              width: "100%",
            }}
          />
        ) : scene.visual.kind === "asset" ? (
          <div
            aria-label={asset?.altText ?? "Approved diagram asset unavailable"}
            data-diagram-asset-placeholder="diagram"
            style={{
              alignItems: "center",
              background: videoTheme.colors.background,
              display: "grid",
              height: "100%",
              justifyItems: "center",
              width: "100%",
            }}
          >
            <span
              aria-hidden="true"
              style={{ color: videoTheme.colors.accent, fontSize: 150 }}
            >
              ◎
            </span>
          </div>
        ) : (
          <div
            aria-label={`${scene.visual.shape} diagram`}
            data-diagram-shape={scene.visual.shape}
            style={{
              alignItems: "center",
              border: `${videoTheme.lineWidths.emphasis}px dashed ${videoTheme.colors.accent}`,
              borderRadius: "50%",
              boxSizing: "border-box",
              display: "grid",
              height: 300,
              justifyItems: "center",
              width: 300,
            }}
          >
            <span
              style={{
                color: videoTheme.colors.accent,
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              {scene.visual.shape}
            </span>
          </div>
        )}
      </section>
      <svg
        aria-hidden="true"
        height="1080"
        style={{ inset: 0, position: "absolute" }}
        width="1920"
      >
        {plan.callouts.map((callout) => (
          <line
            key={callout.id}
            stroke={videoTheme.colors.accent}
            strokeWidth={videoTheme.lineWidths.emphasis}
            x1={callout.targetX}
            x2={callout.side === "left" ? callout.x + callout.width : callout.x}
            y1={callout.targetY}
            y2={callout.y + callout.height / 2}
          />
        ))}
      </svg>
      {plan.callouts.map((callout) => {
        const labelIndex = labelIndexById.get(callout.id);
        if (labelIndex === undefined)
          throw new Error(
            `Diagram callout ${callout.id} has no matching label.`,
          );
        const label = scene.visual.labels[labelIndex]!;
        const state = getLabelledDiagramFrameState(
          frame,
          scene.durationSeconds,
          labelIndex,
        );
        return (
          <aside
            data-diagram-callout={callout.id}
            key={callout.id}
            style={{
              background: videoTheme.colors.surface,
              border: `${videoTheme.lineWidths.emphasis}px solid ${videoTheme.colors.accent}`,
              borderRadius: videoTheme.radii.md,
              boxSizing: "border-box",
              fontSize: callout.fontSize,
              fontWeight: 700,
              left: callout.x,
              height: callout.height,
              lineHeight: videoTheme.typography.lineHeight,
              opacity: state.opacity,
              overflowWrap: "anywhere",
              padding: diagramCalloutPadding(callout.fontSize),
              position: "absolute",
              top: callout.y,
              transform: `translateY(${(1 - state.opacity) * 16}px)`,
              width: callout.width,
              zIndex: 1,
            }}
          >
            {label.text}
          </aside>
        );
      })}
    </main>
  );
}

export function LabelledDiagramScene({
  creativePresentation,
  resolvedAssets,
  runtimeMode,
  scene,
}: SceneComponentProps): JSX.Element {
  return (
    <LabelledDiagramSceneFrame
      frame={useCurrentFrame()}
      {...(creativePresentation === undefined ? {} : { creativePresentation })}
      {...(resolvedAssets === undefined ? {} : { resolvedAssets })}
      {...(runtimeMode === undefined ? {} : { runtimeMode })}
      scene={scene}
    />
  );
}
