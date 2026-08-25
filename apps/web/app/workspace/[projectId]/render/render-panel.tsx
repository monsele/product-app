"use client";

import { useEffect, useState, type JSX } from "react";
import {
  renderStatusResponseSchema,
  type RenderStatusResponse,
} from "@avlp/schemas";

const api = (path: string) =>
  `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;

/** Refresh-safe view of the persisted render lifecycle. Rendering requires an
 * intentional button press; no expensive request is issued on page load. */
export function RenderPanel({
  projectId,
  lessonVersionId,
  initial,
}: {
  projectId: string;
  lessonVersionId: string | null;
  initial: readonly RenderStatusResponse[];
}): JSX.Element {
  const [renders, setRenders] =
    useState<readonly RenderStatusResponse[]>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const base = `/projects/${encodeURIComponent(projectId)}/renders`;
  const refresh = async () => {
    const response = await fetch(api(base), {
      credentials: "include",
      cache: "no-store",
    });
    const payload: unknown = response.ok ? await response.json() : null;
    const parsed =
      payload && typeof payload === "object" && "renders" in payload
        ? (payload as { renders: unknown }).renders
        : null;
    if (Array.isArray(parsed)) {
      const next = parsed.map((value) =>
        renderStatusResponseSchema.safeParse(value),
      );
      if (next.every((value) => value.success))
        setRenders(next.map((value) => value.data));
    }
  };
  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  });
  const submit = async (url: string, body?: unknown) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(api(url), {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "idempotency-key": globalThis.crypto.randomUUID(),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        setMessage(
          "The render action could not be completed. Check validation and try again.",
        );
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="render-heading">
      <h1 id="render-heading">Render lesson</h1>
      {lessonVersionId === null ? (
        <p role="status">Save an approved lesson version before rendering.</p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit(base, { lessonVersionId })}
        >
          {busy ? "Starting…" : "Render 1080p video"}
        </button>
      )}
      {message ? <p role="alert">{message}</p> : null}
      <ul aria-label="Render history">
        {renders.map((render) => (
          <li key={render.id} data-testid={`render-${render.id}`}>
            <strong>{render.status}</strong> —{" "}
            {Math.round(render.progress * 100)}%
            {render.errorMessage ? <span> {render.errorMessage}</span> : null}
            {render.video ? (
              <span>
                {" "}
                {render.video.width}×{render.video.height},{" "}
                {render.video.videoCodec.toUpperCase()}/
                {render.video.audioCodec.toUpperCase()}
                {render.video.thumbnailUrl ? (
                  <img
                    src={render.video.thumbnailUrl}
                    alt="Rendered lesson thumbnail"
                    width={192}
                    height={108}
                  />
                ) : null}
              </span>
            ) : null}
            {render.retryable ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void submit(`${base}/${encodeURIComponent(render.id)}/retry`)
                }
              >
                Retry render
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
