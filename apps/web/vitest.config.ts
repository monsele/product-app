import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Browser-backed component checks can share a busy CI host with Remotion.
    // Allow the slower accessibility and multi-viewport checks to complete
    // rather than treating host contention as a product failure.
    testTimeout: 60_000,
  },
});
