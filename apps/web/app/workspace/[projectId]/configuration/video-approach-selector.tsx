"use client";

/**
 * ST-096 — the video approach selector.
 *
 * Two things this control is careful about.
 *
 * **It never decides anything.** `eligibility` comes from the server and is
 * re-checked there on every write, so this component's job is to render that
 * answer faithfully: show the experimental option only when the server says it
 * is visible, disable it when the server says it is not selectable, and print
 * the server's reasons rather than inventing friendlier ones. Hiding a control
 * is not authorisation, and a client that guessed would only ever guess wrong
 * in the direction of offering something that then fails.
 *
 * **A refusal always offers a way forward.** Every reason carries a suggested
 * correction, and an unsupported lesson also gets a direct action to open a
 * curated test lesson — because "this is not available" with nothing after it
 * is the dead end AC2 exists to prevent.
 */

import React, { useState } from "react";
import { Flask, Article } from "@phosphor-icons/react";
import type {
  DemonstrationEligibility,
  DemonstrationIneligibilityReason,
} from "@avlp/schemas/demonstration-pilot";
import type { VideoApproach } from "@avlp/schemas";

export const videoApproachOptions: readonly {
  value: VideoApproach;
  label: string;
  description: string;
  experimental: boolean;
}[] = [
  {
    value: "standard",
    label: "Standard explanation",
    description:
      "Explains the lesson using the current scene templates, text, images, and diagrams.",
    experimental: false,
  },
  {
    value: "demonstration",
    label: "Demonstration-led explanation",
    description:
      "Shows the explanation through objects moving, accumulating, splitting, or changing state alongside narration.",
    experimental: true,
  },
];

function ReasonList({
  reasons,
}: {
  reasons: readonly DemonstrationIneligibilityReason[];
}) {
  if (reasons.length === 0) return null;
  return (
    <ul
      style={{
        listStyle: "none",
        margin: "8px 0 0",
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      {reasons.map((reason, index) => (
        <li
          key={`${reason.code}-${index}`}
          style={{
            fontSize: "12px",
            lineHeight: "17px",
            color: "var(--color-text-muted)",
          }}
        >
          <span style={{ color: "var(--color-text)", fontWeight: 500 }}>
            {reason.message}
          </span>{" "}
          {reason.suggestedCorrection}
        </li>
      ))}
    </ul>
  );
}

export function VideoApproachSelector({
  value,
  eligibility,
  disabled,
  onChange,
  onOpenTestLesson,
}: {
  value: VideoApproach;
  eligibility: DemonstrationEligibility | null;
  disabled: boolean;
  onChange: (approach: VideoApproach) => void;
  onOpenTestLesson?: (subject: string) => Promise<void>;
}) {
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  // Until the server has answered, the experimental option is simply not there.
  // Rendering it optimistically and retracting it would be worse than a moment
  // of one option.
  const showExperimental = eligibility?.visible === true;
  const experimentalSelectable = eligibility?.selectable === true;
  const options = videoApproachOptions.filter(
    (option) => !option.experimental || showExperimental,
  );
  const testLesson = eligibility?.supportedTestLesson ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div
        role="radiogroup"
        aria-label="Video approach"
        style={{ display: "flex", flexDirection: "column", gap: "8px" }}
      >
        {options.map((option) => {
          const isSelected = value === option.value;
          const isDisabled =
            disabled || (option.experimental && !experimentalSelectable);
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={isDisabled}
              disabled={isDisabled}
              onClick={() => {
                if (!isDisabled) onChange(option.value);
              }}
              style={{
                padding: "12px 14px",
                textAlign: "left",
                backgroundColor: isSelected
                  ? "var(--color-surface-brand)"
                  : "var(--color-surface-subtle)",
                border: isSelected
                  ? "1.5px solid var(--color-brand)"
                  : "1px solid var(--color-border)",
                borderRadius: "var(--radius-control)",
                cursor: isDisabled ? "not-allowed" : "pointer",
                opacity: isDisabled ? 0.6 : 1,
                display: "flex",
                flexDirection: "column",
                gap: "3px",
                transition: "all var(--motion-quick) var(--motion-easing)",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: isSelected ? 600 : 500,
                  color: isSelected ? "var(--color-brand)" : "var(--color-text)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {option.experimental && <Flask size={14} weight="bold" />}
                {option.label}
                {option.experimental && (
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      padding: "2px 6px",
                      borderRadius: "999px",
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Experimental
                  </span>
                )}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--color-text-muted)",
                  lineHeight: "15px",
                }}
              >
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      {showExperimental && !experimentalSelectable && (
        <div
          role="status"
          style={{
            padding: "10px 12px",
            borderRadius: "var(--radius-control)",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface-subtle)",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--color-text)",
            }}
          >
            Demonstration-led explanation is unavailable for this lesson
          </span>
          <ReasonList reasons={eligibility?.reasons ?? []} />
          {testLesson !== null && onOpenTestLesson !== undefined && (
            <div style={{ marginTop: "10px" }}>
              <button
                type="button"
                disabled={opening}
                onClick={() => {
                  setOpening(true);
                  setOpenError(null);
                  void onOpenTestLesson(testLesson.subject)
                    .catch((error: unknown) => {
                      setOpenError(
                        error instanceof Error
                          ? error.message
                          : "The test lesson could not be opened.",
                      );
                    })
                    .finally(() => {
                      setOpening(false);
                    });
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--color-brand)",
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-brand)",
                  borderRadius: "var(--radius-control)",
                  cursor: opening ? "progress" : "pointer",
                }}
              >
                <Article size={14} weight="bold" />
                {opening
                  ? "Opening…"
                  : `Open supported test lesson: ${testLesson.label}`}
              </button>
              {openError !== null && (
                <p
                  role="alert"
                  style={{
                    margin: "8px 0 0",
                    fontSize: "12px",
                    color: "var(--color-error-fg)",
                  }}
                >
                  {openError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
