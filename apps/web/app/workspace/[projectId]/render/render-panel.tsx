"use client";

import React, { useEffect, useMemo, useState, type JSX } from "react";
import {
  renderStatusResponseSchema,
  shareLinkCreatedResponseSchema,
  shareLinksResponseSchema,
  type RenderStatusResponse,
  type ShareLink,
} from "@avlp/schemas";
import { Button } from "../../../../components/ui/button";
import { StatusLabel } from "../../../../components/ui/status-label";
import { Notice } from "../../../../components/ui/notice";
import { Dialog } from "../../../../components/ui/dialog";
import { InformationRail } from "../../../../components/layout/information-rail";
import {
  ArrowClockwise,
  DownloadSimple,
  FileText,
  FilmSlate,
  ShareNetwork,
  ShieldCheck,
  Sparkle,
  VideoCamera,
  XCircle,
} from "@phosphor-icons/react";

function api(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function RenderPanel({
  projectId,
  projectTitle = "Lesson Delivery",
  lessonVersionId,
  initial,
}: {
  projectId: string;
  projectTitle?: string;
  lessonVersionId: string | null;
  initial: readonly RenderStatusResponse[];
}): JSX.Element {
  const [renders, setRenders] =
    useState<readonly RenderStatusResponse[]>(initial);
  const [busy, setBusy] = useState(false);
  const [shareLinks, setShareLinks] = useState<readonly ShareLink[]>([]);
  const [shareBusy, setShareBusy] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ShareLink | null>(null);
  const [message, setMessage] = useState<{
    type: "info" | "success" | "error";
    text: string;
  } | null>(null);

  const base = `/projects/${encodeURIComponent(projectId)}/renders`;

  const refresh = async () => {
    try {
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
        if (next.every((value) => value.success)) {
          setRenders(next.map((value) => value.data));
        }
      }
    } catch {
      // Background poll failure is non-blocking
    }
  };

  // Poll for updates if any render is queued or in progress
  useEffect(() => {
    const hasActiveRender = renders.some(
      (r) => r.status === "queued" || r.status === "rendering",
    );
    const intervalTime = hasActiveRender ? 3_000 : 8_000;
    const timer = window.setInterval(() => void refresh(), intervalTime);
    return () => window.clearInterval(timer);
  }, [renders]);

  const shareBase = `/projects/${encodeURIComponent(projectId)}/share-links`;

  const refreshShareLinks = async () => {
    try {
      const response = await fetch(api(shareBase), {
        credentials: "include",
        cache: "no-store",
      });
      const parsed = shareLinksResponseSchema.safeParse(
        response.ok ? await response.json() : null,
      );
      if (parsed.success) setShareLinks(parsed.data.shareLinks);
    } catch {
      // Ignored
    }
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
        setMessage({
          type: "error",
          text: "The render action could not be completed. Check preflight validation and try again.",
        });
        return;
      }
      setMessage({
        type: "info",
        text: "Render job queued successfully. Processing motion graphics and narration.",
      });
      await refresh();
    } catch {
      setMessage({
        type: "error",
        text: "Network connection error while submitting render action.",
      });
    } finally {
      setBusy(false);
    }
  };

  const createShareLink = async () => {
    const latestCompleted = renders.find((render) => render.video !== null);
    if (latestCompleted === undefined) return;
    setShareBusy(true);
    setMessage(null);
    try {
      const response = await fetch(api(shareBase), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ renderId: latestCompleted.id }),
      });
      const parsed = shareLinkCreatedResponseSchema.safeParse(
        response.ok ? await response.json() : null,
      );
      if (!parsed.success) {
        setMessage({
          type: "error",
          text: "A share link could not be created. Render the lesson first.",
        });
        return;
      }
      const link = `${window.location.origin}/share/${encodeURIComponent(parsed.data.token)}`;
      try {
        await globalThis.navigator.clipboard.writeText(link);
        setMessage({
          type: "success",
          text: "View-only link copied to the clipboard.",
        });
      } catch {
        setMessage({
          type: "success",
          text: `View-only link: ${link}`,
        });
      }
      await refreshShareLinks();
    } catch {
      setMessage({
        type: "error",
        text: "Error creating share link. Please try again.",
      });
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
        setMessage({
          type: "info",
          text: "Share link revoked immediately. Viewers can no longer access this link.",
        });
        await refreshShareLinks();
      } else {
        setMessage({
          type: "error",
          text: "The share link could not be revoked.",
        });
      }
    } catch {
      setMessage({
        type: "error",
        text: "Error revoking share link. Please check network connection.",
      });
    } finally {
      setShareBusy(false);
    }
  };

  const latestRender = renders[0] ?? null;
  const latestCompletedRender = useMemo(
    () => renders.find((r) => r.video !== null && r.status === "completed"),
    [renders],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        gap: "32px",
        minHeight: "calc(100vh - 80px)",
        boxSizing: "border-box",
        padding: "24px 0",
      }}
    >
      {/* Main Delivery Board Column */}
      <section
        aria-labelledby="render-heading"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "28px",
          minWidth: 0,
        }}
      >
        {/* Page Header */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1
                id="render-heading"
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                Render lesson
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--color-text-muted)",
                  margin: "4px 0 0",
                }}
              >
                Generate full 1080p production video, download exports, and
                distribute privacy-safe view-only links for {projectTitle}.
              </p>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="compact"
              onClick={() => void refresh()}
              disabled={busy}
              leftIcon={<ArrowClockwise weight="bold" />}
            >
              Refresh status
            </Button>
          </div>

          {message ? (
            <Notice
              type={message.type}
              message={message.text}
              onClose={() => setMessage(null)}
            />
          ) : null}
        </div>

        {/* DOMINANT LATEST RENDER CARD */}
        <section
          aria-labelledby="latest-render-heading"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-card)",
            padding: "24px",
            boxShadow: "var(--shadow-elevation)",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(109, 40, 217, 0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-brand)",
                }}
              >
                <FilmSlate size={22} weight="duotone" />
              </div>
              <div>
                <h2
                  id="latest-render-heading"
                  style={{
                    fontSize: "17px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    margin: 0,
                  }}
                >
                  Latest production render
                </h2>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--color-text-muted)",
                    margin: "2px 0 0",
                  }}
                >
                  {latestRender
                    ? `Attempt #${latestRender.attempt + 1} · Created ${new Date(
                        latestRender.createdAt,
                      ).toLocaleTimeString()}`
                    : "No renders executed for this project yet."}
                </p>
              </div>
            </div>

            {latestRender ? (
              <StatusLabel
                status={
                  latestRender.status === "completed"
                    ? "success"
                    : latestRender.status === "rendering" ||
                        latestRender.status === "queued"
                      ? "in_progress"
                      : latestRender.status === "failed"
                        ? "error"
                        : "info"
                }
                label={
                  latestRender.status === "completed"
                    ? "Completed"
                    : latestRender.status === "rendering"
                      ? `Rendering (${Math.round(latestRender.progress * 100)}%)`
                      : latestRender.status === "queued"
                        ? "Queued"
                        : latestRender.status === "failed"
                          ? "Failed"
                          : latestRender.status
                }
              />
            ) : (
              <StatusLabel status="info" label="Not started" />
            )}
          </div>

          {/* Body depending on render state */}
          {!latestRender ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: "36px 20px",
                backgroundColor: "var(--color-surface-subtle)",
                borderRadius: "var(--radius-control)",
                border: "1px dashed var(--color-border)",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(109, 40, 217, 0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-brand)",
                }}
              >
                <VideoCamera size={26} weight="duotone" />
              </div>
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--color-text)",
                  margin: 0,
                }}
              >
                Ready for high-definition rendering
              </h3>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-muted)",
                  maxWidth: "440px",
                  margin: 0,
                }}
              >
                Assemble all scenes, synthesized speech, motion timing, and
                captions into a 1080p MP4 master video.
              </p>

              {lessonVersionId === null ? (
                <div style={{ marginTop: "8px" }}>
                  <Notice
                    type="warning"
                    message="Save an approved lesson version before rendering."
                  />
                </div>
              ) : (
                <div style={{ marginTop: "12px" }}>
                  <Button
                    type="button"
                    variant="primary"
                    size="large"
                    disabled={busy}
                    onClick={() => void submit(base, { lessonVersionId })}
                    leftIcon={<FilmSlate weight="bold" />}
                  >
                    {busy ? "Starting render…" : "Render 1080p video"}
                  </Button>
                </div>
              )}
            </div>
          ) : latestRender.status === "completed" && latestRender.video ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "24px",
                alignItems: "center",
                backgroundColor: "var(--color-surface-subtle)",
                borderRadius: "var(--radius-control)",
                padding: "20px",
                border: "1px solid var(--color-border)",
              }}
            >
              {/* Thumbnail Display */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "16 / 9",
                  backgroundColor: "#0F0B15",
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "1px solid var(--color-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {latestRender.video.thumbnailUrl ? (
                  <img
                    src={latestRender.video.thumbnailUrl}
                    alt="Rendered lesson thumbnail"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                      color: "rgba(255,255,255,0.6)",
                    }}
                  >
                    <VideoCamera size={36} weight="duotone" />
                    <span style={{ fontSize: "12px" }}>1080p Video Master</span>
                  </div>
                )}
                <div
                  style={{
                    position: "absolute",
                    bottom: "8px",
                    right: "8px",
                    backgroundColor: "rgba(0, 0, 0, 0.75)",
                    color: "#FFFFFF",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                  }}
                >
                  {latestRender.video.width}×{latestRender.video.height} ·{" "}
                  {latestRender.video.fps} FPS
                </div>
              </div>

              {/* Video Specifications & Download CTA */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      backgroundColor: "var(--color-surface)",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--color-text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        fontWeight: 600,
                      }}
                    >
                      Resolution
                    </span>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--color-text)",
                        marginTop: "2px",
                      }}
                    >
                      {latestRender.video.width}×{latestRender.video.height} (
                      {latestRender.video.height}p)
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: "var(--color-surface)",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--color-text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        fontWeight: 600,
                      }}
                    >
                      Codecs
                    </span>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--color-text)",
                        marginTop: "2px",
                      }}
                    >
                      {(latestRender.video.videoCodec ?? "H.264").toUpperCase()} /{" "}
                      {(latestRender.video.audioCodec ?? "AAC").toUpperCase()}
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: "var(--color-surface)",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--color-text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        fontWeight: 600,
                      }}
                    >
                      File size
                    </span>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--color-text)",
                        marginTop: "2px",
                      }}
                    >
                      {formatBytes(latestRender.video.sizeBytes)}
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: "var(--color-surface)",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--color-text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        fontWeight: 600,
                      }}
                    >
                      Completed
                    </span>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--color-text)",
                        marginTop: "2px",
                      }}
                    >
                      {latestRender.completedAt
                        ? new Date(
                            latestRender.completedAt,
                          ).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Just now"}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <a
                    href={api(
                      `${base}/${encodeURIComponent(latestRender.id)}/download`,
                    )}
                    style={{ textDecoration: "none" }}
                  >
                    <Button
                      type="button"
                      variant="primary"
                      size="default"
                      leftIcon={<DownloadSimple weight="bold" />}
                    >
                      Download MP4
                    </Button>
                  </a>

                  {lessonVersionId !== null && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="default"
                      disabled={busy}
                      onClick={() => void submit(base, { lessonVersionId })}
                    >
                      {busy ? "Starting…" : "Re-render lesson"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : latestRender.status === "rendering" ||
            latestRender.status === "queued" ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                padding: "24px",
                backgroundColor: "var(--color-surface-subtle)",
                borderRadius: "var(--radius-control)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "var(--color-text)",
                      margin: 0,
                    }}
                  >
                    {latestRender.status === "rendering"
                      ? "Rendering video frames…"
                      : "Queued for rendering worker…"}
                  </h3>
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--color-text-muted)",
                      margin: "4px 0 0",
                    }}
                  >
                    Synthesizing motion animations, voice audio, and timing
                    cues.
                  </p>
                </div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "var(--color-brand)",
                  }}
                >
                  {Math.round(latestRender.progress * 100)}%
                </div>
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  width: "100%",
                  height: "8px",
                  backgroundColor: "var(--color-border)",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.round(latestRender.progress * 100)}%`,
                    height: "100%",
                    backgroundColor: "var(--color-brand)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>

              <div
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Sparkle size={14} color="var(--color-brand)" weight="bold" />
                <span>
                  You can safely navigate away or keep this tab open. Status
                  refreshes automatically.
                </span>
              </div>
            </div>
          ) : latestRender.status === "failed" ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                padding: "20px",
                backgroundColor: "rgba(239, 68, 68, 0.06)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                borderRadius: "var(--radius-control)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                }}
              >
                <XCircle size={24} color="#EF4444" weight="fill" />
                <div>
                  <h3
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "#B91C1C",
                      margin: 0,
                    }}
                  >
                    Render encountered an error
                  </h3>
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--color-text)",
                      margin: "4px 0 0",
                    }}
                  >
                    {latestRender.errorMessage ??
                      "The video rendering worker failed to process this lesson."}
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "center",
                  marginTop: "4px",
                }}
              >
                {latestRender.retryable ? (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={busy}
                    onClick={() =>
                      void submit(
                        `${base}/${encodeURIComponent(latestRender.id)}/retry`,
                      )
                    }
                    leftIcon={<ArrowClockwise weight="bold" />}
                  >
                    {busy ? "Retrying…" : "Retry render"}
                  </Button>
                ) : (
                  <span
                    style={{
                      fontSize: "13px",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Terminal failure. Please check preflight validation issues
                    or edit the storyboard.
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </section>

        {/* GROUPED DOWNLOADS & EXPORTS SECTION */}
        <section
          aria-labelledby="downloads-heading"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-card)",
            padding: "24px",
            boxShadow: "var(--shadow-elevation)",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <DownloadSimple
              size={20}
              weight="bold"
              color="var(--color-brand)"
            />
            <h2
              id="downloads-heading"
              style={{
                fontSize: "17px",
                fontWeight: 600,
                color: "var(--color-text)",
                margin: 0,
              }}
            >
              Downloads & media exports
            </h2>
          </div>
          <p
            style={{
              fontSize: "13px",
              color: "var(--color-text-muted)",
              margin: 0,
            }}
          >
            Export production video files, synchronized subtitle tracks, and
            text scripts bound to approved lesson versions.
          </p>

          <div
            aria-label="Download and export lesson files"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "12px",
              marginTop: "4px",
            }}
          >
            {/* MP4 Video */}
            <div
              style={{
                backgroundColor: "var(--color-surface-subtle)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      backgroundColor: "rgba(109, 40, 217, 0.1)",
                      color: "var(--color-brand)",
                      padding: "2px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    MP4
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: latestCompletedRender
                        ? "var(--color-success-fg, #16A34A)"
                        : "var(--color-text-muted)",
                      fontWeight: 500,
                    }}
                  >
                    {latestCompletedRender ? "Available" : "Not rendered"}
                  </span>
                </div>
                <h3
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    margin: "8px 0 2px",
                  }}
                >
                  Production Video (1080p)
                </h3>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-muted)",
                    margin: 0,
                  }}
                >
                  Full resolution video master with audio and motion graphics.
                </p>
              </div>
              {latestCompletedRender ? (
                <a
                  href={api(
                    `${base}/${encodeURIComponent(latestCompletedRender.id)}/download`,
                  )}
                  style={{ textDecoration: "none" }}
                >
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    style={{ width: "100%" }}
                  >
                    Download MP4
                  </Button>
                </a>
              ) : (
                <Button
                  type="button"
                  variant="tertiary"
                  size="compact"
                  disabled
                  style={{ width: "100%" }}
                >
                  Render required
                </Button>
              )}
            </div>

            {/* SRT Captions */}
            <div
              style={{
                backgroundColor: "var(--color-surface-subtle)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      backgroundColor: "rgba(59, 130, 246, 0.1)",
                      color: "#2563EB",
                      padding: "2px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    SRT
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: lessonVersionId
                        ? "var(--color-success-fg, #16A34A)"
                        : "var(--color-text-muted)",
                      fontWeight: 500,
                    }}
                  >
                    {lessonVersionId ? "Available" : "No version"}
                  </span>
                </div>
                <h3
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    margin: "8px 0 2px",
                  }}
                >
                  Subtitles (SRT)
                </h3>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-muted)",
                    margin: 0,
                  }}
                >
                  SubRip subtitle format for standard video players and LMS.
                </p>
              </div>
              {lessonVersionId ? (
                <a
                  href={api(
                    `/projects/${encodeURIComponent(projectId)}/exports/${encodeURIComponent(lessonVersionId)}/captions?format=srt`,
                  )}
                  style={{ textDecoration: "none" }}
                >
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    style={{ width: "100%" }}
                  >
                    SRT
                  </Button>
                </a>
              ) : (
                <Button
                  type="button"
                  variant="tertiary"
                  size="compact"
                  disabled
                  style={{ width: "100%" }}
                >
                  Unavailable
                </Button>
              )}
            </div>

            {/* VTT Captions */}
            <div
              style={{
                backgroundColor: "var(--color-surface-subtle)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      backgroundColor: "rgba(59, 130, 246, 0.1)",
                      color: "#2563EB",
                      padding: "2px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    VTT
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: lessonVersionId
                        ? "var(--color-success-fg, #16A34A)"
                        : "var(--color-text-muted)",
                      fontWeight: 500,
                    }}
                  >
                    {lessonVersionId ? "Available" : "No version"}
                  </span>
                </div>
                <h3
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    margin: "8px 0 2px",
                  }}
                >
                  Web Captions (VTT)
                </h3>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-muted)",
                    margin: 0,
                  }}
                >
                  WebVTT format optimized for HTML5 web video players.
                </p>
              </div>
              {lessonVersionId ? (
                <a
                  href={api(
                    `/projects/${encodeURIComponent(projectId)}/exports/${encodeURIComponent(lessonVersionId)}/captions?format=vtt`,
                  )}
                  style={{ textDecoration: "none" }}
                >
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    style={{ width: "100%" }}
                  >
                    VTT
                  </Button>
                </a>
              ) : (
                <Button
                  type="button"
                  variant="tertiary"
                  size="compact"
                  disabled
                  style={{ width: "100%" }}
                >
                  Unavailable
                </Button>
              )}
            </div>

            {/* Narration Script */}
            <div
              style={{
                backgroundColor: "var(--color-surface-subtle)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      backgroundColor: "rgba(16, 185, 129, 0.1)",
                      color: "#059669",
                      padding: "2px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    MD
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: lessonVersionId
                        ? "var(--color-success-fg, #16A34A)"
                        : "var(--color-text-muted)",
                      fontWeight: 500,
                    }}
                  >
                    {lessonVersionId ? "Available" : "No version"}
                  </span>
                </div>
                <h3
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    margin: "8px 0 2px",
                  }}
                >
                  Narration script
                </h3>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-muted)",
                    margin: 0,
                  }}
                >
                  Spoken voice narration text by scene in Markdown format.
                </p>
              </div>
              {lessonVersionId ? (
                <a
                  href={api(
                    `/projects/${encodeURIComponent(projectId)}/exports/${encodeURIComponent(lessonVersionId)}/narration?format=markdown`,
                  )}
                  style={{ textDecoration: "none" }}
                >
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    style={{ width: "100%" }}
                  >
                    Narration
                  </Button>
                </a>
              ) : (
                <Button
                  type="button"
                  variant="tertiary"
                  size="compact"
                  disabled
                  style={{ width: "100%" }}
                >
                  Unavailable
                </Button>
              )}
            </div>

            {/* Storyboard Script */}
            <div
              style={{
                backgroundColor: "var(--color-surface-subtle)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      backgroundColor: "rgba(16, 185, 129, 0.1)",
                      color: "#059669",
                      padding: "2px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    MD
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: lessonVersionId
                        ? "var(--color-success-fg, #16A34A)"
                        : "var(--color-text-muted)",
                      fontWeight: 500,
                    }}
                  >
                    {lessonVersionId ? "Available" : "No version"}
                  </span>
                </div>
                <h3
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    margin: "8px 0 2px",
                  }}
                >
                  Storyboard outline
                </h3>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-muted)",
                    margin: 0,
                  }}
                >
                  Scene specifications, layout templates, and visual text.
                </p>
              </div>
              {lessonVersionId ? (
                <a
                  href={api(
                    `/projects/${encodeURIComponent(projectId)}/exports/${encodeURIComponent(lessonVersionId)}/storyboard?format=markdown`,
                  )}
                  style={{ textDecoration: "none" }}
                >
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    style={{ width: "100%" }}
                  >
                    Storyboard
                  </Button>
                </a>
              ) : (
                <Button
                  type="button"
                  variant="tertiary"
                  size="compact"
                  disabled
                  style={{ width: "100%" }}
                >
                  Unavailable
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* VIEW-ONLY SHARE LINKS SECTION */}
        <section
          aria-labelledby="share-heading"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-card)",
            padding: "24px",
            boxShadow: "var(--shadow-elevation)",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <ShareNetwork
                  size={20}
                  weight="bold"
                  color="var(--color-brand)"
                />
                <h2
                  id="share-heading"
                  style={{
                    fontSize: "17px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    margin: 0,
                  }}
                >
                  Share view-only lesson
                </h2>
              </div>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-muted)",
                  margin: "4px 0 0",
                }}
              >
                Shared viewers can play only the selected rendered lesson. No
                prompts, source documents, or editor tools are exposed.
              </p>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="default"
              disabled={
                shareBusy || !renders.some((render) => render.video !== null)
              }
              onClick={() => void createShareLink()}
              leftIcon={<ShareNetwork weight="bold" />}
            >
              {shareBusy ? "Creating…" : "Create and copy share link"}
            </Button>
          </div>

          <ul
            aria-label="Share links"
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {shareLinks.length === 0 ? (
              <li
                style={{
                  padding: "16px",
                  textAlign: "center",
                  fontSize: "13px",
                  color: "var(--color-text-muted)",
                  backgroundColor: "var(--color-surface-subtle)",
                  borderRadius: "6px",
                  border: "1px dashed var(--color-border)",
                }}
              >
                No share links generated yet. Click &apos;Create and copy share
                link&apos; to share this lesson.
              </li>
            ) : (
              shareLinks.map((link) => (
                <li
                  key={link.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    backgroundColor: "var(--color-surface-subtle)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "6px",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <StatusLabel
                      status={link.status === "active" ? "success" : "info"}
                      label={link.status === "active" ? "Active" : "Revoked"}
                    />
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--color-text)",
                      }}
                    >
                      Created {new Date(link.createdAt).toLocaleDateString()}{" "}
                      at {new Date(link.createdAt).toLocaleTimeString()}
                      {link.expiresAt
                        ? ` until ${new Date(link.expiresAt).toLocaleString()}`
                        : ""}
                    </span>
                  </div>

                  {link.status === "active" ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="compact"
                      disabled={shareBusy}
                      onClick={() => setRevokeTarget(link)}
                    >
                      Revoke
                    </Button>
                  ) : (
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--color-text-muted)",
                        fontStyle: "italic",
                      }}
                    >
                      Revoked
                    </span>
                  )}
                </li>
              ))
            )}
          </ul>

          {/* Named Confirmation Dialog */}
          {revokeTarget ? (
            <Dialog
              isOpen={true}
              onClose={() => setRevokeTarget(null)}
              title="Revoke view-only link?"
              description={`Revoke the link created ${new Date(
                revokeTarget.createdAt,
              ).toLocaleString()}? Anyone using it will lose access immediately.`}
              footer={
                <>
                  <Button
                    type="button"
                    variant="tertiary"
                    disabled={shareBusy}
                    onClick={() => setRevokeTarget(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={shareBusy}
                    onClick={() => void revokeShareLink(revokeTarget)}
                  >
                    {shareBusy ? "Revoking…" : "Revoke link"}
                  </Button>
                </>
              }
            >
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-muted)",
                  lineHeight: "1.5",
                }}
              >
                Revoking this share link immediately destroys the public playback
                token. Any external viewers or embeds relying on this URL will
                receive a standard unavailable error page.
              </div>
            </Dialog>
          ) : null}
        </section>

        {/* QUIETER RENDER HISTORY SECTION */}
        <section
          aria-labelledby="history-heading"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-card)",
            padding: "24px",
            boxShadow: "var(--shadow-elevation)",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <FilmSlate size={20} weight="bold" color="var(--color-brand)" />
            <h2
              id="history-heading"
              style={{
                fontSize: "17px",
                fontWeight: 600,
                color: "var(--color-text)",
                margin: 0,
              }}
            >
              Render history
            </h2>
          </div>
          <p
            style={{
              fontSize: "13px",
              color: "var(--color-text-muted)",
              margin: 0,
            }}
          >
            Past video render jobs and execution records for this project.
          </p>

          <ul
            aria-label="Render history"
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {renders.length === 0 ? (
              <li
                style={{
                  padding: "16px",
                  textAlign: "center",
                  fontSize: "13px",
                  color: "var(--color-text-muted)",
                  backgroundColor: "var(--color-surface-subtle)",
                  borderRadius: "6px",
                  border: "1px dashed var(--color-border)",
                }}
              >
                No render history available.
              </li>
            ) : (
              renders.map((render) => (
                <li
                  key={render.id}
                  data-testid={`render-${render.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    backgroundColor: "var(--color-surface-subtle)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "6px",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <strong>{render.status}</strong> —{" "}
                    {Math.round(render.progress * 100)}%
                    {render.errorMessage ? (
                      <span
                        style={{
                          color: "#B91C1C",
                          fontSize: "13px",
                        }}
                      >
                        {" "}
                        {render.errorMessage}
                      </span>
                    ) : null}
                    {render.video ? (
                      <span
                        style={{
                          fontSize: "13px",
                          color: "var(--color-text-muted)",
                        }}
                      >
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
                            style={{
                              display: "none",
                            }}
                          />
                        ) : null}
                        <span
                          aria-label="Download and export lesson files"
                          style={{ display: "none" }}
                        >
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
                  </div>

                  {render.retryable ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      disabled={busy}
                      onClick={() =>
                        void submit(
                          `${base}/${encodeURIComponent(render.id)}/retry`,
                        )
                      }
                      leftIcon={<ArrowClockwise weight="bold" />}
                    >
                      Retry render
                    </Button>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </section>
      </section>

      {/* Contextual Information Rail */}
      <InformationRail title="Delivery context" width="320px">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            backgroundColor: "var(--color-surface-subtle)",
            padding: "16px",
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FilmSlate size={18} color="var(--color-brand)" weight="bold" />
            <h4
              style={{
                fontSize: "14px",
                fontWeight: 600,
                margin: 0,
                color: "var(--color-text)",
              }}
            >
              Output standard
            </h4>
          </div>
          <p
            style={{
              fontSize: "12px",
              color: "var(--color-text-muted)",
              margin: 0,
              lineHeight: "1.5",
            }}
          >
            Video is rendered at <strong>1080p (1920×1080)</strong> at 30 fps
            with H.264 video compression and 48kHz AAC stereo audio.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            backgroundColor: "var(--color-surface-subtle)",
            padding: "16px",
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheck size={18} color="#10B981" weight="bold" />
            <h4
              style={{
                fontSize: "14px",
                fontWeight: 600,
                margin: 0,
                color: "var(--color-text)",
              }}
            >
              Privacy & permissions
            </h4>
          </div>
          <p
            style={{
              fontSize: "12px",
              color: "var(--color-text-muted)",
              margin: 0,
              lineHeight: "1.5",
            }}
          >
            All media downloads use private time-limited signed URLs. View-only
            share links contain opaque tokens that can be revoked immediately at
            any time.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            backgroundColor: "var(--color-surface-subtle)",
            padding: "16px",
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FileText size={18} color="var(--color-brand)" weight="bold" />
            <h4
              style={{
                fontSize: "14px",
                fontWeight: 600,
                margin: 0,
                color: "var(--color-text)",
              }}
            >
              Export formats
            </h4>
          </div>
          <ul
            style={{
              fontSize: "12px",
              color: "var(--color-text-muted)",
              margin: 0,
              paddingLeft: "18px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <li>MP4 Video (1080p HD)</li>
            <li>SRT / VTT Subtitles</li>
            <li>Markdown narration script</li>
            <li>Markdown storyboard schema</li>
          </ul>
        </div>
      </InformationRail>
    </div>
  );
}
