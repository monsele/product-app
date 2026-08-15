import { describe, expect, it } from "vitest";
import { buildSectionUpdateInput } from "./source-section-controls";

describe("source section controls", () => {
  const current = {
    revision: 3,
    included: true,
    displayHeading: null,
  };

  it("builds an include update carrying the current revision", () => {
    expect(buildSectionUpdateInput(current, { kind: "include" })).toEqual({
      revision: 3,
      included: true,
    });
  });

  it("builds an exclude update carrying the current revision", () => {
    expect(buildSectionUpdateInput(current, { kind: "exclude" })).toEqual({
      revision: 3,
      included: false,
    });
  });

  it("builds a rename update with the replacement heading", () => {
    expect(
      buildSectionUpdateInput(current, {
        kind: "rename",
        heading: "Core concepts",
      }),
    ).toEqual({ revision: 3, displayHeading: "Core concepts" });
  });

  it("restores original heading and included status", () => {
    expect(
      buildSectionUpdateInput(
        { revision: 3, included: false, displayHeading: "Renamed" },
        { kind: "restore" },
      ),
    ).toEqual({
      revision: 3,
      included: true,
      displayHeading: null,
      reviewOrder: null,
    });
  });

  it("uses revision 0 for a section that has no overlay yet", () => {
    expect(
      buildSectionUpdateInput(
        { revision: 0, included: true, displayHeading: null },
        { kind: "exclude" },
      ),
    ).toEqual({ revision: 0, included: false });
  });
});
