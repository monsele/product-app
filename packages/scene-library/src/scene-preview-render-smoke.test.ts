import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  sceneRuntimeComposition,
  sceneRuntimeCompositionId,
} from "./scene-preview-composition.js";
import {
  assetAssistedDefinitionFixture,
  resolvedDefinitionAssets,
  textOnlyDefinitionFixture,
} from "./definition-scene.fixtures.js";
import { maximumProcessFixture } from "./process-scene.fixtures.js";
import { maximumDensityIpoFixture } from "./ipo-scene.fixtures.js";
import {
  imageAssistedComparisonFixture,
  resolvedComparisonAssets,
} from "./comparison-scene.fixtures.js";
import { generatedAnalogyFixture } from "./analogy-scene.fixtures.js";
import { numericalWorkedExampleFixture } from "./worked-example-scene.fixtures.js";
import {
  assetAssistedSummaryFixture,
  resolvedSummaryAssets,
} from "./summary-scene.fixtures.js";
import { branchingCauseEffectFixture } from "./cause-effect-scene.fixtures.js";
import {
  assetDiagramFixture,
  resolvedDiagramAssets,
  shapesDiagramFixture,
} from "./labelled-diagram-scene.fixtures.js";

describe("scene runtime Remotion smoke", () => {
  it("renders deterministic visual-regression frames from the shared preview runtime", async () => {
    const serveUrl = await bundle({
      entryPoint: fileURLToPath(
        new URL("../dist/remotion-root.js", import.meta.url),
      ),
    });
    const browserExecutable = chromium.executablePath();
    const composition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: {},
      serveUrl,
    });
    const rendered = await renderStill({
      browserExecutable,
      composition,
      frame: 0,
      imageFormat: "png",
      serveUrl,
    });
    const entered = await renderStill({
      browserExecutable,
      composition,
      frame: 18,
      imageFormat: "png",
      serveUrl,
    });
    const repeated = await renderStill({
      browserExecutable,
      composition,
      frame: 0,
      imageFormat: "png",
      serveUrl,
    });

    expect(composition).toMatchObject(sceneRuntimeComposition);
    expect(rendered.contentType).toBe("image/png");
    expect(rendered.buffer?.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(rendered.buffer).toEqual(repeated.buffer);
    expect(
      createHash("sha256")
        .update(rendered.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"998f6181010927589670b80ff993471cac7fc97d30c0a0043323f7b25070d696"`,
    );
    expect(
      createHash("sha256")
        .update(entered.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"d29758a28f722b46669692da5caed2d5de4a7e440d9534f3f1b1dbc0945f1274"`,
    );

    const definitionComposition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: {
        resolvedAssets: resolvedDefinitionAssets,
        scene: assetAssistedDefinitionFixture,
      },
      serveUrl,
    });
    const definition = await renderStill({
      browserExecutable,
      composition: definitionComposition,
      frame: 48,
      imageFormat: "png",
      inputProps: {
        resolvedAssets: resolvedDefinitionAssets,
        scene: assetAssistedDefinitionFixture,
      },
      serveUrl,
    });
    const repeatedDefinition = await renderStill({
      browserExecutable,
      composition: definitionComposition,
      frame: 48,
      imageFormat: "png",
      inputProps: {
        resolvedAssets: resolvedDefinitionAssets,
        scene: assetAssistedDefinitionFixture,
      },
      serveUrl,
    });

    expect(definition.contentType).toBe("image/png");
    expect(definition.buffer).toEqual(repeatedDefinition.buffer);
    expect(
      createHash("sha256")
        .update(definition.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"8de5e937696cd212c6e1fbc17142406bdb2239d9e6b3ff82068161adc1d58397"`,
    );

    const textOnlyDefinitionComposition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: { scene: textOnlyDefinitionFixture },
      serveUrl,
    });
    const textOnlyDefinition = await renderStill({
      browserExecutable,
      composition: textOnlyDefinitionComposition,
      frame: 48,
      imageFormat: "png",
      inputProps: { scene: textOnlyDefinitionFixture },
      serveUrl,
    });
    expect(textOnlyDefinition.contentType).toBe("image/png");
    expect(
      createHash("sha256")
        .update(textOnlyDefinition.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"baaf9993e8a09944f08ef3fbbc464a8f549927d0682580ca1202fa9869b44839"`,
    );

    const processComposition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: { scene: maximumProcessFixture },
      serveUrl,
    });
    const process = await renderStill({
      browserExecutable,
      composition: processComposition,
      frame: 120,
      imageFormat: "png",
      inputProps: { scene: maximumProcessFixture },
      serveUrl,
    });
    expect(process.contentType).toBe("image/png");

    const ipoComposition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: { scene: maximumDensityIpoFixture },
      serveUrl,
    });
    const ipo = await renderStill({
      browserExecutable,
      composition: ipoComposition,
      frame: 90,
      imageFormat: "png",
      inputProps: { scene: maximumDensityIpoFixture },
      serveUrl,
    });
    const repeatedIpo = await renderStill({
      browserExecutable,
      composition: ipoComposition,
      frame: 90,
      imageFormat: "png",
      inputProps: { scene: maximumDensityIpoFixture },
      serveUrl,
    });
    expect(ipo.contentType).toBe("image/png");
    expect(ipo.buffer).toEqual(repeatedIpo.buffer);
    expect(
      createHash("sha256")
        .update(ipo.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"953fdfcbff12f703698d3f50c2ef100ee76ae6b89a050743319f98f8d6847a55"`,
    );

    const comparisonComposition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: {
        resolvedAssets: resolvedComparisonAssets,
        scene: imageAssistedComparisonFixture,
      },
      serveUrl,
    });
    const comparison = await renderStill({
      browserExecutable,
      composition: comparisonComposition,
      frame: 90,
      imageFormat: "png",
      inputProps: {
        resolvedAssets: resolvedComparisonAssets,
        scene: imageAssistedComparisonFixture,
      },
      serveUrl,
    });
    expect(comparison.contentType).toBe("image/png");

    const analogyComposition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: { scene: generatedAnalogyFixture },
      serveUrl,
    });
    const analogy = await renderStill({
      browserExecutable,
      composition: analogyComposition,
      frame: 90,
      imageFormat: "png",
      inputProps: { scene: generatedAnalogyFixture },
      serveUrl,
    });
    const repeatedAnalogy = await renderStill({
      browserExecutable,
      composition: analogyComposition,
      frame: 90,
      imageFormat: "png",
      inputProps: { scene: generatedAnalogyFixture },
      serveUrl,
    });
    expect(analogy.contentType).toBe("image/png");
    expect(analogy.buffer).toEqual(repeatedAnalogy.buffer);

    const workedExampleComposition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: { scene: numericalWorkedExampleFixture },
      serveUrl,
    });
    const workedExample = await renderStill({
      browserExecutable,
      composition: workedExampleComposition,
      frame: 90,
      imageFormat: "png",
      inputProps: { scene: numericalWorkedExampleFixture },
      serveUrl,
    });
    const repeatedWorkedExample = await renderStill({
      browserExecutable,
      composition: workedExampleComposition,
      frame: 90,
      imageFormat: "png",
      inputProps: { scene: numericalWorkedExampleFixture },
      serveUrl,
    });
    expect(workedExample.contentType).toBe("image/png");
    expect(workedExample.buffer).toEqual(repeatedWorkedExample.buffer);
    expect(
      createHash("sha256")
        .update(workedExample.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"b892982ae8e104e15c948c8f851f273806efb3e57ee5f05df16ef1e2db23b7ac"`,
    );

    const workedExampleFinalStep = await renderStill({
      browserExecutable,
      composition: workedExampleComposition,
      frame: 180,
      imageFormat: "png",
      inputProps: { scene: numericalWorkedExampleFixture },
      serveUrl,
    });
    const workedExampleResult = await renderStill({
      browserExecutable,
      composition: workedExampleComposition,
      frame: 240,
      imageFormat: "png",
      inputProps: { scene: numericalWorkedExampleFixture },
      serveUrl,
    });
    expect(
      createHash("sha256")
        .update(workedExampleFinalStep.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"e9ff329adc20abdaf84c732f882ce887d8d044f35af05ab6643b16851924a52f"`,
    );
    expect(
      createHash("sha256")
        .update(workedExampleResult.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"7b6d8fe52b24f857262a9af4d08c37433d603be2bf72b27bf04a7744f0337420"`,
    );

    const summaryComposition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: {
        resolvedAssets: resolvedSummaryAssets,
        scene: assetAssistedSummaryFixture,
      },
      serveUrl,
    });
    const summaryFinal = await renderStill({
      browserExecutable,
      composition: summaryComposition,
      frame: 270,
      imageFormat: "png",
      inputProps: {
        resolvedAssets: resolvedSummaryAssets,
        scene: assetAssistedSummaryFixture,
      },
      serveUrl,
    });
    expect(summaryFinal.contentType).toBe("image/png");
    expect(
      createHash("sha256")
        .update(summaryFinal.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"1c421203f48aa8ae14f65464194fe4a3370e048cc84abc744177b7d39ac9402c"`,
    );

    const causeEffectComposition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: { scene: branchingCauseEffectFixture },
      serveUrl,
    });
    const causeEffect = await renderStill({
      browserExecutable,
      composition: causeEffectComposition,
      frame: 90,
      imageFormat: "png",
      inputProps: { scene: branchingCauseEffectFixture },
      serveUrl,
    });
    expect(causeEffect.contentType).toBe("image/png");
    expect(
      createHash("sha256")
        .update(causeEffect.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"81b11c7b0b2e28f96c5acdd885220d044d62fdba18a48bbd4580a59e17a40aa2"`,
    );

    const diagramComposition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: {
        resolvedAssets: resolvedDiagramAssets,
        scene: assetDiagramFixture,
      },
      serveUrl,
    });
    const diagram = await renderStill({
      browserExecutable,
      composition: diagramComposition,
      frame: 90,
      imageFormat: "png",
      inputProps: {
        resolvedAssets: resolvedDiagramAssets,
        scene: assetDiagramFixture,
      },
      serveUrl,
    });
    const repeatedDiagram = await renderStill({
      browserExecutable,
      composition: diagramComposition,
      frame: 90,
      imageFormat: "png",
      inputProps: {
        resolvedAssets: resolvedDiagramAssets,
        scene: assetDiagramFixture,
      },
      serveUrl,
    });
    expect(diagram.contentType).toBe("image/png");
    expect(diagram.buffer).toEqual(repeatedDiagram.buffer);
    // ST-086 replaced the fixed nine-anchor callout table with content-derived
    // automatic placement, so this frame's pixels change intentionally.
    // Regenerate with `vitest -u` in the baseline environment and review the
    // diff alongside the other render baselines.
    expect(
      createHash("sha256")
        .update(diagram.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"d369d639eb3b77d4fe7a70ab1e3e001cce0394e2c2030d52a2ec7d41ebb303a1"`,
    );

    const diagramInitial = await renderStill({
      browserExecutable,
      composition: diagramComposition,
      frame: 0,
      imageFormat: "png",
      inputProps: {
        resolvedAssets: resolvedDiagramAssets,
        scene: assetDiagramFixture,
      },
      serveUrl,
    });
    const diagramFirstReveal = await renderStill({
      browserExecutable,
      composition: diagramComposition,
      frame: 33,
      imageFormat: "png",
      inputProps: {
        resolvedAssets: resolvedDiagramAssets,
        scene: assetDiagramFixture,
      },
      serveUrl,
    });
    expect(
      createHash("sha256")
        .update(diagramInitial.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"60fcae04dfbd44a3790e4d57a74ee5ce450c9f7bf97feb0d72c7a858f23b3643"`,
    );
    expect(
      createHash("sha256")
        .update(diagramFirstReveal.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"be6b34e66688bdecf16382c3c906c0c6a1c9ea9d5f047b40e3d354ed79148f96"`,
    );

    const shapesComposition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: { scene: shapesDiagramFixture },
      serveUrl,
    });
    const shapes = await renderStill({
      browserExecutable,
      composition: shapesComposition,
      frame: 90,
      imageFormat: "png",
      inputProps: { scene: shapesDiagramFixture },
      serveUrl,
    });
    expect(shapes.contentType).toBe("image/png");
    // ST-086: callout placement is now automatic for shapes diagrams too.
    // Regenerate with `vitest -u` in the baseline environment.
    expect(
      createHash("sha256")
        .update(shapes.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"69a16b361a47cb491719bbb7754a592a7c1da820dc35b167e7a14cbdf519b26d"`,
    );

    const shapesFirstReveal = await renderStill({
      browserExecutable,
      composition: shapesComposition,
      frame: 33,
      imageFormat: "png",
      inputProps: { scene: shapesDiagramFixture },
      serveUrl,
    });
    expect(
      createHash("sha256")
        .update(shapesFirstReveal.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"9a922eee0b5f431db27a6efe93311728521192621f259b113e1f1ebdd9f4c00e"`,
    );
  }, 120_000);
});
