export type PreviousWrDisplayRow = {
  submission_uuid: string
  player_uuid: string
  player_name: string
  time: number
  date: number
  previous_thread_id: string | null
}

export type PreviousWrResolutionInput = {
  currentSubmissionUuid: string
  previousWrRow: PreviousWrDisplayRow | null
  fallbackWrRow: PreviousWrDisplayRow | null
}

export function resolvePreviousWrDisplayRow({
  currentSubmissionUuid,
  previousWrRow,
  fallbackWrRow,
}: PreviousWrResolutionInput) {
  if (previousWrRow && previousWrRow.submission_uuid !== currentSubmissionUuid) {
    return previousWrRow
  }

  if (fallbackWrRow && fallbackWrRow.submission_uuid !== currentSubmissionUuid) {
    return fallbackWrRow
  }

  return null
}

export function shouldCreateWrThread({
  isWr,
  hasExistingThread,
  currentSubmissionUuid,
  previousWrRow,
}: {
  isWr: boolean
  hasExistingThread: boolean
  currentSubmissionUuid: string
  previousWrRow: PreviousWrDisplayRow | null
}) {
  if (!hasExistingThread && isWr) {
    return previousWrRow ? previousWrRow.submission_uuid !== currentSubmissionUuid : true
  }

  return false
}

export function shouldUpdateSubmissionThread({
  hasExistingThread,
  stateChanged,
  timeChanged,
  noteChanged,
}: {
  hasExistingThread: boolean
  stateChanged: boolean
  timeChanged: boolean
  noteChanged: boolean
}) {
  return hasExistingThread && (stateChanged || timeChanged || noteChanged)
}

export function shouldNotifyModeratorOfChange({
  oldPlayerId,
  stateChanged,
  noteChanged,
  scoreChanged,
  rankChanged,
}: {
  oldPlayerId: string | null | undefined
  stateChanged: boolean
  noteChanged: boolean
  scoreChanged: boolean
  rankChanged: boolean
}) {
  if (!oldPlayerId) {
    return false
  }

  return stateChanged || noteChanged || scoreChanged || rankChanged
}
