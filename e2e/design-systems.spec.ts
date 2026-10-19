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
