import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Browser-backed component checks can share a busy CI host with Remotion.
    testTimeout: 20_000,
  },
});
