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
import { assetAssistedDefinitionFixture } from "./definition-scene.fixtures.js";
import { maximumProcessFixture } from "./process-scene.fixtures.js";
import { maximumDensityIpoFixture } from "./ipo-scene.fixtures.js";
import { imageAssistedComparisonFixture } from "./comparison-scene.fixtures.js";
import { generatedAnalogyFixture } from "./analogy-scene.fixtures.js";
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
      `"fd4cac735038e73dd2c8cc72fd3a97b90781b1d82af6e712ca83c2e451b0ed62"`,
    );
    expect(
      createHash("sha256")
        .update(entered.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"db40d8ee7766679dc64611ec778c66c2b013804dcc61298d1fe57ecab727e93e"`,
    );

    const definitionComposition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: { scene: assetAssistedDefinitionFixture },
      serveUrl,
    });
    const definition = await renderStill({
      browserExecutable,
      composition: definitionComposition,
      frame: 48,
      imageFormat: "png",
      inputProps: { scene: assetAssistedDefinitionFixture },
      serveUrl,
    });
    const repeatedDefinition = await renderStill({
      browserExecutable,
      composition: definitionComposition,
      frame: 48,
      imageFormat: "png",
      inputProps: { scene: assetAssistedDefinitionFixture },
      serveUrl,
    });

    expect(definition.contentType).toBe("image/png");
    expect(definition.buffer).toEqual(repeatedDefinition.buffer);

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
      `"8c33df3e75ce2742476c0601e900183300bf7de259e2511ce1cc6574809e2004"`,
    );

    const comparisonComposition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: { scene: imageAssistedComparisonFixture },
      serveUrl,
    });
    const comparison = await renderStill({
      browserExecutable,
      composition: comparisonComposition,
      frame: 90,
      imageFormat: "png",
      inputProps: { scene: imageAssistedComparisonFixture },
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
      `"9e3e67ada645bc0b039ec44b59a32bd6ff4cb814d2dbcb7bd5ebdfe74022e2b6"`,
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
    expect(
      createHash("sha256")
        .update(diagram.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toBe("00cb3290b4ab4a14e06b74e0e9e3f33eba25f6c79b5adf987be7816f5bc82e55");

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
      `"ac930774c54d9486c5c312a46cfee80cf756df7e96ea5f370550662447b3adcd"`,
    );
    expect(
      createHash("sha256")
        .update(diagramFirstReveal.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"69c5c1d3701ece668ba6370d2e07705027332089d748bae49e05004f89cd152d"`,
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
    expect(
      createHash("sha256")
        .update(shapes.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toBe("965ecc52fd4dec47d12f8209ae007ce5cf4d8405d917095760561cf5528bed1b");

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
      `"abd3ffd420dcf66fb464704bae3fb6b664f238d858b41cf81d8bb4542a4e917e"`,
    );
  }, 120_000);
});
