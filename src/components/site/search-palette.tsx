"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Command as CommandPrimitive } from "cmdk"
import { SearchIcon, TimerIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { formatScore } from "@/lib/format"
import { tierForScore } from "@/lib/tiers"
import { trialHref } from "@/lib/trial-slug"
import { useApi } from "@/hooks/use-api"
import { useTrialOrder } from "@/hooks/use-trial-order"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { TierLabel } from "@/components/site/tier-label"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

type SearchPlayer = {
  uuid: string
  player_name: string
  score: number
  rank?: number
  discord_id?: string | null
  discord_avatar?: string | null
  discord_discriminator?: string | null
  has_roblox_avatar?: number | null
}

type PlayersResponse = { data?: SearchPlayer[] }

const itemClass =
  "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-[15px] outline-none data-[selected=true]:bg-surface-3"

export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const { orderedTrialNames } = useTrialOrder()
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 180)
    return () => window.clearTimeout(timer)
  }, [query])

  const playersUrl = debounced ? `${apiV2("/players")}?search=${encodeURIComponent(debounced)}&limit=8` : null
  const { data, loading, error } = useApi<PlayersResponse>(playersUrl)
  const players = playersUrl ? data?.data ?? [] : []
  const waiting = query.trim() !== debounced || loading

  const trials = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return []
    }
    return orderedTrialNames.filter((trial) => trial.toLowerCase().includes(needle)).slice(0, 6)
  }, [orderedTrialNames, query])

  const close = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setQuery("")
      setDebounced("")
    }
  }

  const go = (href: string) => {
    close(false)
    router.push(href)
  }

  const hasQuery = query.trim().length > 0
  const nothingFound = hasQuery && !waiting && trials.length === 0 && players.length === 0

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden border border-line-strong bg-surface-2 p-0 ring-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Find a player or a trial and go to its page.</DialogDescription>
        <CommandPrimitive shouldFilter={false} loop className="flex flex-col">
          <div className="flex items-center gap-3 border-b border-line px-4">
            <SearchIcon className="size-5 shrink-0 text-subtle-foreground" aria-hidden />
            <CommandPrimitive.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search players and trials"
              className="h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-subtle-foreground"
            />
            <kbd className="hidden rounded border border-line-strong px-1.5 py-0.5 font-mono text-[11px] text-subtle-foreground sm:block">
              Esc
            </kbd>
          </div>

          <CommandPrimitive.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
            {!hasQuery ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Type a player&apos;s name or a trial.
              </p>
            ) : null}

            {trials.length > 0 ? (
              <CommandPrimitive.Group
                heading="Trials"
                className="[&_[cmdk-group-heading]]:label-caps [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[13px] [&_[cmdk-group-heading]]:text-subtle-foreground"
              >
                {trials.map((trial) => (
                  <CommandPrimitive.Item key={trial} value={`trial:${trial}`} onSelect={() => go(trialHref(trial))} className={itemClass}>
                    <span className="flex size-7 items-center justify-center rounded-md bg-surface-3 text-muted-foreground">
                      <TimerIcon className="size-4" aria-hidden />
                    </span>
                    <span className="font-medium">{trial}</span>
                    <span className="ml-auto text-sm text-subtle-foreground">Trial</span>
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            ) : null}

            {players.length > 0 ? (
              <CommandPrimitive.Group
                heading="Players"
                className="[&_[cmdk-group-heading]]:label-caps [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[13px] [&_[cmdk-group-heading]]:text-subtle-foreground"
              >
                {players.map((player) => (
                  <CommandPrimitive.Item
                    key={player.uuid}
                    value={`player:${player.uuid}`}
                    onSelect={() => go(`/players/${encodeURIComponent(player.uuid)}`)}
                    className={itemClass}
                  >
                    <PlayerAvatar
                      size="sm"
                      className="size-7"
                      playerName={player.player_name}
                      playerUuid={player.uuid}
                      hasRobloxAvatar={player.has_roblox_avatar}
                      discordId={player.discord_id}
                      discordAvatar={player.discord_avatar}
                      discordDiscriminator={player.discord_discriminator}
                    />
                    <span className="min-w-0 truncate font-medium">{player.player_name}</span>
                    <TierLabel tier={tierForScore(Number(player.score))} className="hidden text-[13px] sm:inline" />
                    <span className="num ml-auto flex items-center gap-3 text-sm">
                      {player.rank ? <span className="text-subtle-foreground">#{player.rank}</span> : null}
                      <span>{formatScore(player.score)}</span>
                    </span>
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            ) : null}

            {hasQuery && waiting && players.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">Searching players…</p>
            ) : null}

            {hasQuery && !waiting && error ? (
              <p className="px-3 py-4 text-sm text-destructive">Couldn&apos;t search players right now.</p>
            ) : null}

            {nothingFound && !error ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No players or trials match &ldquo;{query.trim()}&rdquo;.
              </p>
            ) : null}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  )
}

// "/" anywhere outside a text field, or Ctrl/Cmd+K, opens search.
export function useSearchShortcut(onOpen: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"

      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onOpen()
        return
      }

      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        onOpen()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onOpen])
}
