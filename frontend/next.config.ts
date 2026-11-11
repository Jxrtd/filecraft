import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_URL || "http://localhost:8000"}/api/:path*`,
      },
    ];
  },
  experimental: { proxyClientMaxBodySize: "65mb" },
};
export default config;
