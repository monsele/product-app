import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceVisualPicker } from "./source-visual-picker";

describe("SourceVisualPicker", () => {
  it("renders the Figures/Tables tabs, search input, and a loading state before data arrives", () => {
    const html = renderToStaticMarkup(
      <SourceVisualPicker
        projectId="019ffbf1-610e-738a-b087-6775ff97568c"
        disabled={false}
        selectedId=""
        slot="diagram"
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("Source visuals: diagram");
    expect(html).toContain('data-testid="source-visual-view-figures-diagram"');
    expect(html).toContain('data-testid="source-visual-view-tables-diagram"');
    expect(html).toContain(
      'aria-label="Search source visuals: diagram"',
    );
    expect(html).toContain("Loading source visuals");
  });

  it("disables the fieldset when the slot is not editable", () => {
    const html = renderToStaticMarkup(
      <SourceVisualPicker
        projectId="019ffbf1-610e-738a-b087-6775ff97568c"
        disabled
        selectedId=""
        slot="diagram"
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("disabled=\"\"");
  });
});
