import { Player } from "@remotion/player";
import { createRoot } from "react-dom/client";
import {
  assertCustomLayout,
  assertCustomRenderedGlyphs,
  loadCustomDesignFonts,
} from "./custom-design.js";
import {
  CustomFixtureComposition,
  type CustomFixtureProps,
} from "./custom-design.fixture-composition.js";
declare global {
  interface Window {
    customHarness: {
      mount: (props: CustomFixtureProps, frame: number) => void;
      preflight: (
        props: CustomFixtureProps,
        markup: string,
      ) => Promise<{ layoutError: string | null; glyphError: string | null }>;
    };
  }
}
const root = createRoot(document.getElementById("root")!);
window.customHarness = {
  preflight: async (props, markup) => {
    const assets = await loadCustomDesignFonts(props.manifest, props.media);
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;left:0;top:0;width:1920px;height:1080px";
    // Test-only authored markup; never accepts uploaded HTML in the product.
    probe.innerHTML = markup;
    document.body.append(probe);
    const check = (run: () => void) => {
      try {
        run();
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };
    try {
      return {
        layoutError: check(() => assertCustomLayout(probe)),
        glyphError: check(() =>
          assertCustomRenderedGlyphs(props.manifest, probe),
        ),
      };
    } finally {
      probe.remove();
      Object.values(assets).forEach((url) => URL.revokeObjectURL(url));
    }
  },
  mount: (props, frame) =>
    root.render(
      <Player
        key={`${props.manifest.systemContentHash}:${frame}`}
        component={CustomFixtureComposition}
        inputProps={props}
        compositionWidth={1920}
        compositionHeight={1080}
        fps={30}
        durationInFrames={900}
        initialFrame={frame}
        style={{ width: 1920, height: 1080 }}
      />,
    ),
};
