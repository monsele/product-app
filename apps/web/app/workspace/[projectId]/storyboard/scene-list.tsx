"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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

export function SceneList({
  scenes,
  selectedSceneId,
  stale,
  onSelect,
}: {
  scenes: readonly StoryboardSceneListEntry[];
  selectedSceneId: string | null;
  stale: boolean;
  onSelect: (sceneId: string) => void;
}): JSX.Element {
  const containerRef = useRef<HTMLOListElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);

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
    return <p role="status">This storyboard has no scenes yet.</p>;

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
        height: 480,
        listStyle: "none",
        margin: 0,
        overflowY: "auto",
        padding: 0,
        position: "relative",
      }}
    >
      <li aria-hidden style={{ height: start * sceneRowHeight }} />
      {windowScenes.map((scene) => {
        const selected = scene.sceneId === selectedSceneId;
        const sceneStale = scene.status.stale || stale;
        return (
          <li
            key={scene.sceneId}
            aria-selected={selected}
            data-testid={`storyboard-scene-${scene.sceneId}`}
            id={`storyboard-scene-option-${scene.sceneId}`}
            onClick={() => onSelect(scene.sceneId)}
            role="option"
            style={{
              boxSizing: "border-box",
              height: sceneRowHeight,
              padding: "6px 8px",
            }}
          >
            <p style={{ margin: 0 }}>
              {scene.order}. {scene.template} — {scene.durationSeconds}s ·{" "}
              {scene.narrationBlockCount} narration block
              {scene.narrationBlockCount === 1 ? "" : "s"}
              {scene.title !== null ? ` · ${scene.title}` : ""}
            </p>
            <p style={{ margin: 0 }}>{scene.narrationSummary}</p>
            <p style={{ margin: 0 }}>
              {sceneAssetStatusLabel(scene.status.assets)} ·{" "}
              {sceneAudioStatusLabel(scene.status.audio)} ·{" "}
              {sceneValidationStatusLabel(scene.status.validation)}
              {sceneStale ? <span role="status"> · Stale</span> : null}
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
