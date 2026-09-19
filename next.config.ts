import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants.js";
import { serverConfig } from "./runtime/next-options.mjs";

const nextConfig = (phase: string): NextConfig => ({
  ...serverConfig,
  output: phase === PHASE_PRODUCTION_BUILD ? "standalone" : undefined,
});

export default nextConfig;
