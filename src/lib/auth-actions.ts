"use client"

import { apiV2 } from "@/lib/api"
import { setAuthSessionUser } from "@/lib/auth-session"

// Ends the session and reloads on the home page, so nothing rendered for
// the signed-in player survives. Throws with a readable message on failure.
export async function logout() {
  const response = await fetch(apiV2("/auth/logout"), { method: "POST", cache: "no-store" })

  if (!response.ok) {
    const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(json?.error?.message || "Logging out failed. Try again.")
  }

  try {
    window.localStorage.removeItem("player_uuid")
  } catch {
    // Storage blocked; nothing to clean up.
  }
  setAuthSessionUser(null)
  window.location.assign("/")
}

export function permissionLabel(permission: number) {
  if (permission >= 4) return "Owner"
  if (permission >= 3) return "Senior moderator"
  if (permission >= 2) return "Junior moderator"
  if (permission >= 1) return "Combo moderator"
  return "Member"
}
