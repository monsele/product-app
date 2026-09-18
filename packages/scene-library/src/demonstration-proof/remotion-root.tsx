/**
 * ST-095 — the demonstration proof's own Remotion entry point.
 *
 * Deliberately separate from `src/remotion-root.tsx`. The render worker
 * bundles that production root, and nothing here is added to it: no production
 * composition list, bundle or render identity changes because this proof
 * exists.
 *
 * Four compositions, two per subject. The standard ones are the existing
 * `FullLessonRenderComposition` — the actual production renderer, not a
 * reimplementation of it — fed the same narration, captions and scene
 * boundaries as their demonstration counterparts. That is what makes the
 * comparison a comparison.
 */

import { Composition, registerRoot } from "remotion";
import type { JSX } from "react";
import { videoTheme } from "@avlp/design-system/video-theme";
import { FullLessonRenderComposition } from "../scene-preview-composition.js";
import { getLessonDurationInFrames } from "../full-lesson.js";
import {
  demonstrationCompositionIds,
  demonstrationDurationInFrames,
  DemonstrationRenderComposition,
} from "./composition.js";
import {
  evaporationDemonstrationFixture,
  evaporationStandardFixture,
  savingsDemonstrationFixture,
  savingsStandardFixture,
} from "./fixtures.js";

const canvas = {
  fps: videoTheme.canvas.fps,
  height: videoTheme.canvas.height,
  width: videoTheme.canvas.width,
} as const;

export function DemonstrationProofRoot(): JSX.Element {
  return (
    <>
      <Composition
        {...canvas}
        component={DemonstrationRenderComposition}
        defaultProps={savingsDemonstrationFixture}
        durationInFrames={demonstrationDurationInFrames(
          savingsDemonstrationFixture.scenes,
        )}
        id={demonstrationCompositionIds.savingsDemonstration}
      />
      <Composition
        {...canvas}
        component={FullLessonRenderComposition}
        defaultProps={savingsStandardFixture.props}
        durationInFrames={getLessonDurationInFrames(
          savingsStandardFixture.props.lesson,
        )}
        id={demonstrationCompositionIds.savingsStandard}
      />
      <Composition
        {...canvas}
        component={DemonstrationRenderComposition}
        defaultProps={evaporationDemonstrationFixture}
        durationInFrames={demonstrationDurationInFrames(
          evaporationDemonstrationFixture.scenes,
        )}
        id={demonstrationCompositionIds.evaporationDemonstration}
      />
      <Composition
        {...canvas}
        component={FullLessonRenderComposition}
        defaultProps={evaporationStandardFixture.props}
        durationInFrames={getLessonDurationInFrames(
          evaporationStandardFixture.props.lesson,
        )}
        id={demonstrationCompositionIds.evaporationStandard}
      />
    </>
  );
}

registerRoot(DemonstrationProofRoot);
