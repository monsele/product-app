import type { NextConfig } from "next";
import { parseWebEnvironment } from "@avlp/config";

parseWebEnvironment(process.env);

const nextConfig: NextConfig = {
  // Import only the icons a page uses instead of compiling the entire catalog.
  experimental: { optimizePackageImports: ["@phosphor-icons/react"] },
};

export default nextConfig;
