"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import { openSettings } from "@/lib/linked-accounts"

const providerLabels: Record<string, string> = {
  discord: "Discord",
  google: "Google",
  roblox: "Roblox",
}

// The OAuth callbacks report back through query params on the page they
// return to: ?linked=<provider> / ?link_error=<message> after linking an
// account from Settings, ?auth_error=<message> after a failed login. Shows
// them once, reopens Settings after a link so the player sees the result in
// context, and strips the params so a reload doesn't repeat them.
export function AuthResultToast() {
  useEffect(() => {
    const url = new URL(window.location.href)
    const linked = url.searchParams.get("linked")
    const linkError = url.searchParams.get("link_error")
    const authError = url.searchParams.get("auth_error")

    if (!linked && !linkError && !authError) {
      return
    }

    if (linked) {
      toast.success(`${providerLabels[linked] || "Account"} account linked`)
    }
    if (linkError) {
      toast.error(linkError)
    }
    if (authError) {
      toast.error(authError)
    }
    if (linked || linkError) {
      openSettings()
    }

    url.searchParams.delete("linked")
    url.searchParams.delete("link_error")
    url.searchParams.delete("auth_error")
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
  }, [])

  return null
}
