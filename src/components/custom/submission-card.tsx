import Link from "next/link"
import Badges from "@/components/custom/badges"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { ScoreVideoPreview } from "@/components/custom/score-video-preview"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { formatPlayerNameWithScore } from "@/lib/player-score"

type SubmissionCardProps = {
  submissionUuid: string
  trialName: string
  timeText: string
  playerUuid: string
  playerName: string
  playerScore: number
  playerId?: string | null
  playerDiscordAvatar?: string | null
  playerDiscordDiscriminator?: string | null
  dateText: string
  state: string
  isWr?: boolean
  scoreText?: string
  moderatorNote?: string | null
  moderatorUsername?: string | null
  className?: string
  onNavigate: (submissionUuid: string) => void
}

export function SubmissionCard({
  submissionUuid,
  trialName,
  timeText,
  playerUuid,
  playerName,
  playerScore,
  playerId,
  playerDiscordAvatar,
  playerDiscordDiscriminator,
  dateText,
  state,
  isWr = false,
  scoreText,
  moderatorNote,
  moderatorUsername,
  className,
  onNavigate,
}: SubmissionCardProps) {
  const note = typeof moderatorNote === "string" && moderatorNote.trim().length > 0 ? moderatorNote.trim() : "None"

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
      <Card className={className || "h-full hover:shadow-lg transition-shadow overflow-hidden"}>
        <CardContent className="flex h-full min-h-0 gap-4 p-4">
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2">
            <ScoreVideoPreview submissionUuid={submissionUuid} />
          </div>

          <div className="flex w-40 shrink-0 flex-col justify-between gap-3 py-1 xl:w-52">
            <div className="w-full flex items-center justify-between gap-2">
              <h3 className="text-xl font-bold leading-tight xl:text-2xl">
                {trialName} {timeText}
              </h3>
            </div>

            <div className="w-full flex flex-col gap-1.5 text-base">
              {scoreText && state !== "denied" ? (
                <p className="text-sm font-semibold">Score {scoreText}</p>
              ) : null}
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
                  className="text-muted-foreground truncate underline underline-offset-4"
                  onClick={(event) => event.stopPropagation()}
                >
                  {formatPlayerNameWithScore(playerName, playerScore)}
                </Link>
              </div>
              <p className="text-sm text-muted-foreground">{dateText}</p>
            </div>

            <div className="flex items-end justify-between">
              <Badges
                badges={[
                  state === "approved" ? "approved" : state === "denied" ? "denied" : "pending",
                  isWr ? "wr" : "",
                ]}
              />
            </div>
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
