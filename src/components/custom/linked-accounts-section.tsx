"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { CheckIcon, Link2Icon, PlusIcon, Unlink2Icon } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { apiV2 } from "@/lib/api"
import { getNameInitials } from "@/lib/discord-avatar"

type Provider = "discord" | "google" | "roblox"

type LinkedAccount = {
  provider: Provider
  account_id: string
  username: string | null
  display_name: string | null
  linked_at: number
  is_avatar: boolean
}

type ConnectionsResponse = {
  data?: { connections?: LinkedAccount[]; roblox_required_to_submit?: boolean; authorize_url?: string }
  error?: { message?: string }
}

const providerLabels: Record<Provider, string> = {
  discord: "Discord",
  google: "Google",
  roblox: "Roblox",
}

async function fetchConnections(): Promise<{ connections: LinkedAccount[]; robloxRequired: boolean } | { error: string }> {
  try {
    const response = await fetch(apiV2("/account/connections"), { cache: "no-store" })
    const json = (await response.json().catch(() => null)) as ConnectionsResponse | null
    if (!response.ok) {
      return { error: json?.error?.message || "Unable to load linked accounts" }
    }
    return { connections: json?.data?.connections || [], robloxRequired: Boolean(json?.data?.roblox_required_to_submit) }
  } catch {
    return { error: "Unable to load linked accounts" }
  }
}

function currentPath() {
  return `${window.location.pathname}${window.location.search}`
}

// Settings > Linked accounts: one Discord, one Google, any number of Roblox
// accounts, any of which logs in to this account. Also where the avatar is
// picked from the linked Roblox accounts' headshots.
export function LinkedAccountsSection({ onAvatarChange }: { onAvatarChange?: () => void }) {
  const [connections, setConnections] = useState<LinkedAccount[] | null>(null)
  const [robloxRequired, setRobloxRequired] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetchConnections().then((result) => {
      if (cancelled) {
        return
      }
      if ("error" in result) {
        setLoadError(result.error)
        return
      }
      setConnections(result.connections)
      setRobloxRequired(result.robloxRequired)
      setLoadError(null)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const link = async (provider: Provider) => {
    setBusy(`link:${provider}`)
    try {
      const response = await fetch(apiV2("/account/connections"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, next: currentPath() }),
        cache: "no-store",
      })
      const json = (await response.json().catch(() => null)) as ConnectionsResponse | null
      const authorizeUrl = json?.data?.authorize_url
      if (!response.ok || !authorizeUrl) {
        throw new Error(json?.error?.message || `Unable to link ${providerLabels[provider]}`)
      }
      // Full-page, same-tab navigation, like login: the callback brings the
      // player back to this page with ?linked= or ?link_error=.
      window.location.assign(authorizeUrl)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Unable to link ${providerLabels[provider]}`)
      setBusy(null)
    }
  }

  const unlink = async (account: LinkedAccount) => {
    setBusy(`unlink:${account.provider}:${account.account_id}`)
    try {
      const response = await fetch(apiV2("/account/connections"), {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: account.provider, account_id: account.account_id }),
        cache: "no-store",
      })
      const json = (await response.json().catch(() => null)) as ConnectionsResponse | null
      if (!response.ok) {
        throw new Error(json?.error?.message || "Unable to unlink account")
      }
      setConnections(json?.data?.connections || [])
      toast.success(`${providerLabels[account.provider]} account unlinked`)
      onAvatarChange?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to unlink account")
    } finally {
      setBusy(null)
    }
  }

  const chooseAvatar = async (account: LinkedAccount) => {
    setBusy(`avatar:${account.account_id}`)
    try {
      const response = await fetch(apiV2("/account/avatar"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roblox_user_id: account.account_id }),
        cache: "no-store",
      })
      const json = (await response.json().catch(() => null)) as ConnectionsResponse | null
      if (!response.ok) {
        throw new Error(json?.error?.message || "Unable to change avatar")
      }
      setConnections((current) =>
        (current || []).map((item) => ({ ...item, is_avatar: item.provider === "roblox" && item.account_id === account.account_id }))
      )
      toast.success("Avatar updated. It can take a few minutes to show everywhere.")
      onAvatarChange?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to change avatar")
    } finally {
      setBusy(null)
    }
  }

  const isOnlyLogin = (connections?.length ?? 0) <= 1
  const robloxAccounts = (connections || []).filter((account) => account.provider === "roblox")
  const singleProviders: Array<"discord" | "google"> = ["discord", "google"]

  const unlinkButton = (account: LinkedAccount, label: string) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={Boolean(busy) || isOnlyLogin}
          title={isOnlyLogin ? "This is your only way to log in. Link another account first." : undefined}
        >
          <Unlink2Icon />
          Unlink
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Unlink {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            You won&apos;t be able to log in with it any more. You can link it again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void unlink(account)}>Unlink</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Linked accounts</p>
          <p className="text-xs text-muted-foreground">
            Log in with any of these. Link every Roblox account you submit runs on (alts are fine) so moderators can check the
            account in your video is yours.
          </p>
        </div>

        {loadError ? <p className="text-xs text-destructive">{loadError}</p> : null}
        {!connections && !loadError ? <p className="text-xs text-muted-foreground">Loading...</p> : null}

        {connections ? (
          <>
            {singleProviders.map((provider) => {
              const account = connections.find((item) => item.provider === provider)
              return (
                <div key={provider} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm">{providerLabels[provider]}</p>
                    <p className="text-xs text-muted-foreground">{account ? "Linked" : "Not linked"}</p>
                  </div>
                  {account ? (
                    unlinkButton(account, providerLabels[provider])
                  ) : (
                    <Button type="button" variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void link(provider)}>
                      <Link2Icon />
                      {busy === `link:${provider}` ? "Redirecting..." : "Link"}
                    </Button>
                  )}
                </div>
              )
            })}

            <div className="space-y-2 border-t border-border/70 pt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">Roblox</p>
                  <p className="text-xs text-muted-foreground">
                    {robloxAccounts.length === 0
                      ? robloxRequired
                        ? "Required before you can submit."
                        : "Not linked"
                      : "Pick which account's headshot is your avatar."}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void link("roblox")}>
                  <PlusIcon />
                  {busy === "link:roblox" ? "Redirecting..." : robloxAccounts.length ? "Add" : "Link"}
                </Button>
              </div>

              {robloxAccounts.map((account) => {
                const name = account.display_name || account.username || account.account_id
                return (
                  <div key={account.account_id} className="flex items-center justify-between gap-2 rounded-md border border-border/70 p-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar size="sm">
                        <AvatarImage
                          src={apiV2(`/account/connections/roblox/${encodeURIComponent(account.account_id)}/headshot`)}
                          alt={`${name} headshot`}
                        />
                        <AvatarFallback>{getNameInitials(name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm">{name}</p>
                        {account.username ? <p className="truncate text-xs text-muted-foreground">@{account.username}</p> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {account.is_avatar ? (
                        <Badge variant="secondary">
                          <CheckIcon />
                          Avatar
                        </Badge>
                      ) : (
                        <Button type="button" variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => void chooseAvatar(account)}>
                          Use as avatar
                        </Button>
                      )}
                      {unlinkButton(account, name)}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
