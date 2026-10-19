import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "design-systems.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100" },
  webServer: [
    {
      command: "node e2e/workspace-mock-api.mjs",
      url: "http://127.0.0.1:3002/health",
      reuseExistingServer: true,
    },
    {
      command: "pnpm --filter @avlp/web dev --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100",
      env: {
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:3002",
        NEXT_BUILD_DIR: ".next-design-systems-e2e",
      },
      reuseExistingServer: false,
      timeout: 180000,
    },
  ],
});
