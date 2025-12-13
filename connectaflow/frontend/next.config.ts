import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "172.20.10.2:3000"]
    }
  }
};

export default nextConfig;
