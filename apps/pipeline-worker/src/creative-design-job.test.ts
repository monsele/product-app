import { describe, expect, it } from "vitest";
import { unsupportedRequestParts } from "./creative-design-job.js";

describe("creative-design interpretation boundaries", () => {
  it("explains content and paid-asset requests that styling cannot perform", () => {
    expect(
      unsupportedRequestParts(
        "Rewrite the lesson and generate a new illustration for every scene.",
      ),
    ).toEqual([
      "Educational text is not rewritten or removed by design changes.",
      "A design request cannot generate new images or incur an asset-generation charge.",
    ]);
  });

  it("does not label a bounded visual preference as unsupported", () => {
    expect(
      unsupportedRequestParts("Use calmer motion and forest-green accents."),
    ).toEqual([]);
  });
});
