"use client"

import { useEffect, useState } from "react"
import { apiV2 } from "@/lib/api"

type RobloxAccount = {
  user_id: string
  username: string | null
  display_name: string | null
  profile_url: string
}

type RobloxAccountsResponse = { data?: { accounts?: RobloxAccount[] }; error?: { message?: string } }

// For moderators: the submitter's linked Roblox accounts, display name
// first because that is the name shown in-game (and so in the video).
export function SubmitterRobloxAccounts({ playerUuid }: { playerUuid: string }) {
  const [accounts, setAccounts] = useState<RobloxAccount[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(apiV2(`/players/${encodeURIComponent(playerUuid)}/roblox-accounts`), { cache: "no-store" })
        const json = (await response.json().catch(() => null)) as RobloxAccountsResponse | null
        if (!response.ok) {
          throw new Error(json?.error?.message || "Unable to load Roblox accounts")
        }
        if (!cancelled) {
          setAccounts(json?.data?.accounts || [])
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load Roblox accounts")
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [playerUuid])

  if (error) {
    return <p className="text-center text-sm text-destructive">{error}</p>
  }

  if (!accounts) {
    return <p className="text-center text-sm text-muted-foreground">Loading linked Roblox accounts...</p>
  }

  if (accounts.length === 0) {
    return <p className="text-center text-sm text-destructive">No Roblox account linked to this player.</p>
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm">
      <span className="text-muted-foreground">Linked Roblox {accounts.length === 1 ? "account" : "accounts"}:</span>
      {accounts.map((account) => (
        <a
          key={account.user_id}
          href={account.profile_url}
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-4"
          title={`Roblox user id ${account.user_id}`}
        >
          <span className="font-medium">{account.display_name || account.username || account.user_id}</span>
          {account.username ? <span className="text-muted-foreground"> (@{account.username})</span> : null}
        </a>
      ))}
    </div>
  )
}
