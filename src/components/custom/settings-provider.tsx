"use client"

import { useEffect, useMemo, useState, createContext, useContext } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckIcon, LogOutIcon, Settings2Icon, Trash2Icon, UserPenIcon, UserXIcon, XIcon } from "lucide-react"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { Switch } from "@/components/ui/switch"
import { accountDeletePhrase } from "@/lib/account-deletion"
import { apiV2 } from "@/lib/api"
import { validatePlayerName } from "@/lib/player-name"

type SettingsContextValue = {
  disableSubmissionThumbnails: boolean
  setDisableSubmissionThumbnails: (value: boolean) => void
}

type SettingsUser = {
  uuid: string
  player_id: string
  discord_avatar?: string | null
  discord_discriminator?: string | null
  player_name: string
  score: number
  permission: number
}

type AccountResponse = {
  data?: { user?: SettingsUser }
  error?: {
    code?: string
    message?: string
    details?: {
      retry_after?: number
    } | null
  }
}

type RateLimitResponse = {
  error?: {
    code?: string
    details?: {
      retry_after?: number
    } | null
  }
}

const STORAGE_KEY = "wasans:ui-settings:v1"

const SettingsContext = createContext<SettingsContextValue | null>(null)

function formatCooldown(value: number) {
  const seconds = Number.isFinite(value) && value > 0 ? Math.ceil(value) : 60

  if (seconds >= 3600) {
    const hours = Math.ceil(seconds / 3600)
    return `${hours} ${hours === 1 ? "hour" : "hours"}`
  }

  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60)
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`
  }

  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [disableSubmissionThumbnails, setDisableSubmissionThumbnails] = useState(() => {
    if (typeof window === "undefined") {
      return false
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return false
      }
      const parsed = JSON.parse(raw) as { disableSubmissionThumbnails?: boolean }
      return Boolean(parsed.disableSubmissionThumbnails)
    } catch {
      // Ignore invalid local settings and keep defaults.
      return false
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          disableSubmissionThumbnails,
        })
      )
    } catch {
      // Ignore storage failures (private mode / browser limits).
    }
  }, [disableSubmissionThumbnails])

  const value = useMemo(
    () => ({ disableSubmissionThumbnails, setDisableSubmissionThumbnails }),
    [disableSubmissionThumbnails]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  return useContext(SettingsContext)
}

export function FloatingSettingsModal({
  user,
  onLogout,
  onUserUpdate,
}: {
  user?: SettingsUser | null
  onLogout?: () => void
  onUserUpdate?: (user: SettingsUser) => void
}) {
  const router = useRouter()
  const settings = useSettings()
  const [updatingScore, setUpdatingScore] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [playerName, setPlayerName] = useState("")
  const [loggingOut, setLoggingOut] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteText, setDeleteText] = useState("")
  const [accountError, setAccountError] = useState<string | null>(null)

  if (!settings) {
    return null
  }

  const updateScore = async () => {
    if (updatingScore) {
      return
    }

    setUpdatingScore(true)

    const response = await fetch(apiV2("/auth/me/score"), {
      method: "POST",
      cache: "no-store",
    }).catch(() => null)

    if (response?.status === 429) {
      const json = (await response.json().catch(() => null)) as RateLimitResponse | null
      const wait = Number(json?.error?.details?.retry_after ?? response.headers.get("retry-after") ?? 60)
      const seconds = Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : 60

      toast.warning(`Ratelimit, try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}`)
    }

    setUpdatingScore(false)
  }

  const startNameEdit = () => {
    setPlayerName(user?.player_name || "")
    setEditingName(true)
    setAccountError(null)
  }

  const cancelNameEdit = () => {
    setPlayerName(user?.player_name || "")
    setEditingName(false)
    setAccountError(null)
  }

  const saveName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!user || savingName) {
      return
    }

    const name = validatePlayerName(playerName)
    if (!name.ok) {
      setAccountError(name.message)
      return
    }

    if (name.playerName === user.player_name) {
      setPlayerName(name.playerName)
      setEditingName(false)
      setAccountError(null)
      return
    }

    setSavingName(true)
    setAccountError(null)

    try {
      const response = await fetch(apiV2("/account"), {
        method: "PATCH",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player_name: playerName }),
      })
      const json = (await response.json().catch(() => null)) as AccountResponse | null

      if (!response.ok) {
        if (response.status === 429 && json?.error?.code === "rate_limited") {
          const wait = Number(json?.error?.details?.retry_after ?? response.headers.get("retry-after") ?? 60 * 60)
          throw new Error(`You can change your username again in ${formatCooldown(wait)}.`)
        }

        throw new Error(json?.error?.message || "Username update failed")
      }

      const nextUser = json?.data?.user || { ...user, player_name: name.playerName }
      onUserUpdate?.(nextUser)
      setPlayerName(nextUser.player_name)
      setEditingName(false)
      router.refresh()
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Username update failed")
    } finally {
      setSavingName(false)
    }
  }

  const logout = async () => {
    if (loggingOut) {
      return
    }

    setLoggingOut(true)
    setAccountError(null)

    try {
      const response = await fetch(apiV2("/auth/logout"), {
        method: "POST",
        cache: "no-store",
      })

      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(json?.error?.message || "Logout failed")
      }

      window.localStorage.removeItem("player_uuid")
      onLogout?.()
      window.location.assign("/")
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Logout failed")
      setLoggingOut(false)
    }
  }

  const runAccountAction = async (action: "deactivate" | "delete") => {
    if ((action === "deactivate" && deactivating) || (action === "delete" && deleting)) {
      return
    }

    setAccountError(null)

    if (action === "delete" && deleteText !== accountDeletePhrase) {
      setAccountError(`Type ${accountDeletePhrase} to confirm.`)
      return
    }

    if (action === "deactivate") {
      setDeactivating(true)
    } else {
      setDeleting(true)
    }

    try {
      const response = await fetch(apiV2(action === "deactivate" ? "/account/deactivate" : "/account"), {
        method: action === "deactivate" ? "POST" : "DELETE",
        cache: "no-store",
        headers: action === "delete" ? { "content-type": "application/json" } : undefined,
        body: action === "delete" ? JSON.stringify({ confirmation: deleteText }) : undefined,
      })

      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(json?.error?.message || "Account update failed")
      }

      window.localStorage.removeItem("player_uuid")
      window.location.assign("/")
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Account update failed")
      setDeactivating(false)
      setDeleting(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <SidebarMenuButton type="button" className="cursor-pointer" aria-label="Open settings">
          <Settings2Icon className="size-4" />
          <span className="truncate">Settings</span>
        </SidebarMenuButton>
      </DialogTrigger>

      <DialogContent
        className="w-[calc(100%-2rem)] max-w-md"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Disable submission thumbnails</p>
              <p className="text-xs text-muted-foreground">Prevents preview videos from loading in submission cards.</p>
            </div>
            <Switch
              className="cursor-pointer"
              checked={settings.disableSubmissionThumbnails}
              onCheckedChange={settings.setDisableSubmissionThumbnails}
              aria-label="Disable submission thumbnails"
            />
          </div>
        </div>

        {user ? (
          <>
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Update score</p>
                  <p className="text-xs text-muted-foreground">Recalculate from your personal bests.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={updatingScore}
                  onClick={updateScore}
                >
                  Update score
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Account</p>
                  <p className="text-xs text-muted-foreground">Logged in as {user.player_name}.</p>
                </div>

                {accountError ? <p className="text-xs text-destructive">{accountError}</p> : null}

                {editingName ? (
                  <form className="grid gap-2" onSubmit={saveName}>
                    <label className="grid gap-1.5 text-sm">
                      <span className="text-xs text-muted-foreground">Username</span>
                      <Input
                        value={playerName}
                        onChange={(event) => setPlayerName(event.target.value)}
                        disabled={savingName}
                        autoComplete="nickname"
                        aria-invalid={Boolean(accountError)}
                      />
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button type="submit" size="sm" disabled={savingName}>
                        <CheckIcon />
                        {savingName ? "Saving..." : "Save"}
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={savingName} onClick={cancelNameEdit}>
                        <XIcon />
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  {!editingName ? (
                    <Button type="button" variant="outline" size="sm" disabled={loggingOut || deactivating || deleting} onClick={startNameEdit}>
                      <UserPenIcon />
                      Change username
                    </Button>
                  ) : null}

                  <Button type="button" variant="outline" size="sm" disabled={savingName || loggingOut || deactivating || deleting} onClick={logout}>
                    <LogOutIcon />
                    {loggingOut ? "Logging out..." : "Log out"}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="outline" size="sm" disabled={savingName || loggingOut || deactivating || deleting}>
                        <UserXIcon />
                        Deactivate
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent size="sm">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate account?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This hides your account from player lists and logs you out. Logging in with Discord again reactivates it.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={deactivating}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          disabled={deactivating}
                          onClick={(event) => {
                            event.preventDefault()
                            void runAccountAction("deactivate")
                          }}
                        >
                          Deactivate
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog
                    onOpenChange={(open) => {
                      if (open) {
                        setAccountError(null)
                      } else {
                        setDeleteText("")
                      }
                    }}
                  >
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="destructive" size="sm" disabled={savingName || loggingOut || deactivating || deleting}>
                        <Trash2Icon />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete account?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-3 text-left">
                            <p>This is permanent. Your Discord login/account data and sessions will be deleted, and you will be logged out.</p>
                            <ul className="list-disc space-y-1 pl-5">
                              <li>Public submissions, scores, PBs, WRs, and proof videos will stay public.</li>
                              <li>Public records connected to this account will show as Deleted Account.</li>
                              <li>This does not delete proof videos from R2.</li>
                            </ul>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <label className="grid gap-2 text-sm">
                        <span className="text-muted-foreground">Type {accountDeletePhrase} to confirm.</span>
                        <Input
                          value={deleteText}
                          onChange={(event) => setDeleteText(event.target.value)}
                          disabled={deleting}
                          autoComplete="off"
                          aria-invalid={deleteText.length > 0 && deleteText !== accountDeletePhrase}
                        />
                      </label>
                      {accountError ? <p className="text-xs text-destructive">{accountError}</p> : null}
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          disabled={deleting || deleteText !== accountDeletePhrase}
                          onClick={(event) => {
                            event.preventDefault()
                            void runAccountAction("delete")
                          }}
                        >
                          {deleting ? "Deleting..." : "Delete forever"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <p className="text-[11px] leading-5 text-muted-foreground">
                  See the{" "}
                  <Link href="/terms" className="underline underline-offset-3">Terms</Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="underline underline-offset-3">Privacy Policy</Link>.
                </p>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
