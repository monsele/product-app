import { describe, expect, it } from "vitest";
import { buildFigureUpdateInput } from "./source-figure-controls";

describe("source figure controls", () => {
  const current = {
    revision: 2,
    included: true,
  };

  it("builds an exclude update carrying the current revision", () => {
    expect(buildFigureUpdateInput(current, { kind: "exclude" })).toEqual({
      revision: 2,
      included: false,
    });
  });

  it("restores an excluded figure carrying the overlay revision", () => {
    expect(
      buildFigureUpdateInput(
        { revision: 3, included: false },
        { kind: "restore" },
      ),
    ).toEqual({ revision: 3, included: true });
  });

  it("uses revision 0 for a figure that has no overlay yet", () => {
    expect(
      buildFigureUpdateInput(
        { revision: 0, included: true },
        { kind: "exclude" },
      ),
    ).toEqual({ revision: 0, included: false });
  });
});
