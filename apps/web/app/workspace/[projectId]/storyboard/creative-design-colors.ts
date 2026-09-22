import {
  creativeDesignContrastRatio,
  type CreativeDesignManifest,
} from "@avlp/schemas";

type CreativeDesignColors = CreativeDesignManifest["settings"]["colors"];

/** Mirrors the API's colour preflight so invalid drafts never reach Apply. */
export function creativeDesignColorIssues(
  colors: CreativeDesignColors,
): readonly string[] {
  const issues: string[] = [];
  if (creativeDesignContrastRatio(colors.text, colors.background) < 4.5)
    issues.push("Text needs at least 4.5:1 contrast against the background.");
  if (creativeDesignContrastRatio(colors.text, colors.surface) < 4.5)
    issues.push("Text needs at least 4.5:1 contrast against the surface.");
  if (creativeDesignContrastRatio(colors.accent, colors.background) < 3)
    issues.push("Accent needs at least 3:1 contrast against the background.");
  return issues;
}
