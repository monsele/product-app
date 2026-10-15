import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  EditThreadMessage,
  EditThreadOperationProgress,
  EditThreadPlan,
  EditThreadResponse,
} from "@avlp/schemas";
import {
  buildEditScope,
  editOperationTitle,
  editScopeLabel,
  editThreadNeedsPolling,
  EditThreadRequestError,
  formatEditValue,
  mergeThreadMessages,
  newlyReadyOperations,
  postPlanAction,
  remainingScenesNote,
} from "./edit-thread-input";
import { EditPlanCard, EditThreadPanel } from "./edit-thread-panel";

const sceneA = "019ffbf1-7777-7000-8000-000000000001";
const sceneB = "019ffbf1-7777-7000-8000-000000000002";
const scenes = [
  { sceneId: sceneA, order: 1, title: "Evaporation" },
  { sceneId: sceneB, order: 3, title: null },
];

const plan: EditThreadPlan = {
  schemaVersion: "edit-plan-v1",
  summary: "Simplify scene 3 and shorten scene 1's title.",
  remainingSceneIds: [],
  expectedRevision: 4,
  narrationSetRevision: null,
  modelCallId: "019ffbf1-9999-7000-8000-000000000001",
  operations: [
    {
      id: "op-1",
      operation: {
        type: "regenerate-scene",
        sceneId: sceneB,
        mode: "simplify",
        rationale: "Uses shorter words for younger learners.",
      },
      display: { sceneOrder: 3, fieldLabel: null, before: null },
    },
    {
      id: "op-2",
      operation: {
        type: "edit-scene-field",
        sceneId: sceneA,
        path: "title",
        value: "Vapour",
        rationale: "A one-word title reads faster.",
      },
      display: { sceneOrder: 1, fieldLabel: "Title", before: "Evaporation" },
    },
  ],
};

function message(overrides: Partial<EditThreadMessage> = {}): EditThreadMessage {
  return {
    id: "019ffbf1-1517-7000-8000-000000000001",
    seq: 2,
    role: "assistant",
    replyToId: "019ffbf1-1516-7000-8000-000000000001",
    text: plan.summary,
    scope: { kind: "lesson", sceneIds: [] },
    status: "proposed",
    plan,
    operations: plan.operations.map(({ id }) => ({
      operationId: id,
      state: "proposed",
      jobId: null,
      candidateId: null,
      errorCode: null,
    })),
    appliedOperationIds: [],
    beforeRevision: 4,
    afterRevision: null,
    failure: null,
    canUndo: false,
    createdAt: "2026-10-15T10:00:00.000Z",
    ...overrides,
  };
}

function card(overrides: Partial<EditThreadMessage> = {}): string {
  return renderToStaticMarkup(
    <EditPlanCard
      message={message(overrides)}
      request={message({ role: "teacher", text: "Make it simpler", status: "sent", plan: null })}
      busy={false}
      disabled={false}
      notice={null}
      selection={undefined}
      onSelectionChange={() => undefined}
      onApply={() => undefined}
      onDismiss={() => undefined}
      onUndo={() => undefined}
      onRetry={() => undefined}
      onReview={() => undefined}
    />,
  );
}

function thread(messages: EditThreadMessage[]): EditThreadResponse {
  return {
    threadId: "019ffbf1-1515-7000-8000-000000000001",
    storyboardRevision: 4,
    turnLimit: { limit: 20, used: 1, remaining: 19 },
    messages,
    earlierCursor: null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ST-115 Ask for changes helpers", () => {
  it("defaults to the selected scene and names the scope in the field label", () => {
    expect(buildEditScope("scene", sceneB, [])).toEqual({ kind: "scene", sceneIds: [sceneB] });
    expect(buildEditScope("scene", null, [])).toBeNull();
    expect(buildEditScope("selected", null, [])).toBeNull();
    expect(buildEditScope("lesson", sceneB, [])).toEqual({ kind: "lesson", sceneIds: [] });
    expect(editScopeLabel({ kind: "scene", sceneIds: [sceneB] }, scenes)).toBe(
      "Describe how to revise scene 3",
    );
    expect(editScopeLabel({ kind: "lesson", sceneIds: [] }, scenes)).toBe(
      "Describe how to revise the whole lesson",
    );
  });

  it("describes operations and diffs in teacher terms", () => {
    expect(editOperationTitle(plan.operations[0]!)).toBe("Scene 3 · Simplify");
    expect(editOperationTitle(plan.operations[1]!)).toBe("Scene 1 · Title");
    expect(formatEditValue(["Heat", "Vapour"])).toBe("Heat / Vapour");
    expect(formatEditValue(null)).toBe("(empty)");
  });

  it("polls only while work is pending and notices candidates that became ready", () => {
    const queued: EditThreadOperationProgress = {
      operationId: "op-1",
      state: "queued",
      jobId: "019ffbf1-1518-7000-8000-000000000001",
      candidateId: null,
      errorCode: null,
    };
    const before = thread([message({ status: "applied", operations: [queued] })]);
    expect(editThreadNeedsPolling(before)).toBe(true);
    const after = thread([message({ status: "applied", operations: [{ ...queued, state: "ready" }] })]);
    expect(editThreadNeedsPolling(after)).toBe(false);
    expect(newlyReadyOperations(before, after)).toHaveLength(1);
    expect(newlyReadyOperations(after, after)).toHaveLength(0);
  });

  it("merges earlier pages with the latest page in thread order, latest read winning", () => {
    const old = message({ id: "019ffbf1-1517-7000-8000-000000000003", seq: 1, status: "applied" });
    const stale = message({ seq: 2, status: "proposed" });
    const fresh = message({ seq: 2, status: "dismissed" });
    const newest = message({ id: "019ffbf1-1517-7000-8000-000000000004", seq: 4 });
    expect(
      mergeThreadMessages([old, stale], [fresh, newest]).map((entry) => [entry.seq, entry.status]),
    ).toEqual([
      [1, "applied"],
      [2, "dismissed"],
      [4, "proposed"],
    ]);
  });

  it("tells the teacher when scenes were left for a follow-up (AC2)", () => {
    expect(remainingScenesNote(message({ plan: { ...plan, remainingSceneIds: [sceneA, sceneB] } }))).toBe(
      "2 more scenes were left for a follow-up request. Ask again to continue.",
    );
    expect(remainingScenesNote(message())).toBeNull();
  });

  it("turns a stale-plan 409 into a re-plan action (AC5)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "edit_conflict",
              message: "The storyboard changed after this plan was made.",
              details: { action: "re-plan", currentRevision: 5 },
              retryable: false,
              correlationId: "019ffbf1-0000-7000-8000-000000000001",
            },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const error = await postPlanAction({
      projectId: "p",
      planId: "x",
      action: "apply",
      body: { expectedRevision: 4 },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EditThreadRequestError);
    expect((error as EditThreadRequestError).replan).toBe(true);
    expect((error as EditThreadRequestError).status).toBe(409);
  });
});

describe("ST-115 plan card states", () => {
  it("shows a proposal with rationale, a field diff and apply all / selected / dismiss", () => {
    const html = card();
    expect(html).toContain("Proposed — nothing has changed yet");
    expect(html).toContain("Uses shorter words for younger learners.");
    expect(html).toMatch(/<del aria-label="Before">Evaporation<\/del>/u);
    expect(html).toMatch(/<ins aria-label="After">Vapour<\/ins>/u);
    expect(html).toContain("Apply all");
    expect(html).toContain("Apply selected (2)");
    expect(html).toContain("Dismiss");
    // Each operation is a labelled checkbox for keyboard selection.
    expect(html.match(/type="checkbox"/gu)).toHaveLength(2);
    expect(html).toMatch(/<label for="[^"]+-op-1">/u);
  });

  it("shows partial application, review hand-off and undo", () => {
    const html = card({
      status: "partly_applied",
      canUndo: true,
      appliedOperationIds: ["op-1"],
      operations: [
        {
          operationId: "op-1",
          state: "ready",
          jobId: "019ffbf1-1518-7000-8000-000000000001",
          candidateId: "019ffbf1-1519-7000-8000-000000000001",
          errorCode: null,
        },
        { operationId: "op-2", state: "skipped", jobId: null, candidateId: null, errorCode: null },
      ],
    });
    expect(html).toContain("Partly applied");
    expect(html).toContain("Ready to review");
    expect(html).toContain("Review scene 3");
    expect(html).toContain("Not applied");
    expect(html).toContain("Undo this change");
    expect(html).not.toContain("Apply all");
  });

  it("shows planning, a failure with retry, and an answer without actions", () => {
    expect(card({ status: "planning", plan: null })).toContain("Planning your change…");
    const failed = card({
      status: "failed",
      plan: null,
      failure: { code: "EDIT_PLAN_INVALID", message: "We couldn't plan that change." },
    });
    expect(failed).toContain("We couldn&#x27;t plan that change.");
    expect(failed).toContain("Try again");
    const answered = card({
      status: "answered",
      plan: {
        ...plan,
        operations: [
          {
            id: "op-1",
            operation: {
              type: "answer-only",
              answer: "Scene 4 can't be 8 s: its narration measures 14 s. Shorten the narration instead?",
            },
            display: { sceneOrder: null, fieldLabel: null, before: null },
          },
        ],
      },
    });
    expect(answered).toContain("its narration measures 14 s");
    expect(answered).not.toContain("Apply all");
  });

  it("renders the panel with a scoped, labelled field and keyboard hint", () => {
    const html = renderToStaticMarkup(
      <EditThreadPanel
        projectId="019ffbf1-a000-7000-8000-000000000001"
        revision={4}
        scenes={scenes}
        selectedSceneId={sceneB}
        disabled={false}
        onSelectScene={() => undefined}
        onScenePending={() => undefined}
        onStoryboardChanged={() => undefined}
      />,
    );
    expect(html).toContain("Ask for changes");
    expect(html).toMatch(/<label for="[^"]+"[^>]*>Describe how to revise scene 3<\/label>/u);
    expect(html).toContain("<legend>Scope</legend>");
    expect(html).toContain("Press Ctrl+Enter to send.");
    expect(html).toContain('aria-live="polite"');
  });
});
