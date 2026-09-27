import { describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import { requestActor } from "./audit-actor.js";

const ownerUserId = "019ffc50-aaaa-7000-8000-000000000105" as Identifier;
const runId = "019ffc50-bbbb-7000-8000-000000000105" as Identifier;

describe("audit actor", () => {
  it("names the owner for their own request and the run for an automatic one", () => {
    expect(requestActor({ ownerUserId })).toEqual({ type: "user", userId: ownerUserId });
    expect(requestActor({ ownerUserId, oneShotRunId: undefined })).toEqual({
      type: "user",
      userId: ownerUserId,
    });
    expect(requestActor({ ownerUserId, oneShotRunId: runId })).toEqual({
      type: "one_shot_run",
      runId,
      userId: ownerUserId,
    });
  });
});
