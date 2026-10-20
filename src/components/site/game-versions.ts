"use client"

import { apiV2 } from "@/lib/api"
import { useApi } from "@/hooks/use-api"

// The owner-kept list of game versions, newest first (see
// /v2/admin/versions). New runs are stamped with the first one.
export type GameVersion = { name: string; created_at: number; created_by: string | null; run_count: number }

export const VERSIONS_URL = apiV2("/admin/versions")

export function useGameVersions(enabled = true) {
  return useApi<{ data?: { versions?: GameVersion[] } }>(enabled ? VERSIONS_URL : null)
}
