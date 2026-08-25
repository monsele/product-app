"use client";

import { useEffect, useState, type JSX } from "react";
import {
  renderStatusResponseSchema,
  shareLinkCreatedResponseSchema,
  shareLinksResponseSchema,
  type RenderStatusResponse,
  type ShareLink,
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
  const [shareLinks, setShareLinks] = useState<readonly ShareLink[]>([]);
  const [shareBusy, setShareBusy] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ShareLink | null>(null);
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
  const shareBase = `/projects/${encodeURIComponent(projectId)}/share-links`;
  const refreshShareLinks = async () => {
    const response = await fetch(api(shareBase), {
      credentials: "include",
      cache: "no-store",
    });
    const parsed = shareLinksResponseSchema.safeParse(
      response.ok ? await response.json() : null,
    );
    if (parsed.success) setShareLinks(parsed.data.shareLinks);
  };
  useEffect(() => {
    void refreshShareLinks();
  }, [projectId]);
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
  const createShareLink = async () => {
    const latestRender = renders.find((render) => render.video !== null);
    if (latestRender === undefined) return;
    setShareBusy(true);
    setMessage(null);
    try {
      const response = await fetch(api(shareBase), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ renderId: latestRender.id }),
      });
      const parsed = shareLinkCreatedResponseSchema.safeParse(
        response.ok ? await response.json() : null,
      );
      if (!parsed.success) {
        setMessage(
          "A share link could not be created. Render the lesson first.",
        );
        return;
      }
      const link = `${window.location.origin}/share/${encodeURIComponent(parsed.data.token)}`;
      try {
        await globalThis.navigator.clipboard.writeText(link);
        setMessage("View-only link copied to the clipboard.");
      } catch {
        setMessage(`View-only link: ${link}`);
      }
      await refreshShareLinks();
    } finally {
      setShareBusy(false);
    }
  };
  const revokeShareLink = async (shareLink: ShareLink) => {
    setShareBusy(true);
    try {
      const response = await fetch(
        api(`${shareBase}/${encodeURIComponent(shareLink.id)}`),
        { method: "DELETE", credentials: "include" },
      );
      if (response.ok) {
        setRevokeTarget(null);
        await refreshShareLinks();
      } else setMessage("The share link could not be revoked.");
    } finally {
      setShareBusy(false);
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
                <span aria-label="Download and export lesson files">
                  <a
                    href={api(
                      `${base}/${encodeURIComponent(render.id)}/download`,
                    )}
                  >
                    Download MP4
                  </a>{" "}
                  <a
                    href={api(
                      `/projects/${encodeURIComponent(projectId)}/exports/${encodeURIComponent(render.lessonVersionId)}/captions?format=srt`,
                    )}
                  >
                    SRT
                  </a>{" "}
                  <a
                    href={api(
                      `/projects/${encodeURIComponent(projectId)}/exports/${encodeURIComponent(render.lessonVersionId)}/captions?format=vtt`,
                    )}
                  >
                    VTT
                  </a>{" "}
                  <a
                    href={api(
                      `/projects/${encodeURIComponent(projectId)}/exports/${encodeURIComponent(render.lessonVersionId)}/narration?format=markdown`,
                    )}
                  >
                    Narration
                  </a>{" "}
                  <a
                    href={api(
                      `/projects/${encodeURIComponent(projectId)}/exports/${encodeURIComponent(render.lessonVersionId)}/storyboard?format=markdown`,
                    )}
                  >
                    Storyboard
                  </a>
                </span>
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
      <section aria-labelledby="share-heading">
        <h2 id="share-heading">Share view-only lesson</h2>
        <p>Shared viewers can play only the selected rendered lesson.</p>
        <button
          type="button"
          disabled={
            shareBusy || !renders.some((render) => render.video !== null)
          }
          onClick={() => void createShareLink()}
        >
          {shareBusy ? "Creating…" : "Create and copy share link"}
        </button>
        <ul aria-label="Share links">
          {shareLinks.map((link) => (
            <li key={link.id}>
              {link.status}
              {link.expiresAt
                ? ` until ${new Date(link.expiresAt).toLocaleString()}`
                : ""}
              {link.status === "active" ? (
                <button
                  type="button"
                  disabled={shareBusy}
                  onClick={() => setRevokeTarget(link)}
                >
                  Revoke
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {revokeTarget ? (
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-share-link-heading"
          >
            <h3 id="revoke-share-link-heading">Revoke view-only link?</h3>
            <p>
              Revoke the link created{" "}
              {new Date(revokeTarget.createdAt).toLocaleString()}? Anyone using
              it will lose access immediately.
            </p>
            <button
              type="button"
              disabled={shareBusy}
              onClick={() => setRevokeTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={shareBusy}
              onClick={() => void revokeShareLink(revokeTarget)}
            >
              {shareBusy ? "Revoking…" : "Revoke link"}
            </button>
          </section>
        ) : null}
      </section>
    </section>
  );
}
