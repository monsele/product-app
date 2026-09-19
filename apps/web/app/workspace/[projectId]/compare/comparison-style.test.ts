import { describe, expect, it } from "vitest";
import { comparisonStyleLabel } from "./comparison-style.js";

describe("comparisonStyleLabel", () => {
  it("uses an explicit accessible label for legacy and registered styles", () => {
    expect(comparisonStyleLabel("mvp-default")).toBe("MVP default");
    expect(comparisonStyleLabel("essential")).toBe("essential");
    expect(comparisonStyleLabel("editorial")).toBe("editorial");
    expect(comparisonStyleLabel("everyday")).toBe("everyday");
  });
});
