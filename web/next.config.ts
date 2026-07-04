import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // We have a lockfile at the repo root (pipeline scripts) and one here; pin the
  // Turbopack workspace root to this app to silence the inferred-root warning.
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
