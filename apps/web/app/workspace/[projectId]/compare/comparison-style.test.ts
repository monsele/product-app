import { describe, expect, it } from "vitest";
import { comparisonStyleLabel } from "./comparison-style.js";

describe("comparisonStyleLabel", () => {
  it("uses an explicit accessible label for legacy and registered styles", () => {
    expect(comparisonStyleLabel("mvp-default")).toBe("Legacy default theme");
    expect(comparisonStyleLabel("essential")).toBe("Essential");
    expect(comparisonStyleLabel("editorial")).toBe("Editorial");
    expect(comparisonStyleLabel("everyday")).toBe("Everyday");
  });
});
