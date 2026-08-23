import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IllustrationCandidatePanel } from "./illustration-candidate-panel";

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
