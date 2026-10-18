"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { PlayerRef } from "@remotion/player";

/** Media/timing replacement waits for a pause or end; transport state stays put. */
export function usePreviewRefresh(
  input: unknown,
  player: RefObject<PlayerRef | null>,
  identity = "lesson",
  remap?: (previous: unknown, next: unknown, frame: number) => number,
  invalidates?: (previous: unknown, next: unknown, frame: number) => boolean,
) {
  const [displayed, setDisplayed] = useState(input);
  const previous = useRef(input);
  const pendingFrame = useRef<number | null>(null);
  const previousIdentity = useRef(identity);
  useEffect(() => {
    const current = player.current;
    if (previousIdentity.current !== identity) {
      previousIdentity.current = identity;
      current?.pause();
      current?.seekTo(0);
      setDisplayed(input);
      return;
    }
    const apply = () => {
      pendingFrame.current =
        remap?.(previous.current, input, current?.getCurrentFrame() ?? 0) ??
        current?.getCurrentFrame() ??
        0;
      setDisplayed(input);
    };
    if (
      invalidates?.(previous.current, input, current?.getCurrentFrame() ?? 0)
    ) {
      current?.pause();
      apply();
      return;
    }
    if (!current?.isPlaying()) {
      apply();
      return;
    }
    current.addEventListener("pause", apply);
    current.addEventListener("ended", apply);
    return () => {
      current.removeEventListener("pause", apply);
      current.removeEventListener("ended", apply);
    };
  }, [input, player, identity, remap, invalidates]);
  useEffect(() => {
    previous.current = displayed;
    if (pendingFrame.current !== null)
      player.current?.seekTo(pendingFrame.current);
    pendingFrame.current = null;
  }, [displayed, player]);
  return displayed;
}
