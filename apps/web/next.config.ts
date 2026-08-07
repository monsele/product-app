import type { NextConfig } from "next";
import { parseWebEnvironment } from "@avlp/config";

parseWebEnvironment(process.env);

const nextConfig: NextConfig = {};

export default nextConfig;
