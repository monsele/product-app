import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:3000" },
  webServer: [
    {
      command: "node e2e/workspace-mock-api.mjs",
      url: "http://127.0.0.1:3002/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm --filter @avlp/web dev --hostname 127.0.0.1",
      url: "http://127.0.0.1:3000",
      env: { NEXT_PUBLIC_API_URL: "http://127.0.0.1:3002" },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
