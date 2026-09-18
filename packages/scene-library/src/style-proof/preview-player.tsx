"use client";

/**
 * ST-094 — the proof's browser preview player.
 *
 * Mirrors `FullLessonPreviewPlayer`: the Remotion `Player` stays inside the
 * scene library so the web app keeps depending on this package rather than on
 * Remotion directly. It renders the same composition the server render uses,
 * and surfaces validation failures instead of drawing a broken frame.
 */

import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { styleProofCanvas } from "@avlp/design-system/style-proof-tokens";
import {
  prepareStyleProofComposition,
  StyleProofComposition,
  styleProofDurationInFrames,
  styleProofTimeline,
} from "./composition.js";

const panelStyle = {
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: 16,
} as const;

export function StyleProofPreviewPlayer({
  input,
  onFrameChange,
}: Readonly<{
  input: unknown;
  onFrameChange?: (frame: number) => void;
}>): JSX.Element {
  const prepared = useMemo(
    () => prepareStyleProofComposition(input),
    [input],
  );
  const playerRef = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);

  const scenes = prepared.props?.scenes ?? [];
  const timeline = useMemo(() => styleProofTimeline(scenes), [scenes]);
  const durationInFrames = useMemo(
    () => (scenes.length === 0 ? 1 : styleProofDurationInFrames(scenes)),
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
    return () => player.removeEventListener("frameupdate", update);
  }, [prepared.props, onFrameChange]);

  if (prepared.props === undefined)
    return (
      <div data-testid="style-proof-errors" role="alert" style={panelStyle}>
        <h3>This treatment cannot be rendered</h3>
        <ul>
          {prepared.issues.map((issue) => (
            <li key={`${issue.code}:${issue.fieldPath}`}>
              <strong>{issue.code}</strong> at <code>{issue.fieldPath}</code> —{" "}
              {issue.message} {issue.suggestedCorrection}
            </li>
          ))}
        </ul>
      </div>
    );

  const seek = (next: number): void => {
    const safe = Math.min(Math.max(0, Math.floor(next)), durationInFrames - 1);
    playerRef.current?.seekTo(safe);
    setFrame(safe);
    onFrameChange?.(safe);
  };

  return (
    <section aria-label="Style proof preview player">
      <Player
        acknowledgeRemotionLicense
        component={StyleProofComposition}
        compositionHeight={styleProofCanvas.height}
        compositionWidth={styleProofCanvas.width}
        controls
        durationInFrames={durationInFrames}
        errorFallback={({ error }: { error: Error }) => (
          <div role="alert" style={panelStyle}>
            <h3>Proof preview unavailable</h3>
            <p>{error.message}</p>
          </div>
        )}
        fps={styleProofCanvas.fps}
        inputProps={prepared.props}
        ref={playerRef}
        style={{ width: "100%" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {timeline.map((segment, index) => (
          <button
            key={segment.sceneId}
            onClick={() => seek(segment.startFrame)}
            type="button"
          >
            Scene {index + 1}
          </button>
        ))}
      </div>
      <label style={{ display: "block", marginTop: 12 }}>
        Seek proof
        <input
          aria-label="Seek proof"
          max={durationInFrames - 1}
          min={0}
          onChange={(event) => seek(Number(event.target.value))}
          step={1}
          style={{ display: "block", width: "100%" }}
          type="range"
          value={frame}
        />
      </label>
      <p data-testid="style-proof-frame">
        Proof frame: {frame} of {durationInFrames}
      </p>
    </section>
  );
}
