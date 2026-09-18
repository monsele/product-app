"use client";

/**
 * ST-095 — the demonstration proof's browser preview player.
 *
 * Mirrors `FullLessonPreviewPlayer`: the Remotion `Player` stays inside the
 * scene library so the web app keeps depending on this package rather than on
 * Remotion directly. It renders the same composition the server render uses,
 * and surfaces validation failures instead of drawing a broken frame.
 *
 * The scrubbing controls are not decoration — backward seeking is the fastest
 * way to catch a runtime that has quietly become history-dependent, so the
 * preview makes it easy to do by hand as well as in a test.
 */

import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { videoTheme } from "@avlp/design-system/video-theme";
import {
  DemonstrationComposition,
  demonstrationDurationInFrames,
  demonstrationTimeline,
  prepareDemonstrationComposition,
} from "./composition.js";

const panelStyle = {
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: 16,
} as const;

export function DemonstrationPreviewPlayer({
  input,
  onFrameChange,
}: Readonly<{
  input: unknown;
  onFrameChange?: (frame: number) => void;
}>): JSX.Element {
  const prepared = useMemo(
    () => prepareDemonstrationComposition(input),
    [input],
  );
  const playerRef = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);

  const scenes = prepared.props?.scenes ?? [];
  const timeline = useMemo(() => demonstrationTimeline(scenes), [scenes]);
  const durationInFrames = useMemo(
    () => (scenes.length === 0 ? 1 : demonstrationDurationInFrames(scenes)),
    [scenes],
  );

  useEffect(() => {
    setFrame(0);
    onFrameChange?.(0);
    playerRef.current?.seekTo(0);
  }, [input, onFrameChange]);

  useEffect(() => {
    const player = playerRef.current;
    if (player === null) return;
    const update = (event: { detail: { frame: number } }): void => {
      setFrame(event.detail.frame);
      onFrameChange?.(event.detail.frame);
    };
    player.addEventListener("frameupdate", update);
    return () => {
      player.removeEventListener("frameupdate", update);
    };
  }, [onFrameChange, prepared.props]);

  if (prepared.props === undefined)
    return (
      <div data-testid="demonstration-preview-blocked" role="alert" style={panelStyle}>
        <h3>This demonstration cannot be rendered</h3>
        <ul>
          {prepared.issues.map((issue) => (
            <li key={`${issue.fieldPath}:${issue.code}`}>
              <strong>{issue.code}</strong> at {issue.fieldPath} —{" "}
              {issue.message} {issue.suggestedCorrection}
            </li>
          ))}
        </ul>
      </div>
    );

  const current = timeline.find(
    (segment) => frame >= segment.startFrame && frame < segment.endFrameExclusive,
  );

  return (
    <div data-testid="demonstration-preview">
      <Player
        acknowledgeRemotionLicense
        component={DemonstrationComposition}
        compositionHeight={videoTheme.canvas.height}
        compositionWidth={videoTheme.canvas.width}
        controls
        durationInFrames={durationInFrames}
        fps={videoTheme.canvas.fps}
        inputProps={prepared.props}
        ref={playerRef}
        style={{ aspectRatio: "16 / 9", width: "100%" }}
      />
      <p data-testid="demonstration-preview-frame" style={{ margin: "8px 0 0" }}>
        Frame {frame} of {durationInFrames}
        {current === undefined ? "" : ` · scene ${current.sceneId}`}
      </p>
    </div>
  );
}
