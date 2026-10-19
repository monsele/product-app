import { Sequence, useCurrentFrame } from "remotion";
import type { CustomDesignManifest, SceneSpec } from "@avlp/schemas";
import {
  CustomDesignScene,
  customFontFamily,
  type CustomDesignMedia,
} from "./custom-design.js";
export type CustomFixtureProps = {
  manifest: CustomDesignManifest;
  media: CustomDesignMedia;
  scenes: SceneSpec[];
};
export function CustomFixtureComposition({
  manifest,
  media,
  scenes,
}: CustomFixtureProps) {
  const frame = useCurrentFrame();
  const current = scenes[Math.min(scenes.length - 1, Math.floor(frame / 300))]!;
  return (
    <div
      data-custom-frame={frame}
      style={{
        width: "100%",
        height: "100%",
        background: manifest.presentation.colors.background,
      }}
    >
      {scenes.map((scene, index) => (
        <Sequence key={scene.id} from={index * 300} durationInFrames={300}>
          <CustomDesignScene
            manifest={manifest}
            media={media}
            scene={scene}
            durationInFrames={300}
          />
        </Sequence>
      ))}
      <div
        data-captions
        style={{
          position: "absolute",
          left: 120,
          top: 916,
          width: 1680,
          fontFamily: `"${customFontFamily(manifest.fonts[0]!.sha256)}"`,
          fontSize: 36,
          textAlign: "center",
          lineHeight: 1.3,
          color: manifest.presentation.colors.text,
        }}
      >
        {current.narration}
      </div>
    </div>
  );
}
