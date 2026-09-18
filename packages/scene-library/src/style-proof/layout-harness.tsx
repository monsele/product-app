/**
 * ST-094 — browser harness for the layout preflight.
 *
 * It mounts a treatment at a fixed frame, outside a Remotion `Player`, so the
 * preflight measures a deterministic still rather than racing playback. Font
 * readiness is awaited explicitly here, because `delayRender` has no renderer to
 * hold when we mount the component directly.
 */

import { createRoot, type Root } from "react-dom/client";
import { createElement, type JSX } from "react";
import type { StyleProofCompositionProps } from "@avlp/schemas/style-proof";
import { getStyleProofPack } from "@avlp/design-system/style-proof-tokens";
import {
  prepareStyleProofComposition,
  StyleProofStill,
  styleProofTimeline,
} from "./composition.js";
import { ProofCaption } from "./primitives.js";
import { waitForProofFonts } from "./fonts.js";

let root: Root | undefined;

function mountPoint(): Root {
  const host = document.getElementById("root");
  if (host === null) throw new Error("Missing #root");
  root ??= createRoot(host);
  return root;
}

async function paint(element: JSX.Element): Promise<void> {
  document.body.removeAttribute("data-proof-ready");
  mountPoint().render(element);
  // Exactly the gate the Remotion composition uses, so the parity comparison
  // is testing the treatments and not two different font-loading races.
  await waitForProofFonts();
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
  document.body.setAttribute("data-proof-ready", "true");
}

declare global {
  interface Window {
    renderStyleProofScene: (
      input: unknown,
      sceneId: string,
      frame: number,
    ) => Promise<void>;
    renderStyleProofClip: (input: unknown, frame: number) => Promise<void>;
  }
}

window.renderStyleProofScene = async (input, sceneId, frame) => {
  const prepared = prepareStyleProofComposition(input);
  if (prepared.props === undefined)
    throw new Error(
      `Harness received an unrenderable composition: ${prepared.issues
        .map((issue) => `${issue.code} at ${issue.fieldPath}`)
        .join(", ")}`,
    );
  await paint(
    createElement(StyleProofStill, { frame, props: prepared.props, sceneId }),
  );
};

/**
 * The whole clip at an absolute clip frame: the active scene drawn at its
 * sequence-relative frame, plus the caption cue active at that frame. This is
 * what the Remotion composition draws, so it is what the browser/server parity
 * comparison must capture.
 */
window.renderStyleProofClip = async (input, clipFrame) => {
  const prepared = prepareStyleProofComposition(input);
  if (prepared.props === undefined)
    throw new Error("Harness received an unrenderable composition.");
  const props: StyleProofCompositionProps = prepared.props;
  const segment = styleProofTimeline(props.scenes).find(
    (entry) =>
      clipFrame >= entry.startFrame && clipFrame < entry.endFrameExclusive,
  );
  if (segment === undefined)
    throw new Error(`Frame ${clipFrame} is outside the clip.`);
  const cue = props.captions.find(
    (caption) => clipFrame >= caption.startFrame && clipFrame < caption.endFrame,
  );
  await paint(
    createElement(
      "div",
      {
        style: {
          background: getStyleProofPack(props.selection.pack.id).colors
            .background,
          height: 1080,
          overflow: "hidden",
          position: "relative",
          width: 1920,
        },
      },
      createElement(StyleProofStill, {
        // Remotion's <Sequence> makes the scene's frame relative to its start.
        frame: clipFrame - segment.startFrame,
        key: "scene",
        props,
        sceneId: segment.sceneId,
      }),
      cue === undefined
        ? null
        : createElement(ProofCaption, {
            key: "caption",
            pack: getStyleProofPack(props.selection.pack.id),
            text: cue.text,
          }),
    ),
  );
};
