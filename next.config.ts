import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  devIndicators: false,
  // Pages that moved in the redesign. Old links keep working: /wrs is in
  // every WR compilation's YouTube description. Temporary (307) while the
  // redesign is still settling, so browsers don't cache them for good.
  async redirects() {
    return [
      { source: "/players", destination: "/leaderboard", permanent: false },
      { source: "/wrs", destination: "/trials", permanent: false },
      { source: "/wrs/history", destination: "/trials", permanent: false },
      { source: "/submissions/new", destination: "/submit", permanent: false },
      { source: "/combos/new", destination: "/submit?type=combo", permanent: false },
    ];
  },
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
