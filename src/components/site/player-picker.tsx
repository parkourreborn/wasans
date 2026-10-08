"use client"

import { useEffect, useState } from "react"
import { Command as CommandPrimitive } from "cmdk"
import { ChevronDownIcon, SearchIcon, XIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { formatScore } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useApi } from "@/hooks/use-api"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type PickedPlayer = {
  uuid: string
  player_name: string
  score: number
  rank?: number
  discord_id?: string | null
  discord_avatar?: string | null
  discord_discriminator?: string | null
  has_roblox_avatar?: number | null
}

type PlayersResponse = { data?: PickedPlayer[] }

const itemClass =
  "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-[15px] outline-none data-[selected=true]:bg-surface-3 data-[disabled=true]:cursor-default data-[disabled=true]:opacity-50"

function PlayerRow({ player, note }: { player: PickedPlayer; note?: string }) {
  return (
    <>
      <PlayerAvatar
        size="sm"
        className="size-7 rounded-md"
        playerName={player.player_name}
        playerUuid={player.uuid}
        hasRobloxAvatar={player.has_roblox_avatar}
        discordId={player.discord_id}
        discordAvatar={player.discord_avatar}
        discordDiscriminator={player.discord_discriminator}
      />
      <span className="min-w-0 truncate font-medium">{player.player_name}</span>
      {note ? <span className="label-caps text-[12px] text-primary">{note}</span> : null}
      <span className="num ml-auto flex items-center gap-3 text-sm">
        {player.rank ? <span className="text-subtle-foreground">#{player.rank}</span> : null}
        <span>{formatScore(player.score)}</span>
      </span>
    </>
  )
}

// Picks any player, searching the whole leaderboard rather than a preloaded
// page of it. With nothing typed it offers you and the top of the board.
export function PlayerPicker({
  value,
  onChange,
  placeholder,
  me,
  exclude,
  label,
  clearable = false,
}: {
  value: PickedPlayer | null
  onChange: (player: PickedPlayer | null) => void
  placeholder: string
  me?: PickedPlayer | null
  exclude?: string | null
  label: string
  clearable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 180)
    return () => window.clearTimeout(timer)
  }, [query])

  const searchUrl = debounced ? `${apiV2("/players")}?search=${encodeURIComponent(debounced)}&limit=10` : null
  const search = useApi<PlayersResponse>(open && searchUrl ? searchUrl : null)
  const top = useApi<PlayersResponse>(open && !searchUrl ? `${apiV2("/players")}?limit=8` : null)
  const waiting = query.trim() !== debounced || search.loading
  const results = (searchUrl ? search.data?.data : top.data?.data) ?? []
  const showMe = Boolean(me && !debounced && me.uuid !== exclude)

  const pick = (player: PickedPlayer) => {
    onChange(player)
    setOpen(false)
    setQuery("")
    setDebounced("")
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            setQuery("")
            setDebounced("")
          }
        }}
      >
        <PopoverTrigger
          aria-label={value ? `${label}: ${value.player_name}. Change player` : label}
          className={cn(
            "flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg border bg-surface px-3 text-left transition-colors hover:border-[#5a5a5a] sm:w-72 sm:flex-none",
            value ? "border-line-strong" : "border-dashed border-line-strong text-muted-foreground"
          )}
        >
          {value ? (
            <>
              <PlayerAvatar
                size="sm"
                className="size-7 rounded-md"
                playerName={value.player_name}
                playerUuid={value.uuid}
                hasRobloxAvatar={value.has_roblox_avatar}
                discordId={value.discord_id}
                discordAvatar={value.discord_avatar}
                discordDiscriminator={value.discord_discriminator}
              />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{value.player_name}</span>
              <span className="num text-sm text-muted-foreground">{formatScore(value.score)}</span>
            </>
          ) : (
            <>
              <SearchIcon className="size-4 text-subtle-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[15px]">{placeholder}</span>
            </>
          )}
          <ChevronDownIcon className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] gap-0 rounded-lg border border-line-strong bg-surface-2 p-0">
          <CommandPrimitive shouldFilter={false} loop label={label} className="flex flex-col">
            <div className="flex items-center gap-2.5 border-b border-line px-3">
              <SearchIcon className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
              <CommandPrimitive.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search any player"
                className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle-foreground"
              />
            </div>
            <CommandPrimitive.List className="max-h-[min(55vh,360px)] overflow-y-auto p-1.5">
              {showMe && me ? (
                <CommandPrimitive.Item value={`me:${me.uuid}`} onSelect={() => pick(me)} className={itemClass}>
                  <PlayerRow player={me} note="You" />
                </CommandPrimitive.Item>
              ) : null}
              {!debounced && results.length > 0 ? (
                <div className="label-caps px-2.5 pb-1 pt-2 text-[12px] text-subtle-foreground">Top of the leaderboard</div>
              ) : null}
              {results.map((player) => (
                <CommandPrimitive.Item
                  key={player.uuid}
                  value={player.uuid}
                  disabled={player.uuid === exclude}
                  onSelect={() => pick(player)}
                  className={itemClass}
                >
                  <PlayerRow player={player} note={player.uuid === exclude ? "Picked" : undefined} />
                </CommandPrimitive.Item>
              ))}
              {debounced && waiting && results.length === 0 ? (
                <p className="px-2.5 py-4 text-sm text-muted-foreground">Searching…</p>
              ) : null}
              {debounced && !waiting && results.length === 0 ? (
                <p className="px-2.5 py-4 text-sm text-muted-foreground">No player matches &ldquo;{debounced}&rdquo;.</p>
              ) : null}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverContent>
      </Popover>
      {clearable && value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Remove ${value.player_name}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-subtle-foreground hover:bg-surface-3 hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      ) : null}
    </div>
  )
}

