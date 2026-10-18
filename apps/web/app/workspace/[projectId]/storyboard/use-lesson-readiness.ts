"use client";

import { useCallback, useEffect, useState } from "react";
import { lessonReadinessSchema, type LessonReadiness } from "@avlp/schemas";

export const preparationUrl = (projectId: string, suffix: string) =>
  `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/projects/${encodeURIComponent(projectId)}/${suffix}`;

/** Read-only polling grants no provider authority. Server contracts gate the UI. */
export function useLessonReadiness(projectId: string, revision: number | null) {
  const [readiness, setReadiness] = useState<LessonReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const response = await fetch(preparationUrl(projectId, "readiness"), {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        "Preparation status could not refresh. Your edits are safe.",
      );
    const result = lessonReadinessSchema.parse(await response.json());
    setReadiness(result);
    setError(null);
    return result;
  }, [projectId]);
  useEffect(() => {
    if (revision === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof globalThis.setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(preparationUrl(projectId, "readiness"), {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error(
            "Preparation status could not refresh. Your edits are safe.",
          );
        const result = lessonReadinessSchema.parse(await response.json());
        if (cancelled) return;
        setReadiness(result);
        setError(null);
        if (result.enabled)
          timer = globalThis.setTimeout(
            () => void poll(),
            result.state === "ready" ? 10000 : 3000,
          );
      } catch {
        if (!cancelled) {
          setError(
            "Preparation status could not refresh. Your edits are safe.",
          );
          timer = globalThis.setTimeout(() => void poll(), 10000);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [projectId, revision]);
  return { readiness, error, refresh };
}
