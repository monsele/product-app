"use client";

/**
 * ST-096 — the comparison workspace.
 *
 * Two videos of the same lesson, side by side, with the controls that make the
 * comparison mean something:
 *
 * - **Matched navigation.** Scene selection and the playhead are held in this
 *   component, not in either player, and both players are seeked from the same
 *   number. Switching which one you are watching therefore preserves the scene
 *   and the position within it, because there is only one position.
 *
 * - **One voice at a time.** Only the focused approach is unmuted. Two players
 *   talking over each other would make the thing being judged — whether the
 *   pictures match the words — impossible to judge.
 *
 * - **Truthful state.** Queued, generating, ready, failed and stale are the
 *   server's words, shown as they are. A variant that failed says so and offers
 *   a retry that touches only itself.
 *
 * - **Nothing is produced by accident.** Creating the second variant is an
 *   explicit action behind a confirmation that names which approach will be
 *   produced, that the approved narration and captions are reused rather than
 *   regenerated, and that a render will be spent.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  demonstrationComparisonListSchema,
  demonstrationFeedbackViewSchema,
  demonstrationRatingScale,
  demonstrationPreferenceValues,
  type DemonstrationComparisonView,
  type DemonstrationFeedbackView,
  type DemonstrationVariantView,
} from "@avlp/schemas/demonstration-pilot";
import type { VideoApproach } from "@avlp/schemas";

const fps = 30;

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

function errorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  )
    return payload.error.message;
  return fallback;
}

const approachLabels: Record<VideoApproach, string> = {
  standard: "Standard explanation",
  demonstration: "Demonstration-led explanation",
};

const statusLabels: Record<DemonstrationVariantView["status"], string> = {
  pending: "Not produced yet",
  queued: "Queued",
  generating: "Rendering",
  ready: "Ready",
  failed: "Failed",
  stale: "Out of date",
};

function VariantPlayer({
  projectId,
  variant,
  focused,
  onFocus,
  onTime,
  registerElement,
}: {
  projectId: string;
  variant: DemonstrationVariantView;
  focused: boolean;
  onFocus: () => void;
  onTime: (seconds: number) => void;
  registerElement: (element: HTMLVideoElement | null) => void;
}) {
  const source =
    variant.videoAvailable && variant.renderId !== null
      ? apiUrl(
          `/projects/${encodeURIComponent(projectId)}/renders/${encodeURIComponent(variant.renderId)}/download`,
        )
      : null;

  return (
    <div
      style={{
        border: focused
          ? "1.5px solid var(--color-brand)"
          : "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        backgroundColor: "var(--color-surface)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: focused ? "var(--color-brand)" : "var(--color-text)",
          }}
        >
          {approachLabels[variant.approach]}
        </span>
        <span
          style={{ fontSize: "11px", color: "var(--color-text-muted)" }}
          data-variant-status={variant.status}
        >
          {statusLabels[variant.status]}
          {variant.status === "generating" &&
            ` · ${Math.round(variant.progress * 100)}%`}
        </span>
      </div>
      {source === null ? (
        <div
          style={{
            aspectRatio: "16 / 9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            textAlign: "center",
            fontSize: "12px",
            color: "var(--color-text-muted)",
            backgroundColor: "var(--color-surface-subtle)",
          }}
        >
          {variant.errorMessage ??
            (variant.status === "pending"
              ? "This approach has not been produced yet."
              : "This video is still being produced.")}
        </div>
      ) : (
        <video
          aria-label={`${approachLabels[variant.approach]} video`}
          controls
          data-approach={variant.approach}
          muted={!focused}
          onPlay={onFocus}
          onTimeUpdate={(event) => {
            if (focused) onTime(event.currentTarget.currentTime);
          }}
          preload="metadata"
          ref={registerElement}
          src={source}
          style={{ width: "100%", display: "block", backgroundColor: "#000" }}
        />
      )}
    </div>
  );
}

export function ComparisonWorkspace({ projectId }: { projectId: string }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "failed"; message: string }
    | {
        kind: "ready";
        comparisons: readonly DemonstrationComparisonView[];
        eligible: boolean;
        reasons: readonly { message: string; suggestedCorrection: string }[];
      }
  >({ kind: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focused, setFocused] = useState<VideoApproach>("standard");
  const [sceneIndex, setSceneIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<DemonstrationFeedbackView | null>(
    null,
  );
  const players = useRef(new Map<VideoApproach, HTMLVideoElement>());
  const playhead = useRef(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        apiUrl(
          `/projects/${encodeURIComponent(projectId)}/demonstration-comparisons`,
        ),
        { credentials: "include", cache: "no-store" },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          errorMessage(payload, "Comparisons could not be loaded."),
        );
      const parsed = demonstrationComparisonListSchema.parse(payload);
      setState({
        comparisons: parsed.comparisons,
        eligible: parsed.eligibility.selectable,
        kind: "ready",
        reasons: parsed.eligibility.reasons,
      });
      setSelectedId((current) => current ?? parsed.comparisons[0]?.id ?? null);
    } catch (error) {
      setState({
        kind: "failed",
        message:
          error instanceof Error
            ? error.message
            : "Comparisons could not be loaded.",
      });
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () =>
      state.kind === "ready"
        ? (state.comparisons.find((entry) => entry.id === selectedId) ?? null)
        : null,
    [selectedId, state],
  );

  // A comparison with work in flight is polled; one that is settled is not.
  // Polling a finished pair would be noise, and the states that matter here
  // change on the server rather than in this tab.
  const inFlight =
    selected?.variants.some(
      (variant) => variant.status === "queued" || variant.status === "generating",
    ) ?? false;
  useEffect(() => {
    if (!inFlight) return undefined;
    const timer = window.setInterval(() => {
      void load();
    }, 4_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [inFlight, load]);

  useEffect(() => {
    if (selected === null) {
      setFeedback(null);
      return;
    }
    void fetch(
      apiUrl(
        `/projects/${encodeURIComponent(projectId)}/demonstration-comparisons/${encodeURIComponent(selected.id)}/feedback`,
      ),
      { credentials: "include", cache: "no-store" },
    )
      .then(async (response) =>
        response.ok ? ((await response.json()) as unknown) : null,
      )
      .then((payload) => {
        const parsed = demonstrationFeedbackViewSchema.safeParse(payload);
        setFeedback(parsed.success ? parsed.data : null);
      })
      .catch(() => {
        setFeedback(null);
      });
  }, [projectId, selected]);

  /** Seeks every mounted player to the same absolute second. */
  const seekAll = useCallback((seconds: number) => {
    playhead.current = seconds;
    for (const element of players.current.values())
      if (Number.isFinite(element.duration))
        element.currentTime = Math.min(seconds, element.duration);
      else element.currentTime = seconds;
  }, []);

  const post = useCallback(
    async (path: string, body: unknown) => {
      setBusy(true);
      setActionError(null);
      try {
        const response = await fetch(apiUrl(path), {
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          cache: "no-store",
          credentials: "include",
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(errorMessage(payload, "That action did not succeed."));
        await load();
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "That action did not succeed.",
        );
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (state.kind === "loading")
    return <p style={{ padding: "24px" }}>Loading comparisons…</p>;
  if (state.kind === "failed")
    return (
      <p role="alert" style={{ padding: "24px", color: "var(--color-error-fg)" }}>
        {state.message}
      </p>
    );

  const missing =
    selected?.variants.find((variant) => variant.status === "pending") ?? null;
  const feedbackReady =
    selected !== null &&
    selected.controlled &&
    selected.variants.length === 2 &&
    selected.variants.every(
      (variant) => variant.status === "ready" && variant.videoAvailable,
    );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        padding: "24px",
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>
          Compare video approaches
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            color: "var(--color-text-muted)",
            maxWidth: "72ch",
          }}
        >
          Both videos use the same approved content, narration recording,
          captions, scene boundaries and visual theme. Only the way the pictures
          explain the lesson differs. Your responses are qualitative pilot
          evidence, not a measurement of learning.
        </p>
      </header>

      {state.comparisons.length === 0 && (
        <section
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-card)",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>
            No comparison yet
          </h2>
          {state.eligible ? (
            <>
              <p style={{ margin: 0, fontSize: "13px" }}>
                Creating a comparison produces the demonstration-led video from
                the lesson version you have already approved. Its narration
                audio and captions are reused exactly as they are — nothing is
                regenerated and no new narration is synthesised. One render is
                used.
              </p>
              <div>
                <CreateComparisonButton
                  busy={busy}
                  onCreate={(lessonVersionId) =>
                    post(
                      `/projects/${encodeURIComponent(projectId)}/demonstration-comparisons`,
                      { approach: "demonstration", lessonVersionId },
                    )
                  }
                  projectId={projectId}
                />
              </div>
            </>
          ) : (
            <ul
              style={{
                margin: 0,
                paddingLeft: "18px",
                fontSize: "13px",
                color: "var(--color-text-muted)",
              }}
            >
              {state.reasons.map((reason, index) => (
                <li key={index}>
                  <strong style={{ color: "var(--color-text)" }}>
                    {reason.message}
                  </strong>{" "}
                  {reason.suggestedCorrection}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {selected !== null && (
        <>
          {!selected.controlled && selected.uncontrolledReason !== null && (
            <p
              role="status"
              style={{
                margin: 0,
                padding: "12px 14px",
                fontSize: "12px",
                borderRadius: "var(--radius-control)",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface-subtle)",
              }}
            >
              {selected.uncontrolledReason}
            </p>
          )}

          <nav
            aria-label="Scene navigation"
            style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
          >
            {selected.scenes.map((scene, index) => (
              <button
                aria-current={index === sceneIndex}
                key={scene.sceneId}
                onClick={() => {
                  setSceneIndex(index);
                  seekAll(scene.startFrame / fps);
                }}
                style={{
                  padding: "6px 10px",
                  fontSize: "12px",
                  borderRadius: "var(--radius-control)",
                  border:
                    index === sceneIndex
                      ? "1.5px solid var(--color-brand)"
                      : "1px solid var(--color-border)",
                  backgroundColor:
                    index === sceneIndex
                      ? "var(--color-surface-brand)"
                      : "var(--color-surface)",
                  cursor: "pointer",
                }}
                type="button"
              >
                {scene.order}. {scene.title}
              </button>
            ))}
          </nav>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "16px",
            }}
          >
            {selected.variants.map((variant) => (
              <VariantPlayer
                focused={focused === variant.approach}
                key={variant.id}
                onFocus={() => {
                  setFocused(variant.approach);
                }}
                onTime={(seconds) => {
                  playhead.current = seconds;
                }}
                projectId={projectId}
                registerElement={(element) => {
                  if (element === null) players.current.delete(variant.approach);
                  else players.current.set(variant.approach, element);
                }}
                variant={variant}
              />
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {selected.variants.map((variant) => (
              <button
                aria-pressed={focused === variant.approach}
                key={`focus-${variant.id}`}
                onClick={() => {
                  // Switching which approach you are listening to keeps the
                  // position: the other player is seeked to where this one was
                  // before it takes over the audio.
                  setFocused(variant.approach);
                  seekAll(playhead.current);
                }}
                style={{
                  padding: "8px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "var(--radius-control)",
                  border:
                    focused === variant.approach
                      ? "1.5px solid var(--color-brand)"
                      : "1px solid var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  cursor: "pointer",
                }}
                type="button"
              >
                Listen to {approachLabels[variant.approach]}
              </button>
            ))}
            {selected.variants
              .filter((variant) => variant.status === "failed")
              .map((variant) => (
                <button
                  disabled={busy}
                  key={`retry-${variant.id}`}
                  onClick={() => {
                    void post(
                      `/projects/${encodeURIComponent(projectId)}/demonstration-comparisons/${encodeURIComponent(selected.id)}/variants/${encodeURIComponent(variant.id)}/retry`,
                      undefined,
                    );
                  }}
                  style={{
                    padding: "8px 12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    borderRadius: "var(--radius-control)",
                    border: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                    cursor: "pointer",
                  }}
                  type="button"
                >
                  Retry {approachLabels[variant.approach]}
                </button>
              ))}
            {missing !== null && (
              <button
                disabled={busy}
                onClick={() => {
                  void post(
                    `/projects/${encodeURIComponent(projectId)}/demonstration-comparisons/${encodeURIComponent(selected.id)}/variants`,
                    { approach: missing.approach },
                  );
                }}
                style={{
                  padding: "8px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "var(--radius-control)",
                  border: "1.5px solid var(--color-brand)",
                  backgroundColor: "var(--color-surface-brand)",
                  color: "var(--color-brand)",
                  cursor: "pointer",
                }}
                type="button"
              >
                Create comparison version ({approachLabels[missing.approach]})
              </button>
            )}
          </div>

          {actionError !== null && (
            <p role="alert" style={{ color: "var(--color-error-fg)", fontSize: "13px" }}>
              {actionError}
            </p>
          )}

          {feedbackReady ? (
            <FeedbackForm
              comparisonId={selected.id}
              current={feedback}
              onSaved={setFeedback}
              projectId={projectId}
            />
          ) : (
            <p
              role="status"
              style={{ margin: 0, fontSize: "13px", color: "var(--color-text-muted)" }}
            >
              Feedback becomes available when both controlled outputs are ready.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Picks the lesson version to compare from.
 *
 * The server defaults to the latest saved version, and this control exists so
 * that choice is stated rather than assumed: the tester sees which version the
 * pair will be built from before a render is spent on it.
 */
function CreateComparisonButton({
  busy,
  onCreate,
  projectId,
}: {
  busy: boolean;
  onCreate: (lessonVersionId: string) => Promise<void>;
  projectId: string;
}) {
  const [versionId, setVersionId] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    void fetch(apiUrl(`/projects/${encodeURIComponent(projectId)}/versions`), {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) =>
        response.ok ? ((await response.json()) as unknown) : null,
      )
      .then((payload) => {
        const versions = (payload as { versions?: unknown })?.versions;
        if (!Array.isArray(versions) || versions.length === 0) return;
        const latest = versions[0] as { id?: unknown; versionNumber?: unknown };
        if (typeof latest.id === "string") {
          setVersionId(latest.id);
          setLabel(
            typeof latest.versionNumber === "number"
              ? `version ${latest.versionNumber}`
              : "the latest saved version",
          );
        }
      })
      .catch(() => {
        setVersionId(null);
      });
  }, [projectId]);

  if (versionId === null)
    return (
      <p style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
        Save a lesson version and run preflight before creating a comparison.
      </p>
    );

  return (
    <button
      disabled={busy}
      onClick={() => {
        void onCreate(versionId);
      }}
      style={{
        padding: "10px 14px",
        fontSize: "13px",
        fontWeight: 600,
        borderRadius: "var(--radius-control)",
        border: "1.5px solid var(--color-brand)",
        backgroundColor: "var(--color-surface-brand)",
        color: "var(--color-brand)",
        cursor: busy ? "progress" : "pointer",
      }}
      type="button"
    >
      Create comparison from {label ?? "the latest saved version"}
    </button>
  );
}

function RatingRow({
  approach,
  disabled,
  onChange,
  value,
}: {
  approach: VideoApproach;
  disabled: boolean;
  onChange: (
    field: "clarity" | "engagement" | "narrationSync",
    rating: number,
  ) => void;
  value: {
    clarity: number | null;
    engagement: number | null;
    narrationSync: number | null;
  };
}) {
  const fields = [
    { key: "clarity" as const, scale: demonstrationRatingScale.clarity },
    { key: "engagement" as const, scale: demonstrationRatingScale.engagement },
    {
      key: "narrationSync" as const,
      scale: demonstrationRatingScale.narrationSync,
    },
  ];
  return (
    <fieldset
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-control)",
        padding: "12px",
        margin: 0,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <legend style={{ fontSize: "13px", fontWeight: 600, padding: "0 6px" }}>
        {approachLabels[approach]}
      </legend>
      {fields.map((field) => (
        <div key={field.key}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 500,
              marginBottom: "4px",
            }}
          >
            {field.scale.label}
          </div>
          <div
            aria-label={`${approachLabels[approach]} ${field.scale.label}`}
            role="radiogroup"
            style={{ display: "flex", gap: "6px" }}
          >
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                aria-checked={value[field.key] === rating}
                disabled={disabled}
                key={rating}
                onClick={() => {
                  onChange(field.key, rating);
                }}
                role="radio"
                style={{
                  width: "32px",
                  height: "32px",
                  fontSize: "12px",
                  borderRadius: "var(--radius-control)",
                  border:
                    value[field.key] === rating
                      ? "1.5px solid var(--color-brand)"
                      : "1px solid var(--color-border)",
                  backgroundColor:
                    value[field.key] === rating
                      ? "var(--color-surface-brand)"
                      : "var(--color-surface)",
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
                type="button"
              >
                {rating}
              </button>
            ))}
          </div>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: "11px",
              color: "var(--color-text-muted)",
            }}
          >
            {field.scale.low} · {field.scale.high}
          </p>
        </div>
      ))}
    </fieldset>
  );
}

function FeedbackForm({
  comparisonId,
  current,
  onSaved,
  projectId,
}: {
  comparisonId: string;
  current: DemonstrationFeedbackView | null;
  onSaved: (view: DemonstrationFeedbackView) => void;
  projectId: string;
}) {
  const [ratings, setRatings] = useState<
    Record<
      VideoApproach,
      { clarity: number | null; engagement: number | null; narrationSync: number | null }
    >
  >({
    demonstration: { clarity: null, engagement: null, narrationSync: null },
    standard: { clarity: null, engagement: null, narrationSync: null },
  });
  const [preference, setPreference] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (current === null) return;
    setRatings((previous) => {
      const next = { ...previous };
      for (const entry of current.ratings)
        next[entry.approach] = {
          clarity: entry.clarity,
          engagement: entry.engagement,
          narrationSync: entry.narrationSync,
        };
      return next;
    });
    setPreference(current.preference);
    setComment(current.comment ?? "");
  }, [current]);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>
        Your response
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "12px",
        }}
      >
        {(["standard", "demonstration"] as const).map((approach) => (
          <RatingRow
            approach={approach}
            disabled={saving}
            key={approach}
            onChange={(field, rating) => {
              setRatings((previous) => ({
                ...previous,
                [approach]: { ...previous[approach], [field]: rating },
              }));
            }}
            value={ratings[approach]}
          />
        ))}
      </div>

      <div role="radiogroup" aria-label="Overall preference">
        <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
          Which explained the lesson better?
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {demonstrationPreferenceValues.map((value) => (
            <button
              aria-checked={preference === value}
              key={value}
              onClick={() => {
                setPreference(value);
              }}
              role="radio"
              style={{
                padding: "8px 12px",
                fontSize: "12px",
                borderRadius: "var(--radius-control)",
                border:
                  preference === value
                    ? "1.5px solid var(--color-brand)"
                    : "1px solid var(--color-border)",
                backgroundColor:
                  preference === value
                    ? "var(--color-surface-brand)"
                    : "var(--color-surface)",
                cursor: "pointer",
              }}
              type="button"
            >
              {value === "no_preference"
                ? "No preference"
                : approachLabels[value]}
            </button>
          ))}
        </div>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600 }}>
          Anything else worth recording?
        </span>
        <textarea
          maxLength={4000}
          onChange={(event) => {
            setComment(event.target.value);
          }}
          rows={4}
          style={{
            padding: "10px",
            fontSize: "13px",
            borderRadius: "var(--radius-control)",
            border: "1px solid var(--color-border)",
            resize: "vertical",
          }}
          value={comment}
        />
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          disabled={saving}
          onClick={() => {
            setSaving(true);
            setMessage(null);
            void fetch(
              apiUrl(
                `/projects/${encodeURIComponent(projectId)}/demonstration-comparisons/${encodeURIComponent(comparisonId)}/feedback`,
              ),
              {
                body: JSON.stringify({
                  comment: comment.trim().length === 0 ? null : comment.trim(),
                  expectedRevision: current?.revision ?? 0,
                  preference,
                  ratings: (["standard", "demonstration"] as const).map(
                    (approach) => ({ approach, ...ratings[approach] }),
                  ),
                }),
                cache: "no-store",
                credentials: "include",
                headers: { "content-type": "application/json" },
                method: "PUT",
              },
            )
              .then(async (response) => {
                const payload: unknown = await response.json().catch(() => null);
                if (!response.ok)
                  throw new Error(
                    errorMessage(payload, "Your response was not saved."),
                  );
                onSaved(demonstrationFeedbackViewSchema.parse(payload));
                setMessage("Saved.");
              })
              .catch((error: unknown) => {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Your response was not saved.",
                );
              })
              .finally(() => {
                setSaving(false);
              });
          }}
          style={{
            padding: "10px 16px",
            fontSize: "13px",
            fontWeight: 600,
            borderRadius: "var(--radius-control)",
            border: "1.5px solid var(--color-brand)",
            backgroundColor: "var(--color-surface-brand)",
            color: "var(--color-brand)",
            cursor: saving ? "progress" : "pointer",
          }}
          type="button"
        >
          {saving ? "Saving…" : "Save response"}
        </button>
        {message !== null && (
          <span role="status" style={{ fontSize: "12px" }}>
            {message}
          </span>
        )}
      </div>
    </section>
  );
}
