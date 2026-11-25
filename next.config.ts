import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server for the container image (Dockerfile sets this); `next start` locally stays as is.
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
