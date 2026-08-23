"use client";

import React, { useCallback, useEffect, useState, type JSX } from "react";

type Candidate = {
  id: string;
  slot: string;
  assetId: string | null;
  status: string;
  moderationStatus: string;
  provenance: "ai_generated";
  previewUrl: string | null;
};
const apiUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;

/** Explicit, bounded teacher workflow for AI illustration candidates. */
export function IllustrationCandidatePanel({
  projectId,
  sceneId,
  sceneRevision,
  storyboardRevision,
  slots,
  disabled,
  onChanged,
}: {
  projectId: string;
  sceneId: string;
  sceneRevision: number;
  storyboardRevision: number;
  slots: readonly string[];
  disabled: boolean;
  onChanged: () => void;
}): JSX.Element | null {
  const [candidates, setCandidates] = useState<readonly Candidate[]>([]);
  const [slot, setSlot] = useState(slots[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const response = await fetch(
      apiUrl(
        `/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}/illustration-candidates`,
      ),
      { credentials: "include", cache: "no-store" },
    );
    if (response.ok)
      setCandidates(
        ((await response.json()) as { candidates: Candidate[] }).candidates,
      );
  }, [projectId, sceneId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  if (slots.length === 0) return null;
  const act = async (path: string, body: object) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(apiUrl(path), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error("Illustration action failed. Refresh and try again.");
      await reload();
      onChanged();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Illustration action failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="AI illustration candidates">
      <h4>AI illustration</h4>
      <p>
        AI-generated illustrations are private and require your review before
        use.
      </p>
      <label>
        Asset slot{" "}
        <select
          value={slot}
          onChange={(event) => setSlot(event.target.value)}
          disabled={disabled || busy}
        >
          {slots.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>{" "}
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() =>
          void act(
            `/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}/assets/${encodeURIComponent(slot)}/generate`,
            {
              useCase: "conceptual-supporting-illustration",
              expectedSceneRevision: sceneRevision,
              idempotencyKey: globalThis.crypto.randomUUID(),
            },
          )
        }
      >
        Generate illustration
      </button>
      {message !== null ? <p role="alert">{message}</p> : null}
      <ul>
        {candidates.map((candidate) => (
          <li key={candidate.id}>
            <span>
              AI-generated · {candidate.slot} · {candidate.status}
            </span>
            {candidate.previewUrl !== null ? (
              <img
                alt="AI-generated illustration candidate"
                src={candidate.previewUrl}
              />
            ) : null}
            {candidate.status === "pending_review" ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      `/projects/${encodeURIComponent(projectId)}/illustration-candidates/${encodeURIComponent(candidate.id)}/accept`,
                      {
                        expectedSceneRevision: sceneRevision,
                        expectedStoryboardRevision: storyboardRevision,
                      },
                    )
                  }
                >
                  Accept
                </button>{" "}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      `/projects/${encodeURIComponent(projectId)}/illustration-candidates/${encodeURIComponent(candidate.id)}/reject`,
                      {
                        expectedSceneRevision: sceneRevision,
                        expectedStoryboardRevision: storyboardRevision,
                      },
                    )
                  }
                >
                  Reject
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
