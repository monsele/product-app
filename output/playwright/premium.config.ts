import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "../../e2e",
  testMatch: "ui-design-preview.spec.ts",
  timeout: 120_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3000" },
});
