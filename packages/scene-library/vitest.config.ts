import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Layout assertions launch Chromium and need headroom during parallel CI runs.
    testTimeout: 120_000,
    hookTimeout: 300_000,
    /**
     * ST-094: most files in this package bundle a Remotion entry point and
     * launch a headless browser. Running them in parallel oversubscribes the
     * machine and makes unrelated suites (caption safe-area checks, the preview
     * playback clock) fail on timeout rather than on their own assertions.
     * Files run one at a time so a failure here means a real defect.
     */
    fileParallelism: false,
  },
});
