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
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import styles from "./storyboard.module.css";
import {
  sceneAssetStatusLabel,
  sceneAudioStatusLabel,
  sceneCaptionStatusLabel,
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
      <div role="status" className={styles.sceneListEmpty}>
        <p>This storyboard has no scenes yet.</p>
      </div>
    );

  const windowScenes = scenes.slice(start, end);

  return (
    <ol
      ref={containerRef}
      aria-activedescendant={activeId ?? undefined}
      aria-label="Storyboard scenes"
      className={styles.sceneList}
      data-testid="storyboard-scenes"
      onKeyDown={handleKeyDown}
      onScroll={() => setScrollTop(containerRef.current?.scrollTop ?? 0)}
      role="listbox"
      tabIndex={0}
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
            className={[
              styles.sceneRow,
              selected ? styles.sceneRowSelected : "",
              isDragging ? styles.sceneRowDragging : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-testid={`storyboard-scene-${scene.sceneId}`}
            draggable
            id={`storyboard-scene-option-${scene.sceneId}`}
            onClick={() => onSelect(scene.sceneId)}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragStart={() => handleDragStart(index)}
            onDrop={(event) => handleDrop(index, event)}
            role="option"
          >
            <div className={styles.sceneRowTop}>
              <div className={styles.sceneRowLabel}>
                <span
                  className={`${styles.sceneIndex} ${selected ? styles.sceneIndexSelected : ""}`}
                >
                  {scene.order}
                </span>
                <p
                  className={`${styles.sceneTitle} ${selected ? styles.sceneTitleSelected : ""}`}
                >
                  {scene.template} · {scene.durationSeconds}s ·{" "}
                  {scene.narrationBlockCount} narration block
                  {scene.narrationBlockCount === 1 ? "" : "s"}
                  {scene.title !== null ? ` · ${scene.title}` : ""}
                </p>
              </div>

              {/* Keyboard and touch equivalent for drag reorder */}
              <div className={styles.sceneReorder}>
                <button
                  type="button"
                  aria-label={`Move scene ${scene.order} up`}
                  className={styles.reorderButton}
                  title="Move up"
                  disabled={index === 0}
                  onClick={(e) => handleMoveUp(index, e)}
                >
                  <CaretUp size={12} weight="bold" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Move scene ${scene.order} down`}
                  className={styles.reorderButton}
                  title="Move down"
                  disabled={index === scenes.length - 1}
                  onClick={(e) => handleMoveDown(index, e)}
                >
                  <CaretDown size={12} weight="bold" aria-hidden />
                </button>
              </div>
            </div>

            <p className={styles.sceneSummary}>{scene.narrationSummary}</p>

            <p className={styles.sceneMeta}>
              {sceneAssetStatusLabel(scene.status.assets)} ·{" "}
              {sceneAudioStatusLabel(scene.status.audio)} ·{" "}
              {sceneCaptionStatusLabel(scene.status.captions)} ·{" "}
              {sceneValidationStatusLabel(scene.status.validation)}
              {sceneStale ? (
                <span role="status" className={styles.staleFlag}>
                  {" "}
                  · Stale
                </span>
              ) : null}
            </p>
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
