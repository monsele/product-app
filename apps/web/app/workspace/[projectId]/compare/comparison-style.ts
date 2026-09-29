import { creativeDesignStyleLabel } from "@avlp/schemas";
import type { DemonstrationComparisonView } from "@avlp/schemas/demonstration-pilot";

/** The style's human-readable name; only a legacy (`mvp-default`) version is "Legacy default theme". */
export function comparisonStyleLabel(
  themeId: DemonstrationComparisonView["themeId"],
): string {
  return creativeDesignStyleLabel(themeId === "mvp-default" ? null : { pack: { id: themeId } });
}
