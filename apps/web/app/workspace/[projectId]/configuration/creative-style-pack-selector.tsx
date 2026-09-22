"use client";

/**
 * ST-102 — the creative style pack selector.
 *
 * `null` (the first option) keeps today's legacy `mvp-default` appearance and
 * requests no creative-design manifest. Any other value is resolved into a
 * manifest automatically when the storyboard is generated (see
 * `apps/pipeline-worker/src/storyboard-job.ts`); this control has no server
 * eligibility check to honor because the pack catalogue is generally
 * available, not pilot-gated.
 */

import React from "react";
import type { CreativeDesignPackId } from "@avlp/schemas";

export const creativeStylePackOptions: readonly {
  value: CreativeDesignPackId | null;
  label: string;
  description: string;
}[] = [
  {
    value: null,
    label: "Warm editorial (Daylight Standard)",
    description:
      "High-legibility typography, clear hierarchy, and daylight warm accents for visual instruction.",
  },
  {
    value: "essential",
    label: "Essential",
    description:
      "Warm white, ink black, a restrained accent; large typography; isolated objects; generous space. Strongest for science concepts, product explanations, foundational lessons.",
  },
  // Editorial has no licensed photograph library yet (ADR-005). A scene that
  // requires a photo the catalogue can't supply fails explicitly rather than
  // substituting a different design, so the pack stays offered rather than
  // hidden — see the terminal-error path in storyboard-job.ts.
  {
    value: "editorial",
    label: "Editorial",
    description:
      "Charcoal, ivory, restrained amber; bold headlines; photographic crops; annotated evidence. Strongest for history, economics, biographies, persuasive explanations.",
  },
  {
    value: "everyday",
    label: "Everyday",
    description:
      "Cobalt, mint, cream; friendly geometric illustration; relatable objects; clear numerals. Strongest for financial literacy, practical maths, everyday explanations.",
  },
  {
    value: "systems",
    label: "Systems",
    description:
      "Deep ink or pale neutral backgrounds; fine connectors; precise diagrams. Strongest for technology, processes, cause and effect, business models.",
  },
  {
    value: "field-notes",
    label: "Field Notes",
    description:
      "Paper tones, graphite, rust, olive; documentary images; clean annotations. Strongest for biology, geography, discovery, worked explanations.",
  },
  {
    value: "prism",
    label: "Prism",
    description:
      "Saturated colour fields, oversized type, bold geometric cutouts, strong contrast. Strongest for short introductions, revision, younger audiences, memorable recaps.",
  },
];

export function CreativeStylePackSelector({
  value,
  disabled,
  onChange,
}: {
  value: CreativeDesignPackId | null;
  disabled: boolean;
  onChange: (pack: CreativeDesignPackId | null) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Visual theme"
      style={{ display: "flex", flexDirection: "column", gap: "8px" }}
    >
      {creativeStylePackOptions.map((option) => {
        const isSelected = value === option.value;
        return (
          <button
            key={option.value ?? "mvp-default"}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-disabled={disabled}
            disabled={disabled}
            onClick={() => {
              if (!disabled) onChange(option.value);
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
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
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
              }}
            >
              {option.label}
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
  );
}
