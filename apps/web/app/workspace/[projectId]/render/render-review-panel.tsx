"use client";

/**
 * ST-103 — the post-render review summary on the render page.
 *
 * Shows what the deterministic review found in the produced MP4: blocking
 * findings (why the video was not delivered), advisory warnings, the measured
 * loudness, and a four-frame contact sheet. Every finding carries the time it
 * starts at, when it has one, and the correction the teacher can make.
 */

import React from "react";
import type { RenderReviewSummary } from "@avlp/schemas";

export function formatReviewTimestamp(ms: number): string {
  const totalTenths = Math.floor(ms / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = (totalTenths % 600) / 10;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function formatLevel(value: number | null, unit: string): string {
  return value === null ? "Not measurable" : `${value.toFixed(1)} ${unit}`;
}

export function RenderReviewPanel({
  review,
}: Readonly<{ review: RenderReviewSummary }>) {
  const errors = review.findings.filter((item) => item.severity === "error");
  const warnings = review.findings.filter(
    (item) => item.severity === "warning",
  );
  const passed = review.outcome === "passed";
  return (
    <section
      aria-label="Quality review"
      data-testid="render-review-panel"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-control)",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        marginTop: "16px",
        padding: "20px",
      }}
    >
      <header
        style={{
          alignItems: "baseline",
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          justifyContent: "space-between",
        }}
      >
        <h3
          style={{
            color: "var(--color-text)",
            fontSize: "15px",
            fontWeight: 600,
            margin: 0,
          }}
        >
          Quality review
        </h3>
        <span
          data-testid="render-review-outcome"
          role="status"
          style={{
            color: passed ? "var(--color-text)" : "var(--color-danger-text)",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {passed
            ? warnings.length === 0
              ? "Passed"
              : `Passed with ${warnings.length} note${warnings.length === 1 ? "" : "s"}`
            : "Not delivered: fix the issues below"}
        </span>
      </header>

      <dl
        style={{
          display: "grid",
          fontSize: "13px",
          gap: "4px 16px",
          gridTemplateColumns: "max-content 1fr",
          margin: 0,
        }}
      >
        <dt style={{ color: "var(--color-text-muted)" }}>Loudness</dt>
        <dd data-testid="render-review-loudness" style={{ margin: 0 }}>
          {formatLevel(review.loudness.integratedLufs, "LUFS")}
        </dd>
        <dt style={{ color: "var(--color-text-muted)" }}>Peak</dt>
        <dd style={{ margin: 0 }}>
          {formatLevel(review.loudness.peakDbfs, "dBFS")}
        </dd>
      </dl>

      {[...errors, ...warnings].length === 0 ? null : (
        <ul
          aria-label="Review findings"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {[...errors, ...warnings].map((item, index) => (
            <li
              data-severity={item.severity}
              data-testid="render-review-finding"
              key={`${item.code}-${item.atMs ?? "all"}-${index}`}
              style={{
                backgroundColor:
                  item.severity === "error"
                    ? "var(--color-danger-surface)"
                    : "var(--color-surface-subtle)",
                border: `1px solid ${
                  item.severity === "error"
                    ? "var(--color-danger-line)"
                    : "var(--color-border)"
                }`,
                borderRadius: "6px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                padding: "10px 14px",
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 600 }}>
                {item.severity === "error" ? "Blocking" : "Note"}
                {item.atMs === undefined
                  ? ""
                  : ` at ${formatReviewTimestamp(item.atMs)}`}
                {": "}
                {item.detail}
              </span>
              <span
                style={{ color: "var(--color-text-muted)", fontSize: "12px" }}
              >
                {item.correction}
              </span>
            </li>
          ))}
        </ul>
      )}

      {review.contactSheet.length === 0 ? null : (
        <figure style={{ margin: 0 }}>
          <div
            data-testid="render-review-contact-sheet"
            style={{
              display: "grid",
              gap: "8px",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            }}
          >
            {review.contactSheet.map((frame) => (
              <div key={frame.atMs} style={{ margin: 0 }}>
                <img
                  alt={`Video frame at ${formatReviewTimestamp(frame.atMs)}`}
                  src={frame.url}
                  style={{
                    aspectRatio: "16 / 9",
                    border: "1px solid var(--color-border)",
                    borderRadius: "6px",
                    display: "block",
                    objectFit: "cover",
                    width: "100%",
                  }}
                />
                <span
                  style={{ color: "var(--color-text-muted)", fontSize: "11px" }}
                >
                  {formatReviewTimestamp(frame.atMs)}
                </span>
              </div>
            ))}
          </div>
          <figcaption
            style={{
              color: "var(--color-text-muted)",
              fontSize: "12px",
              marginTop: "6px",
            }}
          >
            Frames sampled at 5%, 35%, 65% and 95% of the video.
          </figcaption>
        </figure>
      )}
    </section>
  );
}
