import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Monorepo: lockfile lives at repo root; keep Turbopack rooted on this app
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
