import { describe, expect, it, vi } from "vitest";
import {
  ApprovedProviderUnavailableError,
  ProviderEnvelopeViolationError,
  pipelineJobAdapterEnvelopes,
  resolveJobAdapter,
} from "./job-envelope.js";

describe("pipeline job provider envelopes", () => {
  const adapter = { providerId: "fixture", model: "fixture-v1" };

  it("declares and resolves every permitted adapter family", () => {
    for (const [jobType, families] of Object.entries(
      pipelineJobAdapterEnvelopes,
    )) {
      for (const adapterFamily of families) {
        expect(
          resolveJobAdapter({ jobType, adapterFamily, adapter }).adapter,
        ).toBe(adapter);
      }
    }
  });

  it("denies an out-of-envelope adapter before a transport can be called", () => {
    const transport = vi.fn();
    expect(() => {
      const resolved = resolveJobAdapter({
        jobType: "objectives.generate",
        adapterFamily: "illustration",
        adapter,
      });
      transport(resolved.adapter);
    }).toThrow(ProviderEnvelopeViolationError);
    expect(transport).not.toHaveBeenCalled();
  });

  it("fails closed when approved provider or model differs", () => {
    expect(() =>
      resolveJobAdapter({
        jobType: "objectives.generate",
        adapterFamily: "language-model",
        adapter,
        approvedProvider: "approved-provider",
        approvedModel: "approved-model",
      }),
    ).toThrow(ApprovedProviderUnavailableError);
  });
});
