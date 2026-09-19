import type { DemonstrationComparisonView } from "@avlp/schemas/demonstration-pilot";

export function comparisonStyleLabel(
  themeId: DemonstrationComparisonView["themeId"],
): string {
  return themeId === "mvp-default" ? "MVP default" : themeId;
}
