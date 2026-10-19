import type { NextConfig } from "next";
import { parseWebEnvironment } from "@avlp/config";

parseWebEnvironment(process.env);

const nextConfig: NextConfig = {
  // Keep browser-test compilation separate from a teacher's running dev server.
  distDir: process.env.NEXT_BUILD_DIR ?? ".next",
  // Import only the icons a page uses instead of compiling the entire catalog.
  experimental: { optimizePackageImports: ["@phosphor-icons/react"] },
};

export default nextConfig;
