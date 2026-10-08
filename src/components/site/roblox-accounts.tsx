"use client"

import { ExternalLinkIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useApi } from "@/hooks/use-api"

type RobloxAccount = {
  user_id: string
  username: string | null
  display_name: string | null
  profile_url: string
}

type RobloxAccountsResponse = { data?: { accounts?: RobloxAccount[] } }

// For moderators: the submitter's linked Roblox accounts, display name first
// because that's the name shown in-game, so the one to look for in the video.
export function RobloxAccounts({ playerUuid, className }: { playerUuid: string; className?: string }) {
  const { data, error, loading } = useApi<RobloxAccountsResponse>(
    apiV2(`/players/${encodeURIComponent(playerUuid)}/roblox-accounts`)
  )
  const accounts = data?.data?.accounts ?? []

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="label-caps text-[13px] text-subtle-foreground">
        Roblox {accounts.length === 1 ? "account" : "accounts"}
      </span>
      {loading ? (
        <span className="text-sm text-muted-foreground">Loading…</span>
      ) : error && !data ? (
        <span className="text-sm text-destructive">{error}</span>
      ) : accounts.length === 0 ? (
        <span className="text-sm text-destructive">None linked to this player</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {accounts.map((account) => (
            <li key={account.user_id}>
              <a
                href={account.profile_url}
                target="_blank"
                rel="noreferrer noopener"
                title={`Roblox user id ${account.user_id}`}
                className="group inline-flex items-center gap-1.5 text-sm hover:underline hover:underline-offset-4"
              >
                <span className="font-medium">{account.display_name || account.username || account.user_id}</span>
                {account.username ? <span className="text-muted-foreground">@{account.username}</span> : null}
                <ExternalLinkIcon className="size-3 text-subtle-foreground group-hover:text-foreground" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
