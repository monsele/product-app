"use client";

/**
 * ST-106 — after the render is approved. Delivery is the existing render
 * panel: progress, failure and retry, download, share links and the ST-103
 * review summary all come from it unchanged.
 */

import React, { useEffect, useState } from "react";
import {
  renderStatusResponseSchema,
  type RenderStatusResponse,
} from "@avlp/schemas";
import { Skeleton } from "../../../../components/ui/skeleton";
import { apiUrl } from "../../../../lib/one-shot";
import { RenderPanel } from "../render/render-panel";

export function OneShotDelivery({
  projectId,
  projectTitle,
  lessonVersionId,
}: Readonly<{
  projectId: string;
  projectTitle: string;
  lessonVersionId: string | null;
}>) {
  const [renders, setRenders] = useState<
    readonly RenderStatusResponse[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          apiUrl(`/projects/${encodeURIComponent(projectId)}/renders`),
          { credentials: "include", cache: "no-store" },
        );
        const payload: unknown = response.ok ? await response.json() : null;
        const list =
          typeof payload === "object" &&
          payload !== null &&
          "renders" in payload &&
          Array.isArray(payload.renders)
            ? payload.renders
                .map((value: unknown) =>
                  renderStatusResponseSchema.safeParse(value),
                )
                .flatMap((value) => (value.success ? [value.data] : []))
            : [];
        if (!cancelled) setRenders(list);
      } catch {
        if (!cancelled) setRenders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (renders === null)
    return (
      <div role="status" aria-label="Loading the render">
        <Skeleton height="240px" />
      </div>
    );

  return (
    <RenderPanel
      projectId={projectId}
      projectTitle={projectTitle}
      lessonVersionId={lessonVersionId}
      initial={renders}
    />
  );
}
