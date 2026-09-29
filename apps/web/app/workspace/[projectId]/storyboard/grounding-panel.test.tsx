import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GroundingClaimExplanation } from "./grounding-panel";

describe("grounding claim explanations", () => {
  it("shows the exact flagged phrase and reason as escaped text", () => {
    const html = renderToStaticMarkup(
      <GroundingClaimExplanation
        text="Water <always> boils."
        spans={[
          {
            start: 6,
            end: 14,
            reason: "The source does not establish this for every pressure.",
          },
        ]}
      />,
    );
    expect(html).toContain("&lt;always&gt;");
    expect(html).toContain(
      "The source does not establish this for every pressure.",
    );
    expect(html).toContain("Why this claim was flagged");
  });
});
