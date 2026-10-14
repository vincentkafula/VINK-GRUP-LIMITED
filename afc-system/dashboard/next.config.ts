import path from "node:path";
import type { NextConfig } from "next";

const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  // a self-contained build for the Docker image; the workspace root is pinned so the output layout is the same on every machine
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, ".."),
  agentRules: false,
} as NextConfig;

export default config;
