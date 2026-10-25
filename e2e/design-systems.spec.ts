import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test.setTimeout(120000);

const id = "00000000-0000-7000-8000-000000000901";
const fontId = "00000000-0000-7000-8000-000000000902";
const presentation = {
  colors: {
    background: "#fbf8f3",
    surface: "#ffffff",
    text: "#172033",
    accent: "#5b21b6",
    diagramEmphasis: "#2563eb",
  },
  fonts: { heading: fontId, body: fontId },
  logoAssetId: null,
  alignment: "left",
  density: "spacious",
  emphasis: "text",
  arrangement: "split",
  imageFrame: "none",
  stroke: "fine",
  corners: "square",
  motion: {
    family: "fade",
    prohibited: [],
    intensity: "calm",
    staggerFrames: 0,
    holdFrames: 36,
  },
};

test("interpretation requires paid action, shows provenance/conflicts, preserves edits and rejects stale acceptance", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "avlp_session",
      value: "design-system-test",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  const interpretationId = "00000000-0000-7000-8000-000000000903";
  const base = {
    schemaVersion: "1.1",
    philosophy: "Relationships before decoration",
    rules: [],
    assetIds: [fontId],
    presentation,
  };
  let revision = 1;
  let state = "queued";
  let accepted: number | null = null;
  let stale = false;
  let requests = 0;
  const rule = {
    id: "imagery",
    category: "imagery",
    instruction: "Avoid decorative icons",
    origin: "supplied",
    enforcement: "guidance",
  };
  const proposal = {
    schemaVersion: "1.0",
    definition: { ...base, rules: [rule] },
    suggestedPresentation: null,
    provenance: [
      {
        ruleId: "imagery",
        origin: "supplied",
        sourceId: "request",
        quote: "Avoid decorative icons",
      },
    ],
    conflicts: ["Existing exact controls were preserved."],
    unsupported: ["Bouncing motion is unsupported."],
    capabilities: [
      {
        ruleId: "imagery",
        status: "advisory",
        message: "Advisory guidance; exact controls remain authoritative.",
      },
    ],
  };
  await page.route(
    /http:\/\/(?:127\.0\.0\.1|localhost):300[12]\/design-systems(?:\/.*)?$/,
    async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      const system = {
        id,
        name: "Field journal",
        revision,
        archivedAt: null,
        definition: accepted ? proposal.definition : base,
      };
      if (path.endsWith("/accept")) {
        if (stale) {
          await route.fulfill({ status: 409, json: {} });
          return;
        }
        accepted = 2;
        revision = 2;
        await route.fulfill({ json: { revision } });
        return;
      }
      if (path.endsWith("/interpretations") && request.method() === "POST") {
        expect(request.postDataJSON()).toMatchObject({
          expectedRevision: 1,
          paidActionConfirmed: true,
          assetIds: [],
          request: "Avoid decorative icons",
        });
        requests++;
        await route.fulfill({
          status: 202,
          json: { id: interpretationId, jobId: interpretationId },
        });
        return;
      }
      if (path.endsWith("/interpretations")) {
        await route.fulfill({
          json: requests ? [{ id: interpretationId, inputRevision: 1 }] : [],
        });
        return;
      }
      if (path.endsWith(interpretationId)) {
        await route.fulfill({
          json: {
            id: interpretationId,
            inputRevision: 1,
            state,
            stale,
            acceptedRevision: accepted,
            errorCode: null,
            proposal: state === "succeeded" ? proposal : null,
          },
        });
        return;
      }
      await route.fulfill({
        json:
          path === "/design-systems"
            ? [system]
            : { system, assets: [], versions: [], nextBeforeRevision: null },
      });
    },
  );
  await page.goto(
    "/workspace/design-systems?projectId=019ffbf1-610e-738a-b087-6775ff97568c",
  );
  await page.getByRole("button", { name: /Field journal/ }).click();
  const panel = page.getByRole("region", {
    name: "Interpret your design language",
  });
  await panel
    .getByLabel("Describe your design language")
    .fill("Avoid decorative icons");
  const generate = panel.getByRole("button", {
    name: "Generate interpretation",
  });
  await expect(generate).toBeDisabled();
  await panel.getByLabel(/Authorize this paid interpretation/).check();
  await generate.click();
  await expect(panel.getByRole("status")).toHaveText("Interpretation queued");
  state = "succeeded";
  await panel.getByRole("button", { name: "Refresh interpretation" }).click();
  await expect(
    panel.getByRole("heading", { name: "Proposed brief" }),
  ).toBeVisible();
  await expect(
    panel.getByText("Bouncing motion is unsupported.", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText("Source: Your description")).toBeVisible();
  const accept = panel.getByRole("button", {
    name: "Accept into design-system draft",
  });
  await page.getByLabel("Creative philosophy").fill("My unsaved philosophy");
  await expect(accept).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: /Field journal/ }).click();
  await expect(accept).toBeEnabled();
  stale = true;
  await accept.click();
  await expect(panel.getByRole("alert")).toContainText(
    "unsaved edits are retained",
  );
  await panel.getByRole("button", { name: "Refresh interpretation" }).click();
  await expect(panel.getByText(/belongs to an older revision/)).toBeVisible();
  await expect(accept).toBeDisabled();
  stale = false;
  await panel.getByRole("button", { name: "Refresh interpretation" }).click();
  await accept.click();
  await expect(
    page.getByRole("textbox", { name: "Rule 1", exact: true }),
  ).toHaveValue("Avoid decorative icons", { timeout: 15000 });
  await expect(panel.getByRole("status")).toContainText("Accepted");
  await mkdir("output/playwright", { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.addStyleTag({content:"header { position: static !important; }"});
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      await page.locator("body").evaluate((el) => el.clientWidth),
    );
    await panel.screenshot({
      path: `output/playwright/st124-interpretation-${width}.png`,
    });
  }
});

test("manual systems retain edits through conflicts and expose exact locks and import recovery", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "avlp_session",
      value: "design-system-test",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  let system = {
    id,
    name: "Field journal",
    revision: 1,
    archivedAt: null,
    definition: {
      schemaVersion: "1.1",
      philosophy: "Relationships before decoration",
      rules: [],
      assetIds: [fontId],
      presentation,
    },
  };
  let conflict = true;
  const assets = [
    {
      id: fontId,
      kind: "font",
      mediaType: "font/otf",
      originalName: "Journal Regular.otf",
      status: "active",
      validatedSha256: "a".repeat(64),
      rejectionCode: null,
      inspection: {},
      validationJob: null,
      recovery: null,
    },
    {
      id,
      kind: "guide",
      mediaType: "text/markdown",
      originalName: "guide.md",
      status: "rejected",
      validatedSha256: null,
      rejectionCode: "unsafe_file",
      inspection: {},
      validationJob: null,
      recovery: "upload_again",
    },
  ];
  await page.route(
    /http:\/\/(?:127\.0\.0\.1|localhost):300[12]\/design-systems(?:\/.*)?$/,
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/interpretations") && request.method() === "GET") {
        await route.fulfill({ json: [] });
        return;
      }
      if (path.endsWith("/uploads") && request.method() === "POST") {
        expect(request.postDataJSON()).toMatchObject({
          kind: "font",
          rightsConfirmed: true,
        });
        await route.fulfill({
          json: {
            assetId: id,
            upload: {
              url: "https://st123.example/upload",
              requiredHeaders: { "content-type": "font/otf" },
            },
          },
        });
        return;
      }
      if (path.endsWith("/complete")) {
        await route.fulfill({ status: 202, json: {} });
        return;
      }
      if (request.method() === "PUT") {
        if (conflict) {
          conflict = false;
          system = { ...system, revision: 2 };
          await route.fulfill({ status: 409, json: {} });
          return;
        }
        const data = request.postDataJSON() as typeof system & {
          expectedRevision: number;
        };
        expect(data.expectedRevision).toBe(2);
        system = {
          ...system,
          name: data.name,
          definition: data.definition,
          revision: 3,
        };
        await route.fulfill({ json: system });
        return;
      }
      await route.fulfill({
        json:
          path === "/design-systems"
            ? [system]
            : { system, assets, versions: [], nextBeforeRevision: null },
      });
    },
  );
  await page.route("https://st123.example/upload", async (route) => {
    expect(route.request().headers()["content-type"]).toBe("font/otf");
    await route.fulfill({ status: 200 });
  });
  await page.goto("/workspace/design-systems");
  await page.getByRole("button", { name: /Field journal/ }).click();
  await expect(page.getByLabel("Creative philosophy")).toHaveValue(
    "Relationships before decoration",
  );
  await expect(
    page.getByText("Upload again to retry", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Creative philosophy")
    .fill("My local philosophy stays here");
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(page.locator("p[role=alert]")).toContainText(
    "unsaved edits are retained",
  );
  await page
    .getByRole("button", { name: "Keep edits and load latest revision" })
    .click();
  await expect(page.getByLabel("Creative philosophy")).toHaveValue(
    "My local philosophy stays here",
  );
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Revision saved");
  await page
    .getByLabel("Project for import processing")
    .selectOption("019ffbf1-610e-738a-b087-6775ff97568c");
  await page.getByLabel("File", { exact: true }).setInputFiles({
    name: "OwnFont.otf",
    mimeType: "font/otf",
    buffer: Buffer.from(
      "a mock upload; byte inspection belongs to the worker tests",
    ),
  });
  await page.getByLabel("I have rights to use this file").check();
  await page.getByRole("button", { name: "Import and validate" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Import queued for validation",
  );
  await page
    .getByRole("button", { name: "Add principle or requirement" })
    .click();
  await page
    .getByLabel("Rule 1", { exact: true })
    .fill("Use an unsupported animation engine");
  await page.getByLabel("Enforcement").selectOption("locked");
  await expect(page.getByText(/Resolve locked requirement/)).toBeVisible();
  await page.getByLabel("Creative philosophy").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Heading font")).toBeFocused();
  await mkdir("output/playwright", { recursive: true });
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 640, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `output/playwright/st123-editor-${viewport.width}.png`,
      fullPage: true,
    });
  }
});

test("failed list reads have an actionable error and usable create control", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "avlp_session",
      value: "design-system-test",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  await page.route(
    /http:\/\/(?:127\.0\.0\.1|localhost):300[12]\/design-systems$/,
    (route) => route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/workspace/design-systems");
  await expect(page.locator("p[role=alert]")).toContainText("Reload the page");
  await expect(
    page.getByRole("button", { name: "Create design system" }),
  ).toBeEnabled();
});
