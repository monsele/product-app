import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  IllustrationContactSheet,
  type ContactSheetScene,
} from "./illustration-contact-sheet";

const sceneId = "019ffbf1-eeee-7000-8000-000000000050";

function candidate(
  overrides: Partial<
    ContactSheetScene["slots"][number]["candidates"][number]
  > &
    Pick<
      ContactSheetScene["slots"][number]["candidates"][number],
      "id" | "status"
    >,
): ContactSheetScene["slots"][number]["candidates"][number] {
  return {
    jobId: "019ffbf1-eeee-7000-8000-0000000000aa",
    moderationStatus: "approved",
    provenance: "ai_generated",
    provider: "mock-illustration",
    promptVersion: "v1",
    previewUrl: null,
    altText: `AI illustration for the backdrop slot of scene 1`,
    costUsd: 0.02,
    failureCode: null,
    selectable: false,
    blockedReason: "not_reviewable",
    blockedDetail: null,
    ...overrides,
  };
}

const scenes: readonly ContactSheetScene[] = [
  {
    sceneId,
    order: 1,
    title: "Photosynthesis",
    template: "definition",
    sceneRevision: 4,
    advisories: [
      {
        code: "scene_monotony",
        message:
          'Scenes 1–3 all use the "definition" template. Vary the sequence.',
        source: "deterministic",
        rulesetVersion: "3",
        model: null,
      },
    ],
    slots: [
      {
        slot: "backdrop",
        visualRole: "decorative",
        visualRolePermits:
          "Supports the scene without carrying facts. A generated illustration is a free editorial choice.",
        required: false,
        candidates: [
          candidate({
            id: "cand-review",
            status: "pending_review",
            selectable: true,
            blockedReason: null,
            previewUrl: "https://example.test/preview.png",
          }),
          candidate({ id: "cand-queued", status: "queued" }),
          candidate({ id: "cand-generating", status: "generating" }),
          candidate({
            id: "cand-accepted",
            status: "accepted",
            blockedReason: "already_resolved",
            blockedDetail: "This illustration is already in use on the scene.",
          }),
          candidate({
            id: "cand-rejected",
            status: "rejected",
            blockedReason: "already_resolved",
            blockedDetail: "You discarded this illustration.",
          }),
          candidate({
            id: "cand-failed",
            status: "failed",
            moderationStatus: "rejected",
            failureCode: "ILLUSTRATION_GENERATION_FAILED",
            blockedReason: "generation_failed",
            blockedDetail:
              "Generation did not produce a usable image. Try generating again.",
          }),
          candidate({
            id: "cand-moderated",
            status: "failed",
            moderationStatus: "rejected",
            failureCode: "unsafe_content",
            blockedReason: "moderation_rejected",
            blockedDetail:
              "Automated safety review rejected this image. Generate a new one.",
          }),
          candidate({
            id: "cand-media",
            status: "pending_review",
            moderationStatus: "approved",
            blockedReason: "media_check_failed",
            blockedDetail:
              "This image failed an integrity check and cannot be used. Generate a new one.",
          }),
        ],
      },
    ],
  },
];

describe("IllustrationContactSheet", () => {
  const html = renderToStaticMarkup(
    <IllustrationContactSheet
      scenes={scenes}
      rulesetVersion="3"
      busyCandidateId={null}
      actionError={null}
      onAccept={() => undefined}
      onReject={() => undefined}
    />,
  );

  it("groups candidates by scene and slot with role guidance", () => {
    expect(html).toContain("Scene 1 — Photosynthesis");
    expect(html).toContain("definition template");
    expect(html).toContain("Slot “backdrop”");
    expect(html).toContain("Decorative");
    expect(html).toContain("free editorial choice");
  });

  it("renders every pipeline status label", () => {
    for (const label of [
      "Needs your review",
      "Queued",
      "Generating",
      "In use",
      "Discarded",
      "Failed",
    ])
      expect(html).toContain(label);
  });

  it("labels the advisory as advisory, shows its ruleset version, and does not use error styling", () => {
    expect(html).toContain("<strong>Advisory</strong>");
    expect(html).toContain("ruleset 3");
    expect(html).toContain('role="note"');
    expect(html).toContain("does not block using any candidate");
  });

  it("shows a reason for failed and moderation-rejected candidates rather than an empty tile", () => {
    expect(html).toContain("Generation did not produce a usable image");
    expect(html).toContain("Automated safety review rejected this image");
    expect(html).toContain("(ILLUSTRATION_GENERATION_FAILED)");
  });

  it("states why a candidate failing a deterministic media check is blocked", () => {
    expect(html).toContain("failed an integrity check and cannot be used");
  });

  it("surfaces editable alt text for every candidate", () => {
    expect(html).toContain('for="candidate-cand-review-alt"');
    expect(html).toContain("Alt text");
    expect(html).toContain(
      "AI illustration for the backdrop slot of scene 1",
    );
  });

  it("shows persisted cost, not a recomputed estimate", () => {
    expect(html).toContain("Cost $0.0200");
  });
});
