"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type JSX,
  type KeyboardEvent,
} from "react";
import type { StoryboardSceneListEntry } from "@avlp/schemas";
import {
  sceneAssetStatusLabel,
  sceneAudioStatusLabel,
  sceneValidationStatusLabel,
} from "./storyboard-input";

/** Fixed row height used by the windowing math. */
export const sceneRowHeight = 72;
const overscanRows = 3;
const minimumWindowRows = 12;

/**
 * Visible row window for the bounded scene list. Large storyboards render a
 * windowed slice instead of every row, keeping the editor usable up to the
 * configured maximum scene count without mounting heavy per-scene content.
 */
export function visibleSceneRange(
  sceneCount: number,
  scrollTop: number,
  viewportHeight: number,
): { start: number; end: number } {
  const first = Math.max(
    0,
    Math.floor(scrollTop / sceneRowHeight) - overscanRows,
  );
  const windowRows = Math.max(
    minimumWindowRows,
    Math.ceil(viewportHeight / sceneRowHeight) + overscanRows * 2,
  );
  return { start: first, end: Math.min(sceneCount, first + windowRows) };
}

/**
 * Returns the ordered scene ids after moving the scene at `fromIndex` to
 * `toIndex`. Used by the drag-and-drop reorder handler; it never mutates the
 * input array and clamps invalid indices by returning the original order.
 */
export function reorderSceneIds(
  sceneIds: readonly string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= sceneIds.length ||
    toIndex < 0 ||
    toIndex >= sceneIds.length
  )
    return [...sceneIds];
  const next = [...sceneIds];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved!);
  return next;
}

export function SceneList({
  scenes,
  selectedSceneId,
  stale,
  onSelect,
  onReorder,
}: {
  scenes: readonly StoryboardSceneListEntry[];
  selectedSceneId: string | null;
  stale: boolean;
  onSelect: (sceneId: string) => void;
  onReorder: (sceneIds: string[]) => void;
}): JSX.Element {
  const containerRef = useRef<HTMLOListElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const selectedIndex = useMemo(
    () => scenes.findIndex((scene) => scene.sceneId === selectedSceneId),
    [scenes, selectedSceneId],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const measure = (): void => setViewportHeight(container.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const { start, end } = visibleSceneRange(
    scenes.length,
    scrollTop,
    viewportHeight,
  );

  useEffect(() => {
    setActiveId(
      selectedSceneId === null
        ? null
        : `storyboard-scene-option-${selectedSceneId}`,
    );
    if (selectedIndex < 0) return;
    const container = containerRef.current;
    if (container === null || viewportHeight === 0) return;
    const rowTop = selectedIndex * sceneRowHeight;
    const rowBottom = rowTop + sceneRowHeight;
    const windowTop = start * sceneRowHeight;
    const windowBottom = end * sceneRowHeight;
    if (rowTop < windowTop || rowBottom > windowBottom) {
      container.scrollTop = Math.max(
        0,
        rowTop - Math.floor(viewportHeight / 2),
      );
    }
  }, [selectedSceneId, selectedIndex, start, end, viewportHeight]);

  const selectIndex = useCallback(
    (index: number) => {
      const scene = scenes[index];
      if (scene !== undefined) onSelect(scene.sceneId);
    },
    [scenes, onSelect],
  );

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (index: number, event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      if (dragIndex === null || dragIndex === index) {
        setDragIndex(null);
        return;
      }
      onReorder(
        reorderSceneIds(
          scenes.map((scene) => scene.sceneId),
          dragIndex,
          index,
        ),
      );
      setDragIndex(null);
    },
    [dragIndex, scenes, onReorder],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
  }, []);

  const handleMoveUp = useCallback(
    (index: number, event: React.MouseEvent) => {
      event.stopPropagation();
      if (index <= 0) return;
      onReorder(
        reorderSceneIds(
          scenes.map((s) => s.sceneId),
          index,
          index - 1,
        ),
      );
    },
    [scenes, onReorder],
  );

  const handleMoveDown = useCallback(
    (index: number, event: React.MouseEvent) => {
      event.stopPropagation();
      if (index >= scenes.length - 1) return;
      onReorder(
        reorderSceneIds(
          scenes.map((s) => s.sceneId),
          index,
          index + 1,
        ),
      );
    },
    [scenes, onReorder],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLOListElement>) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          selectIndex(Math.min(scenes.length - 1, selectedIndex + 1));
          break;
        case "ArrowUp":
          event.preventDefault();
          selectIndex(Math.max(0, selectedIndex - 1));
          break;
        case "Home":
          event.preventDefault();
          selectIndex(0);
          break;
        case "End":
          event.preventDefault();
          selectIndex(scenes.length - 1);
          break;
      }
    },
    [scenes.length, selectedIndex, selectIndex],
  );

  if (scenes.length === 0)
    return (
      <div
        role="status"
        style={{
          padding: "24px",
          textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: "14px",
        }}
      >
        <p style={{ margin: 0 }}>This storyboard has no scenes yet.</p>
      </div>
    );

  const windowScenes = scenes.slice(start, end);

  return (
    <ol
      ref={containerRef}
      aria-activedescendant={activeId ?? undefined}
      aria-label="Storyboard scenes"
      data-testid="storyboard-scenes"
      onKeyDown={handleKeyDown}
      onScroll={() => setScrollTop(containerRef.current?.scrollTop ?? 0)}
      role="listbox"
      tabIndex={0}
      style={{
        boxSizing: "border-box",
        height: "100%",
        minHeight: 480,
        listStyle: "none",
        margin: 0,
        overflowY: "auto",
        padding: "8px",
        position: "relative",
        outline: "none",
      }}
    >
      <li aria-hidden style={{ height: start * sceneRowHeight }} />
      {windowScenes.map((scene, windowIndex) => {
        const index = start + windowIndex;
        const selected = scene.sceneId === selectedSceneId;
        const sceneStale = scene.status.stale || stale;
        const isDragging = dragIndex === index;

        return (
          <li
            key={scene.sceneId}
            aria-selected={selected}
            data-testid={`storyboard-scene-${scene.sceneId}`}
            draggable
            id={`storyboard-scene-option-${scene.sceneId}`}
            onClick={() => onSelect(scene.sceneId)}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragStart={() => handleDragStart(index)}
            onDrop={(event) => handleDrop(index, event)}
            role="option"
            style={{
              boxSizing: "border-box",
              cursor: "grab",
              height: sceneRowHeight,
              marginBottom: "4px",
              padding: "8px 10px",
              borderRadius: "8px",
              backgroundColor: selected
                ? "var(--color-surface-raised, #292035)"
                : isDragging
                  ? "var(--color-surface-brand, #342548)"
                  : "transparent",
              border: selected
                ? "1.5px solid var(--color-brand, #A883FF)"
                : "1px solid var(--color-border, #3A3046)",
              boxShadow: selected
                ? "0 4px 12px rgba(168, 131, 255, 0.15)"
                : "none",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              transition: "border-color 0.15s ease, background-color 0.15s ease",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "6px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: selected ? "var(--color-brand, #A883FF)" : "var(--color-text-muted, #BDB5C7)",
                    backgroundColor: selected ? "rgba(168, 131, 255, 0.16)" : "rgba(255, 255, 255, 0.06)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  #{scene.order}
                </span>
                <p
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    fontWeight: selected ? 600 : 500,
                    color: selected ? "var(--color-text, #F4F1F8)" : "var(--color-text-muted, #BDB5C7)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {scene.order}. {scene.template} — {scene.durationSeconds}s ·{" "}
                  {scene.narrationBlockCount} narration block
                  {scene.narrationBlockCount === 1 ? "" : "s"}
                  {scene.title !== null ? ` · ${scene.title}` : ""}
                </p>
              </div>

              {/* Quick Reorder Controls (for keyboard & mobile access) */}
              <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                <button
                  type="button"
                  aria-label={`Move scene ${scene.order} up`}
                  title="Move up"
                  disabled={index === 0}
                  onClick={(e) => handleMoveUp(index, e)}
                  style={{
                    padding: "2px 4px",
                    fontSize: "10px",
                    lineHeight: 1,
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid var(--color-border, #3A3046)",
                    borderRadius: "3px",
                    color: "var(--color-text-muted, #BDB5C7)",
                    cursor: index === 0 ? "not-allowed" : "pointer",
                    opacity: index === 0 ? 0.3 : 0.8,
                  }}
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Move scene ${scene.order} down`}
                  title="Move down"
                  disabled={index === scenes.length - 1}
                  onClick={(e) => handleMoveDown(index, e)}
                  style={{
                    padding: "2px 4px",
                    fontSize: "10px",
                    lineHeight: 1,
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid var(--color-border, #3A3046)",
                    borderRadius: "3px",
                    color: "var(--color-text-muted, #BDB5C7)",
                    cursor: index === scenes.length - 1 ? "not-allowed" : "pointer",
                    opacity: index === scenes.length - 1 ? 0.3 : 0.8,
                  }}
                >
                  ▼
                </button>
              </div>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: "12px",
                color: "var(--color-text-muted, #BDB5C7)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {scene.narrationSummary}
            </p>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "4px",
                fontSize: "11px",
              }}
            >
              <p style={{ margin: 0, color: "var(--color-text-muted, #BDB5C7)", fontSize: "11px" }}>
                {sceneAssetStatusLabel(scene.status.assets)} ·{" "}
                {sceneAudioStatusLabel(scene.status.audio)} ·{" "}
                {sceneValidationStatusLabel(scene.status.validation)}
                {sceneStale ? (
                  <span
                    role="status"
                    style={{
                      marginLeft: "4px",
                      color: "var(--color-warning-fg, #8A4B08)",
                      fontWeight: 600,
                    }}
                  >
                    · Stale
                  </span>
                ) : null}
              </p>
            </div>
          </li>
        );
      })}
      <li
        aria-hidden
        style={{ height: (scenes.length - end) * sceneRowHeight }}
      />
    </ol>
  );
}
