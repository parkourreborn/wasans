import Link from "next/link"
import { ExternalLinkIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { formatPlayerNameWithScore } from "@/lib/player-score"

type ComboSubmissionCardProps = {
  submissionUuid: string
  categoryLabel: string
  comboCount: number
  youtubeUrl: string
  playerUuid: string
  playerName: string
  playerScore?: number
  playerId?: string | null
  playerDiscordAvatar?: string | null
  playerDiscordDiscriminator?: string | null
  dateText: string
  state: string
  moderatorNote?: string | null
  moderatorUsername?: string | null
  className?: string
  onNavigate: (submissionUuid: string) => void
}

export function ComboSubmissionCard({
  submissionUuid,
  categoryLabel,
  comboCount,
  youtubeUrl,
  playerUuid,
  playerName,
  playerScore,
  playerId,
  playerDiscordAvatar,
  playerDiscordDiscriminator,
  dateText,
  state,
  moderatorNote,
  moderatorUsername,
  className,
  onNavigate,
}: ComboSubmissionCardProps) {
  const note = typeof moderatorNote === "string" && moderatorNote.trim().length > 0 ? moderatorNote.trim() : "None"
  const playerLabel = playerScore != null ? formatPlayerNameWithScore(playerName, playerScore) : playerName

  return (
    <div
      className="submission-grid-item cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(submissionUuid)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onNavigate(submissionUuid)
        }
      }}
    >
      <Card className={className || "h-full overflow-hidden transition-colors hover:border-foreground/30"}>
        <CardContent className="flex h-full min-h-0 flex-col justify-between gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">{categoryLabel}</p>
              <p className="text-3xl font-bold leading-tight xl:text-4xl">{comboCount}</p>
            </div>
            <Badge variant={state === "approved" ? "approved" : state === "denied" ? "denied" : "default"}>
              {state === "approved" ? "Approved" : state === "denied" ? "Denied" : "Pending"}
            </Badge>
          </div>

          <a
            href={youtubeUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            <ExternalLinkIcon className="size-3.5" />
            Watch on YouTube
          </a>

          <div className="flex flex-col gap-1.5 text-base">
            <div className="flex items-center gap-2">
              <Link
                href={`/players/${playerUuid}`}
                onClick={(event) => event.stopPropagation()}
                aria-label={`Open ${playerName} profile`}
              >
                <PlayerAvatar
                  size="sm"
                  playerName={playerName}
                  discordId={playerId}
                  discordAvatar={playerDiscordAvatar}
                  discordDiscriminator={playerDiscordDiscriminator}
                />
              </Link>
              <Link
                href={`/players/${playerUuid}`}
                className="truncate text-muted-foreground underline underline-offset-4"
                onClick={(event) => event.stopPropagation()}
              >
                {playerLabel}
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">{dateText}</p>
          </div>
        </CardContent>
        <CardFooter className="hidden md:block">
          <div className="flex w-full items-start justify-between gap-4">
            <p
              className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
              title={`Moderator Note: ${note}`}
            >
              Moderator Note: {note}
            </p>
            {moderatorUsername ? (
              <p
                className="max-w-48 shrink-0 truncate text-xs text-muted-foreground"
                title={`Mod: ${moderatorUsername}`}
              >
                Mod: {moderatorUsername}
              </p>
            ) : null}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
