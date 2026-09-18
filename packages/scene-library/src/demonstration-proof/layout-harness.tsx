/**
 * ST-095 — browser harness for the layout preflight and the parity comparison.
 *
 * It mounts the composition at a fixed frame, outside a Remotion `Player`, so
 * the preflight measures a deterministic still rather than racing playback.
 * Font readiness is awaited explicitly, because `delayRender` has no renderer
 * to hold when the component is mounted directly.
 *
 * Measuring in a real browser is the point: `measureText` cannot run in Node,
 * so a Node-side estimate of whether a balance readout overlaps the caption
 * band would be a false assurance rather than a shortcut.
 */

import { createRoot, type Root } from "react-dom/client";
import { createElement, type JSX } from "react";
import { videoTheme } from "@avlp/design-system/video-theme";
import {
  DemonstrationCaptionAtFrame,
  DemonstrationSceneAtFrame,
  demonstrationTimeline,
  prepareDemonstrationComposition,
} from "./composition.js";
import { compileDemonstrationPlan } from "./state.js";
import { waitForDemonstrationFonts } from "./fonts.js";

let root: Root | undefined;

function mountPoint(): Root {
  const host = document.getElementById("root");
  if (host === null) throw new Error("Missing #root");
  root ??= createRoot(host);
  return root;
}

async function paint(element: JSX.Element): Promise<void> {
  document.body.removeAttribute("data-demo-ready");
  mountPoint().render(element);
  // Exactly the gate the Remotion composition uses, so the parity comparison
  // tests the recipes and not two different font-loading races.
  await waitForDemonstrationFonts();
  await Promise.all(
    [...document.querySelectorAll("img")].map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );
  // Two frames: one for layout, one so any style recalculation has landed
  // before the preflight reads geometry.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  document.body.setAttribute("data-demo-ready", "true");
}

declare global {
  interface Window {
    renderDemonstrationClip: (input: unknown, frame: number) => Promise<void>;
  }
}

/**
 * The whole clip at an absolute frame: the active scene drawn at its
 * sequence-relative frame, plus the caption cue active then. This is what the
 * Remotion composition draws, so it is what a browser/server comparison must
 * capture for the comparison to be about the recipes.
 */
window.renderDemonstrationClip = async (input, clipFrame) => {
  const prepared = prepareDemonstrationComposition(input);
  if (prepared.props === undefined)
    throw new Error(
      `Harness received an unrenderable composition: ${prepared.issues
        .map((issue) => `${issue.code} at ${issue.fieldPath}`)
        .join(", ")}`,
    );
  const props = prepared.props;
  const segment = demonstrationTimeline(props.scenes).find(
    (entry) =>
      clipFrame >= entry.startFrame && clipFrame < entry.endFrameExclusive,
  );
  if (segment === undefined)
    throw new Error(`Frame ${clipFrame} is outside the clip.`);
  const scene = props.scenes.find((entry) => entry.id === segment.sceneId);
  if (scene === undefined) throw new Error("Timeline names a missing scene.");
  await paint(
    createElement(
      "div",
      {
        style: {
          background: videoTheme.colors.background,
          height: 1080,
          overflow: "hidden",
          position: "relative",
          width: 1920,
        },
      },
      createElement(DemonstrationSceneAtFrame, {
        assets: props.assets,
        compiled: compileDemonstrationPlan(scene.plan),
        // Remotion's <Sequence> makes the scene's frame relative to its start.
        frame: clipFrame - segment.startFrame,
        key: "scene",
        scene,
      }),
      // The composition's own caption component, not a copy of its markup, so
      // the preflight measures what the render actually draws. Caption cues
      // carry absolute clip frames, so this one takes the unshifted frame.
      createElement(DemonstrationCaptionAtFrame, {
        captions: props.captions,
        frame: clipFrame,
        key: "caption",
      }),
    ),
  );
};
