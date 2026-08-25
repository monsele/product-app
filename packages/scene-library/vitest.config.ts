import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Layout assertions launch Chromium and need headroom during parallel CI runs.
    testTimeout: 60_000,
  },
});
