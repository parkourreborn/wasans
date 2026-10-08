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
      // The calculator is part of Compare now; its ?player_uuid= carries over.
      { source: "/calculator", destination: "/compare", permanent: false },
      // The account that used to be stored as player "0" (migration 0021).
      { source: "/players/0", destination: "/players/54779346-1692-4dee-bfaf-69ed84464e63", permanent: true },
    ];
  },
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
