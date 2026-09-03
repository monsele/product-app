"use client";

import React, { useCallback, useEffect, useState, type JSX } from "react";
import { illustrationContactSheetResponseSchema } from "@avlp/schemas";
import { fetchStoryboardSceneList } from "../storyboard-scene-query";
import {
  IllustrationContactSheet,
  type ContactSheetDecision,
  type ContactSheetScene,
} from "./illustration-contact-sheet";

const apiUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      scenes: readonly ContactSheetScene[];
      rulesetVersion: string | null;
      storyboardRevision: number;
    };

/**
 * ST-089 client shell for the illustration contact sheet. Owns fetching the
 * grouped read model and the current storyboard revision, and routes accept /
 * discard through the existing per-scene candidate commands.
 */
export function IllustrationContactSheetView({
  projectId,
}: {
  projectId: string;
}): JSX.Element {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [sheetResponse, sceneList] = await Promise.all([
        fetch(
          apiUrl(
            `/projects/${encodeURIComponent(projectId)}/illustration-candidates`,
          ),
          { credentials: "include", cache: "no-store" },
        ),
        fetchStoryboardSceneList(projectId),
      ]);
      if (!sheetResponse.ok) throw new Error("contact-sheet");
      const parsed = illustrationContactSheetResponseSchema.safeParse(
        await sheetResponse.json(),
      );
      if (!parsed.success) throw new Error("contact-sheet");
      setState({
        kind: "ready",
        scenes: parsed.data.scenes,
        rulesetVersion: parsed.data.rulesetVersion,
        storyboardRevision: sceneList.revision,
      });
    } catch {
      setState({
        kind: "error",
        message:
          "The candidate review could not be loaded. Refresh to try again.",
      });
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Generation runs on a worker; poll while anything is still in flight so a
  // queued candidate becomes reviewable without a manual refresh.
  const awaitingResult =
    state.kind === "ready" &&
    state.scenes.some((scene) =>
      scene.slots.some((slot) =>
        slot.candidates.some(
          (candidate) =>
            candidate.status === "queued" ||
            candidate.status === "generating",
        ),
      ),
    );
  useEffect(() => {
    if (!awaitingResult) return;
    const timer = window.setInterval(() => void load(), 4_000);
    return () => window.clearInterval(timer);
  }, [awaitingResult, load]);

  const decide = useCallback(
    async (action: "accept" | "reject", decision: ContactSheetDecision) => {
      if (state.kind !== "ready") return;
      setBusyCandidateId(decision.candidateId);
      setActionError(null);
      try {
        const response = await fetch(
          apiUrl(
            `/projects/${encodeURIComponent(projectId)}/illustration-candidates/${encodeURIComponent(decision.candidateId)}/${action}`,
          ),
          {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              expectedSceneRevision: decision.sceneRevision,
              expectedStoryboardRevision: state.storyboardRevision,
            }),
          },
        );
        if (!response.ok) {
          setActionError(
            response.status === 409
              ? "This scene changed since the sheet loaded. Refreshing the candidates."
              : "That action could not be completed. Refresh and try again.",
          );
        }
      } catch {
        setActionError("That action could not be completed. Check your connection.");
      } finally {
        // Reload before re-enabling the controls so a second click cannot land
        // on the now-stale card while the refetch is in flight.
        await load();
        setBusyCandidateId(null);
      }
    },
    [projectId, state, load],
  );

  if (state.kind === "loading") {
    return (
      <p style={{ color: "var(--color-text-muted, #BDB5C7)", fontSize: "14px" }}>
        Loading illustration candidates…
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <p
        role="alert"
        style={{
          padding: "12px 16px",
          borderRadius: "10px",
          border: "1px solid #B42318",
          backgroundColor: "#FFF5F4",
          color: "#B42318",
          fontSize: "13px",
        }}
      >
        {state.message}
      </p>
    );
  }

  return (
    <IllustrationContactSheet
      scenes={state.scenes}
      rulesetVersion={state.rulesetVersion}
      busyCandidateId={busyCandidateId}
      actionError={actionError}
      onAccept={(decision) => void decide("accept", decision)}
      onReject={(decision) => void decide("reject", decision)}
    />
  );
}
