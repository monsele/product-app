import { describe, expect, it } from "vitest";
import { defaultCreativeDesignSettings } from "@avlp/schemas";
import { creativeDesignColorIssues } from "./creative-design-colors";

describe("creativeDesignColorIssues", () => {
  it("accepts the registered default palette", () => {
    expect(creativeDesignColorIssues(defaultCreativeDesignSettings.colors)).toEqual(
      [],
    );
  });

  it("reports text that cannot be read on the surface", () => {
    expect(
      creativeDesignColorIssues({
        ...defaultCreativeDesignSettings.colors,
        text: "#ffffff",
      }),
    ).toContain("Text needs at least 4.5:1 contrast against the surface.");
  });
});
