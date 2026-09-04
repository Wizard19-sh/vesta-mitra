import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/admin/beta": [
      "./scripts/verify-w4-meta-live.mjs",
      "./scripts/verify-w4-meta-tarla-live.mjs",
    ],
  },
};

export default nextConfig;
