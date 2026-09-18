/**
 * ST-095 — the browser layout preflight, as a test rather than only a script.
 *
 * The same measurements run inside `render-demonstration-proof.mjs`, but a
 * check that lives only in an evidence script is a check CI never runs. ST-094's
 * review raised exactly that, so the geometry assertions live here too and a
 * regression fails a build rather than surfacing the next time somebody renders
 * evidence by hand.
 *
 * Everything here is measured in a real browser with the pinned font loaded.
 * `measureText` cannot run in Node, so a Node-side estimate of whether a
 * balance readout overlaps the caption band would be a false assurance rather
 * than a shortcut.
 */

import { bundle } from "@remotion/bundler";
import { chromium, type Browser } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DemonstrationCompositionProps } from "@avlp/schemas/demonstration-proof";
import { startHarnessServer, type HarnessServer } from "./harness-server.js";
import {
  demonstrationTimeline,
  prepareDemonstrationComposition,
} from "./composition.js";
import {
  demonstrationCaptionExclusion,
  demonstrationPreflightSelector,
} from "./validation.js";
import {
  evaporationDemonstrationFixture,
  savingsDemonstrationFixture,
} from "./fixtures.js";

let harness: HarnessServer;
let browser: Browser;

beforeAll(async () => {
  const harnessBundle = await bundle({
    entryPoint: fileURLToPath(
      new URL("../../dist/demonstration-proof/layout-harness.js", import.meta.url),
    ),
    ignoreRegisterRootWarning: true,
    webpackOverride: (config) => ({
      ...config,
      output: { ...config.output, filename: "harness.js" },
    }),
  });
  harness = await startHarnessServer(harnessBundle);
  browser = await chromium.launch({ headless: true });
}, 600_000);

afterAll(async () => {
  await browser?.close();
  await harness?.close();
});

type Measurement = Readonly<{
  bottom: number;
  hasText: boolean;
  id: string;
  kind: "object" | "content" | "region";
  left: number;
  overflows: boolean;
  right: number;
  top: number;
}>;

async function measure(
  props: DemonstrationCompositionProps,
  frame: number,
): Promise<readonly Measurement[]> {
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ height: 1080, width: 1920 });
    await page.goto(harness.origin);
    await page.evaluate(
      ([payload, at]) => window.renderDemonstrationClip(payload, at as number),
      [props, frame] as [unknown, number],
    );
    await page.waitForSelector("[data-demo-ready='true']", { timeout: 60_000 });
    return await page.evaluate((selector) => {
      const found: Measurement[] = [];
      for (const node of document.querySelectorAll(selector)) {
        const box = node.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const objectId = node.getAttribute("data-demo-object");
        const contentId = node.getAttribute("data-demo-content");
        const regionId = node.getAttribute("data-demo-region");
        found.push({
          bottom: box.bottom,
          hasText: (node.textContent ?? "").trim().length > 0,
          id: objectId ?? contentId ?? regionId ?? "unknown",
          kind:
            objectId !== null
              ? "object"
              : contentId !== null
                ? "content"
                : "region",
          left: box.left,
          overflows:
            node.scrollHeight > node.clientHeight + 1 ||
            node.scrollWidth > node.clientWidth + 1,
          right: box.right,
          top: box.top,
        });
      }
      return found;
    }, demonstrationPreflightSelector);
  } finally {
    await page.close();
  }
}

const subjects = [
  { name: "savings", props: savingsDemonstrationFixture },
  { name: "evaporation", props: evaporationDemonstrationFixture },
] as const;

/**
 * Three frames per scene, chosen for what they test rather than for coverage:
 * the entrance has settled, the middle is where a transfer is in flight, and
 * the hold is the state the learner reads.
 */
function sampleFrames(props: DemonstrationCompositionProps): readonly number[] {
  return demonstrationTimeline(props.scenes).flatMap((segment) => [
    segment.startFrame + 25,
    Math.floor((segment.startFrame + segment.endFrameExclusive) / 2),
    segment.endFrameExclusive - 20,
  ]);
}

describe.each(subjects)("$name demonstration layout", ({ props }) => {
  it("keeps every explanatory object and readable element on the canvas", async () => {
    for (const frame of sampleFrames(props)) {
      const offCanvas = (await measure(props, frame)).filter(
        (entry) =>
          entry.left < 0 ||
          entry.top < 0 ||
          entry.right > 1920 ||
          entry.bottom > 1080,
      );
      expect({ frame, offCanvas: offCanvas.map((entry) => entry.id) }).toEqual({
        frame,
        offCanvas: [],
      });
    }
  }, 600_000);

  it("keeps explanatory content clear of the caption band", async () => {
    for (const frame of sampleFrames(props)) {
      const colliding = (await measure(props, frame)).filter(
        (entry) =>
          entry.bottom > demonstrationCaptionExclusion.top &&
          entry.right > demonstrationCaptionExclusion.left &&
          entry.left < demonstrationCaptionExclusion.right,
      );
      expect({ collisions: colliding.map((entry) => entry.id), frame }).toEqual({
        collisions: [],
        frame,
      });
    }
  }, 600_000);

  it("contains every element inside its own box once the font has loaded", async () => {
    for (const frame of sampleFrames(props)) {
      const overflowing = (await measure(props, frame))
        .filter((entry) => entry.overflows)
        .map((entry) => entry.id);
      expect({ frame, overflowing }).toEqual({ frame, overflowing: [] });
    }
  }, 600_000);

  it("draws the scene's required readable content at the hold frame", async () => {
    // A blank frame passes every geometric check above, so the preflight also
    // has to assert that something was actually drawn.
    for (const segment of demonstrationTimeline(props.scenes)) {
      const measured = await measure(props, segment.endFrameExclusive - 20);
      expect(
        measured.filter((entry) => entry.kind === "object").length,
      ).toBeGreaterThan(0);
      expect(
        measured.some((entry) => entry.id === "title" && entry.hasText),
      ).toBe(true);
    }
  }, 600_000);
});

/**
 * The recipes lay out by role, so the plan's own names must not reach geometry.
 *
 * This renames every container in the savings fixture — `income` becomes
 * `wages`, `savings` becomes `pot` — without changing a single role, and
 * requires the rendered boxes to be identical. Before the recipes resolved
 * layout by role, the renamed plan reported as supported, validated cleanly,
 * and then drew every container in one rectangle with the tokens overlapping,
 * while the readouts went on stating the correct balances. Nothing in the
 * preflight caught it, because the result was still on canvas and clear of the
 * caption band.
 */
describe("layout follows roles, not the plan's names", () => {
  const renames: Readonly<Record<string, string>> = Object.freeze({
    "cash-origin": "payday",
    income: "wages",
    savings: "pot",
  });
  const renamed = (id: string): string => renames[id] ?? id;

  /** Structural rename: every field that references a container by ID. */
  function renameContainers(
    props: DemonstrationCompositionProps,
  ): DemonstrationCompositionProps {
    return {
      ...props,
      scenes: props.scenes.map((scene) => ({
        ...scene,
        plan: {
          ...scene.plan,
          events: scene.plan.events.map((event) => {
            switch (event.action) {
              case "transfer":
                return {
                  ...event,
                  fromContainerId: renamed(event.fromContainerId),
                  toContainerId: renamed(event.toContainerId),
                };
              case "introduce":
                return {
                  ...event,
                  fromOriginId: renamed(event.fromOriginId),
                  toContainerId: renamed(event.toContainerId),
                };
              case "emphasise":
                return { ...event, objectIds: event.objectIds.map(renamed) };
              default:
                return event;
            }
          }),
          expectedFinalState: {
            ...scene.plan.expectedFinalState,
            containerTotals: scene.plan.expectedFinalState.containerTotals.map(
              (entry) => ({ ...entry, containerId: renamed(entry.containerId) }),
            ),
          },
          initialState: {
            objects: scene.plan.initialState.objects.map((object) => {
              if (object.kind === "container")
                return { ...object, id: renamed(object.id) };
              if (object.kind === "token")
                return { ...object, containerId: renamed(object.containerId) };
              if (object.kind === "note")
                return {
                  ...object,
                  anchorObjectId: renamed(object.anchorObjectId),
                };
              return object;
            }),
            readouts: scene.plan.initialState.readouts.map((readout) => ({
              ...readout,
              containerId: renamed(readout.containerId),
            })),
          },
        },
      })),
    };
  }

  it("draws the renamed savings fixture exactly where the original is drawn", async () => {
    const original = savingsDemonstrationFixture;
    const withNewIds = renameContainers(original);

    // It must still be a plan the contract accepts, or the comparison is moot.
    expect(prepareDemonstrationComposition(withNewIds).issues).toEqual([]);

    for (const frame of sampleFrames(original)) {
      const before = await measure(original, frame);
      const after = await measure(withNewIds, frame);
      // Compared by position rather than by ID, since the IDs are the thing
      // that changed. Sorted so element order cannot make this flap.
      const boxes = (found: readonly Measurement[]) =>
        found
          .map((entry) =>
            [entry.left, entry.top, entry.right, entry.bottom]
              .map(Math.round)
              .join(","),
          )
          .sort();
      expect({ frame, boxes: boxes(after) }).toEqual({
        frame,
        boxes: boxes(before),
      });
    }
  }, 600_000);
});
