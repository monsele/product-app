"use client";

import React, { type JSX } from "react";
import type { StoryboardSceneListEntry } from "@avlp/schemas";
import styles from "./storyboard.module.css";
import { sceneAttentionLabels, sceneTemplateLabel } from "./storyboard-input";

export interface SceneTimelineProps {
  scenes: readonly StoryboardSceneListEntry[];
  selectedSceneId: string | null;
  onSelect: (sceneId: string) => void;
}

/**
 * The lesson at a glance: one segment per scene, sized by its duration, so
 * pacing problems are visible before preview. Selecting a segment selects the
 * scene, the same as the scene list.
 */
export function SceneTimeline({
  scenes,
  selectedSceneId,
  onSelect,
}: SceneTimelineProps): JSX.Element | null {
  if (scenes.length === 0) return null;
  const total = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);

  return (
    <nav aria-label="Scene timeline" className={styles.timeline}>
      <ol className={styles.timelineTrack}>
        {scenes.map((scene) => {
          const selected = scene.sceneId === selectedSceneId;
          const needsAttention = sceneAttentionLabels(scene.status).length > 0;
          const name = scene.title ?? sceneTemplateLabel(scene.template);
          return (
            <li
              key={scene.sceneId}
              className={styles.timelineItem}
              style={{ flexGrow: scene.durationSeconds }}
            >
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                aria-label={`Scene ${scene.order}: ${name}, ${scene.durationSeconds} seconds${needsAttention ? ", needs attention" : ""}`}
                title={`${scene.order}. ${name} · ${scene.durationSeconds}s`}
                onClick={() => onSelect(scene.sceneId)}
                className={[
                  styles.timelineSegment,
                  selected ? styles.timelineSegmentSelected : "",
                  needsAttention ? styles.timelineSegmentAttention : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="tabular-nums">{scene.order}</span>
                <span className={styles.timelineName} aria-hidden>
                  {name}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className={styles.timelineScale}>
        <span className="tabular-nums">0s</span>
        <span className="tabular-nums">{total}s</span>
      </p>
    </nav>
  );
}
