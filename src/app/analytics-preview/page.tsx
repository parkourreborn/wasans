"use client"

// TEMPORARY: renders /analytics against synthetic data with fetch stubbed,
// so nothing reaches the real API. Delete before committing.
import { Suspense } from "react"
import { AnalyticsPage } from "@/components/site/analytics/analytics-page"
import publicData from "./public.json"
import trialData from "./trial.json"
import staffData from "./staff.json"
import players from "./players.json"

const me = { uuid: "player-17", player_id: "17", player_name: "Player 17", score: (players as Record<string, { score: number }>)["player-17"].score, permission: 4 }

if (typeof window !== "undefined" && !(window as unknown as { __stubbed?: boolean }).__stubbed) {
  ;(window as unknown as { __stubbed?: boolean }).__stubbed = true
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  window.fetch = async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin)
    const path = url.pathname
    if (path === "/v2/analytics") return json({ data: { ...publicData, range: url.searchParams.get("range") ?? "30d" } })
    if (path.startsWith("/v2/analytics/trials/")) {
      return json({ data: { ...trialData, trial_name: decodeURIComponent(path.split("/").pop() ?? "") } })
    }
    if (path === "/v2/analytics/staff") return json({ data: { ...staffData, range: url.searchParams.get("range") ?? "30d" } })
    if (path.startsWith("/v2/players/")) {
      const uuid = decodeURIComponent(path.split("/")[3])
      return json({ data: { player: (players as Record<string, unknown>)[uuid] ?? null } })
    }
    if (path === "/v2/auth/me" || path === "/v2/auth/refresh") return json({ data: { user: me } })
    return json({ data: [] })
  }
}

export default function Preview() {
  return (
    <Suspense fallback={null}>
      <AnalyticsPage />
    </Suspense>
  )
}
