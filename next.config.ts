import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.1.37",
    "192.168.*.*",
    "10.*.*.*",
  ],
  serverExternalPackages: ["@google/genai"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "**/globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
