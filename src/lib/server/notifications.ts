import "server-only"

export type ApprovedHighScoreRun = {
  submission_uuid: string
  player_uuid: string
  player_name: string
  trial_name: string
  time: number
  player_score: number
}

export type WorldRecordRun = {
  submission_uuid: string
  player_uuid: string
  player_name: string
  trial_name: string
  time: number
  date: string
}

export async function queueApprovedHighScoreRuns(runs: ApprovedHighScoreRun[]) {
  if (!runs.length) {
    return
  }

  // TODO: send grouped webhook notification for high score runs once the Discord webhook is configured.
  // This method is intentionally a no-op now but is called by backend workflows.
  console.debug("queueApprovedHighScoreRuns", runs.map((run) => ({
    submission_uuid: run.submission_uuid,
    player_uuid: run.player_uuid,
    trial_name: run.trial_name,
    time: run.time,
    player_score: run.player_score,
  })))
}

export async function queueWorldRecordRun(run: WorldRecordRun) {
  // TODO: send a webhook notification for an approved world record run.
  console.debug("queueWorldRecordRun", run)
}

export async function updateDiscordUsernameOnScoreChange(playerUuid: string) {
  // TODO: update the Discord username cache when a player's score changes.
  console.debug("updateDiscordUsernameOnScoreChange", { playerUuid })
}
