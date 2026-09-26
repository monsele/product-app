import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  IllustrationCandidatePanel,
  illustrationConflictMessage,
  illustrationFailureMessage,
  runIllustrationCandidateAction,
} from "./illustration-candidate-panel";

function harness(status: number) {
  const send = vi.fn(async () => ({ ok: status < 400, status }));
  const reload = vi.fn(async () => undefined);
  const onChanged = vi.fn();
  return { send, reload, onChanged };
}

describe("runIllustrationCandidateAction", () => {
  it("refetches the candidates and the storyboard on a 409 and names the conflict", async () => {
    const deps = harness(409);
    const message = await runIllustrationCandidateAction(deps);
    expect(message).toBe(illustrationConflictMessage);
    expect(deps.reload).toHaveBeenCalledTimes(1);
    expect(deps.onChanged).toHaveBeenCalledTimes(1);
    expect(deps.send).toHaveBeenCalledTimes(1);
  });

  it("still notifies the parent on a 409 even when the candidate reload fails", async () => {
    const deps = harness(409);
    deps.reload.mockRejectedValueOnce(new Error("network"));
    const message = await runIllustrationCandidateAction(deps);
    expect(message).toBe(illustrationConflictMessage);
    expect(deps.onChanged).toHaveBeenCalledTimes(1);
  });

  it("keeps the generic message and does not notify the parent on a 500", async () => {
    const deps = harness(500);
    const message = await runIllustrationCandidateAction(deps);
    expect(message).toBe(illustrationFailureMessage);
    expect(deps.onChanged).not.toHaveBeenCalled();
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it("succeeds with a matching revision and notifies the parent once", async () => {
    const deps = harness(200);
    const message = await runIllustrationCandidateAction(deps);
    expect(message).toBeNull();
    expect(deps.reload).toHaveBeenCalledTimes(1);
    expect(deps.onChanged).toHaveBeenCalledTimes(1);
  });

  it("succeeds on the second click after a conflict refreshed the revision", async () => {
    const serverRevision = 1;
    let clientRevision = 0;
    const deps = {
      send: vi.fn(async () =>
        clientRevision === serverRevision
          ? { ok: true, status: 200 }
          : { ok: false, status: 409 },
      ),
      reload: vi.fn(async () => undefined),
      onChanged: vi.fn(() => {
        clientRevision = serverRevision;
      }),
    };
    expect(await runIllustrationCandidateAction(deps)).toBe(
      illustrationConflictMessage,
    );
    expect(await runIllustrationCandidateAction(deps)).toBeNull();
    expect(deps.send).toHaveBeenCalledTimes(2);
  });

  it("reports a network failure without notifying the parent", async () => {
    const deps = harness(200);
    deps.send.mockRejectedValueOnce(new Error("offline"));
    expect(await runIllustrationCandidateAction(deps)).toBe("offline");
    expect(deps.onChanged).not.toHaveBeenCalled();
  });
});

describe("IllustrationCandidatePanel", () => {
  it("shows the bounded generation workflow and AI provenance", () => {
    const html = renderToStaticMarkup(
      <IllustrationCandidatePanel
        projectId="019ffbf1-610e-738a-b087-6775ff97568c"
        sceneId="019ffbf1-610e-738a-b087-6775ff97568d"
        sceneRevision={2}
        storyboardRevision={4}
        slots={["visual-example"]}
        disabled={false}
        onChanged={() => undefined}
      />,
    );
    expect(html).toContain("Generate illustration");
    expect(html).toContain("AI-generated illustrations are private");
    expect(html).toContain("visual-example");
  });
});
