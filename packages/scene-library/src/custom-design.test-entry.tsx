import { Composition, registerRoot } from "remotion";
import { CustomFixtureComposition } from "./custom-design.fixture-composition.js";
import {
  customFixtureManifest,
  customFixtureScenes,
} from "./custom-design.fixture.js";
registerRoot(() => (
  <Composition
    id="CustomManualSystems"
    component={CustomFixtureComposition}
    defaultProps={{
      manifest: customFixtureManifest("journal", "a".repeat(64)),
      media: {},
      scenes: customFixtureScenes,
    }}
    durationInFrames={900}
    fps={30}
    width={1920}
    height={1080}
  />
));
