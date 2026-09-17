import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";

// The scene wrappers are the only place `useCurrentFrame` is called, so they
// were never covered by the server-rendered tests and quietly stopped handing
// `resolvedAssets` down to their frame components. Stubbing just the hook keeps
// the rest of Remotion real and puts the wrappers under test.
vi.mock("remotion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("remotion")>()),
  useCurrentFrame: () => 60,
}));

const { createDefaultScene, resolveSafeDiagramAsset, SceneRuntime } =
  await import("./scene-registry.js");
const { assetAssistedSummaryFixture, resolvedSummaryAssets } = await import(
  "./summary-scene.fixtures.js"
);
const { getProcessStepMetrics, ProcessSceneFrame } = await import(
  "./process-scene.js"
);

const stepIconAssetId = "00000000-0000-7000-8000-000000000004";
const iconProcessScene = {
  ...createDefaultScene("process"),
  title: "The water cycle",
  visual: { steps: ["Water warms", "Water evaporates"] },
  assetBindings: [
    {
      altText: "Evaporation icon",
      assetId: stepIconAssetId,
      role: "icon" as const,
      slot: "step-2-icon",
    },
  ],
};
const resolvedProcessAssets = {
  [stepIconAssetId]: {
    altText: "Evaporation icon",
    assetId: stepIconAssetId,
    source: "source" as const,
    src: "https://storage.example.test/evaporation.png",
  },
};

describe("scene runtime asset forwarding", () => {
  it("hands resolved assets to the process scene", () => {
    const markup = renderToStaticMarkup(
      createElement(SceneRuntime, {
        resolvedAssets: resolvedProcessAssets,
        runtimeMode: "preview",
        scene: iconProcessScene,
      }),
    );
    expect(markup).toContain('data-process-step-image="2"');
    expect(markup).toContain(
      'src="https://storage.example.test/evaporation.png"',
    );
  });

  it("hands resolved assets to the summary scene", () => {
    const markup = renderToStaticMarkup(
      createElement(SceneRuntime, {
        resolvedAssets: resolvedSummaryAssets,
        runtimeMode: "preview",
        scene: assetAssistedSummaryFixture,
      }),
    );
    expect(markup).toContain("data-summary-central-asset");
  });

  it("renders a summary scene that requires its central asset", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(SceneRuntime, {
          resolvedAssets: resolvedSummaryAssets,
          runtimeMode: "render",
          scene: assetAssistedSummaryFixture,
        }),
      ),
    ).not.toThrow();
  });
});

describe("diagram image source allowlist", () => {
  const resolve = (src: string) =>
    resolveSafeDiagramAsset(stepIconAssetId, {
      [stepIconAssetId]: {
        altText: "Evaporation icon",
        assetId: stepIconAssetId,
        source: "source" as const,
        src,
      },
    });

  it("accepts signed downloads from local object storage over plain HTTP", () => {
    // What MinIO signs when OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT is set.
    expect(
      resolve(
        "http://localhost:9000/visual-learning-private/users/u/projects/p/assets/a.png?X-Amz-Signature=abc",
      ),
    ).toBeDefined();
    expect(resolve("http://127.0.0.1:9000/bucket/a.png")).toBeDefined();
    expect(resolve("https://storage.example.test/a.png")).toBeDefined();
  });

  it("still rejects insecure remote and non-HTTP sources", () => {
    expect(resolve("http://storage.example.test/a.png")).toBeUndefined();
    expect(resolve("http://localhost.evil.test/a.png")).toBeUndefined();
    expect(resolve("javascript:alert(1)")).toBeUndefined();
    expect(resolve("not a url")).toBeUndefined();
  });
});

describe("process step layout", () => {
  const longSteps = (count: number) =>
    Array.from({ length: count }, (_, index) => `Step ${index + 1}: ${"w".repeat(72)}`);

  it("shrinks step chrome as the list and title grow", () => {
    const roomy = getProcessStepMetrics(longSteps(5), "Six stages", true);
    const tight = getProcessStepMetrics(
      longSteps(6),
      "A deliberately long scene title that is certain to wrap onto a second line",
      true,
    );
    expect(tight.fontSize).toBeLessThan(roomy.fontSize);
    expect(tight.badgeSize).toBeLessThan(roomy.badgeSize);
  });

  it("keeps every step's content inside its own box", async () => {
    const cases = [
      { steps: longSteps(5), title: "Five Pillars of Financial Stewardship" },
      { steps: longSteps(6), title: "Six stages" },
      {
        steps: longSteps(6),
        title:
          "A deliberately long scene title that is certain to wrap onto a second line",
      },
    ];
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      });
      for (const { steps, title } of cases) {
        const scene = {
          ...createDefaultScene("process"),
          title,
          visual: { steps },
          assetBindings: steps.map((_, index) => ({
            altText: `Step ${index + 1} icon`,
            assetId: `00000000-0000-7000-8000-00000000000${index + 1}`,
            role: "icon" as const,
            slot: `step-${index + 1}-icon`,
          })),
        };
        await page.setContent(
          `<style>html, body { height: 100%; margin: 0; }</style>${renderToStaticMarkup(
            createElement(ProcessSceneFrame, { frame: 200, scene }),
          )}`,
        );
        const spilling = await page
          .locator("ol[data-process-layout]")
          .evaluate((list) =>
            Array.from(list.querySelectorAll("li[data-process-step]"))
              .filter(
                (step) =>
                  step.scrollHeight >
                    Math.ceil(step.getBoundingClientRect().height) ||
                  // 876 is the top of the caption safe area.
                  step.getBoundingClientRect().bottom > 876,
              )
              .map((step) => step.getAttribute("data-process-step")),
          );
        expect(spilling).toEqual([]);
      }
    } finally {
      await browser.close();
    }
  });
});
