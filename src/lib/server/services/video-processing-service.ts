import "server-only"
import { postPendingRun, sendDiscordDm } from "@/lib/server/notifications"
import { presignUploadPut } from "@/lib/server/r2-presign"
import {
  applyBackfillVideoResult,
  applySubmissionVideoResult,
  claimNextBackfillSubmission,
  countRecentVideoUploads,
  deleteOldVideoUploads,
  failStuckSubmissionVideo,
  findPreviousPersonalBest,
  getBackfillStats,
  insertVideoUpload,
  listStuckProcessingSubmissions,
  touchSubmissionVideo,
  type VideoResult,
} from "@/lib/server/repositories/video-repository"
import { findPlayerByUuid, getSubmissionWithScore, setSubmissionThreadId } from "@/lib/server/repositories/submission-repository"
import {
  BACKFILL_CONCURRENCY,
  UPLOAD_CONSUME_WINDOW_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
  isValidUploadSize,
  resolveUploadContentType,
  videoJobFromStoredSource,
  type VideoJobMessage,
} from "@/lib/server/video-processing"
import { ApiError } from "@/lib/server/v2/http"
import { generateShortId } from "@/lib/utils"

// Generous for real use (one upload per trial, plus retries), tight enough
// that one account can't mint thousands of upload URLs.
const MAX_UPLOAD_URLS_PER_HOUR = 60
const STUCK_REQUEUE_LIMIT = 50

export async function createVideoUploadUrl(
  db: D1Database,
  env: CloudflareEnv,
  playerUuid: string,
  body: { size?: unknown; content_type?: unknown; filename?: unknown } | null
) {
  if (!isValidUploadSize(body?.size)) {
    throw new ApiError("The video must be under 500 MB", 400, "validation_error")
  }
  const contentType = resolveUploadContentType(body?.content_type, body?.filename)
  if (!contentType) {
    throw new ApiError("Only video files can be uploaded", 400, "validation_error")
  }

  const now = Math.floor(Date.now() / 1000)
  if ((await countRecentVideoUploads(db, playerUuid, now - 60 * 60)) >= MAX_UPLOAD_URLS_PER_HOUR) {
    throw new ApiError("Too many uploads started in the last hour. Try again later.", 429, "rate_limited")
  }

  const id = generateShortId()
  const objectKey = `incoming/${id}`
  const signed = await presignUploadPut(env, {
    key: objectKey,
    contentType,
    sizeBytes: body.size as number,
    ttlSeconds: UPLOAD_URL_TTL_SECONDS,
  })

  await insertVideoUpload(db, { id, playerUuid, objectKey, contentType, sizeBytes: body.size as number, now })

  return {
    upload_id: id,
    method: "PUT" as const,
    url: signed.url,
    headers: signed.headers,
    expires_at: now + UPLOAD_URL_TTL_SECONDS,
    submit_before: now + UPLOAD_CONSUME_WINDOW_SECONDS,
  }
}

export async function enqueueVideoJobs(env: CloudflareEnv, jobs: VideoJobMessage[]) {
  if (jobs.length === 0) return
  if (!env.VIDEO_QUEUE) {
    throw new Error("The video processing queue isn't configured")
  }
  // sendBatch takes at most 100 messages per call.
  for (let index = 0; index < jobs.length; index += 100) {
    await env.VIDEO_QUEUE.sendBatch(jobs.slice(index, index + 100).map((body) => ({ body })))
  }
}

type ResultPayload = {
  reason?: unknown
  status?: unknown
  error?: unknown
  original_kept?: unknown
  width?: unknown
  height?: unknown
  fps?: unknown
  duration_seconds?: unknown
}

function toVideoResult(payload: ResultPayload): VideoResult | null {
  if (payload.status !== "ready" && payload.status !== "failed") {
    return null
  }
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null)
  return {
    status: payload.status,
    error: payload.status === "failed" ? String(payload.error || "Video processing failed").slice(0, 500) : null,
    original_kept: payload.original_kept === true,
    width: num(payload.width),
    height: num(payload.height),
    fps: num(payload.fps),
    duration_seconds: num(payload.duration_seconds),
  }
}

// The wasans-video Worker's result callback (see
// /v2/internal/submission-videos/[uuid]). Records the result, then does
// what used to happen right at submission time but needs a playable video:
// the Discord pending-run post.
export async function handleVideoResult(
  db: D1Database,
  env: CloudflareEnv,
  ctx: ExecutionContext,
  submissionUuid: string,
  payload: ResultPayload
) {
  const result = toVideoResult(payload)
  if (!result) {
    throw new ApiError("Invalid result", 400, "validation_error")
  }
  const now = Math.floor(Date.now() / 1000)

  if (payload.reason === "backfill") {
    await applyBackfillVideoResult(db, submissionUuid, result, now)
    // Keep the backfill going: each finished item starts the next one.
    ctx.waitUntil(continueBackfill(db, env).catch((error) => console.error("Backfill continuation failed:", error)))
    return { applied: true }
  }

  const applied = await applySubmissionVideoResult(db, submissionUuid, result, now)
  if (applied && result.status === "failed") {
    await notifyVideoFailed(db, submissionUuid, result.error)
  }
  if (!applied || result.status !== "ready") {
    return { applied }
  }

  const submission = await getSubmissionWithScore(db, submissionUuid)
  if (submission && submission.state === "pending" && !submission.thread_id) {
    const player = await findPlayerByUuid(db, submission.player_uuid)
    if (player) {
      const oldTime = await findPreviousPersonalBest(db, submission.player_uuid, submission.trial_name, submissionUuid)
      try {
        const { threadId } = await postPendingRun({
          submission_uuid: submissionUuid,
          player_uuid: player.uuid,
          player_name: submission.player_name,
          trial_name: submission.trial_name,
          time: Number(submission.time),
          oldTime,
          player_score: Number(player.score),
          discordUserId: player.discord_id ?? undefined,
        })
        if (threadId) {
          await setSubmissionThreadId(db, submissionUuid, threadId)
        }
      } catch (error) {
        console.error("Failed to post pending run:", error)
      }
    }
  }

  return { applied }
}

// The run can't be approved without a video, and nothing else tells the
// player, so DM them. The site also shows a notice until the run is deleted
// (see the nav badges). Best effort: a failed DM never fails the callback.
async function notifyVideoFailed(db: D1Database, submissionUuid: string, error: string | null) {
  try {
    const submission = await getSubmissionWithScore(db, submissionUuid)
    if (!submission || submission.state !== "pending") return
    const player = await findPlayerByUuid(db, submission.player_uuid)
    if (!player?.discord_id) return
    const run = `${submission.trial_name} ${Number(submission.time).toFixed(3)}`
    const content =
      `The video for your ${run} run couldn't be processed, so it can't be reviewed.` +
      (error ? `\n\nReason: ${error}` : "") +
      `\n\nDelete the run and submit it again with the video: https://wasans.tully.sh/submissions/${submissionUuid}`
    await sendDiscordDm(player.discord_id, content)
  } catch (dmError) {
    console.error("Failed to send video failure DM:", dmError)
  }
}

// Fills the backfill up to BACKFILL_CONCURRENCY jobs in flight. Safe to call
// any number of times: each slot is a conditional claim on one row. Only an
// owner starts a backfill (options.start); afterwards finished items and the
// daily sweep keep it going until nothing is left.
export async function continueBackfill(db: D1Database, env: CloudflareEnv, options: { start?: boolean } = {}) {
  const now = Math.floor(Date.now() / 1000)
  const stats = await getBackfillStats(db, now)
  if (!stats.started && !options.start) {
    return { started: 0 }
  }
  const jobs: VideoJobMessage[] = []
  for (let slot = stats.inFlight; slot < BACKFILL_CONCURRENCY; slot += 1) {
    const uuid = await claimNextBackfillSubmission(db, now)
    if (!uuid) break
    jobs.push({ submissionUuid: uuid, reason: "backfill", attempt: 1 })
  }
  await enqueueVideoJobs(env, jobs)
  return { started: jobs.length }
}

export async function getVideoBackfillStatus(db: D1Database) {
  return getBackfillStats(db, Math.floor(Date.now() / 1000))
}

// Daily maintenance (see /v2/admin/maintenance/cleanup-expired): re-queue
// submissions whose processing job got lost, and drop old upload-URL rows.
export async function sweepVideoProcessing(db: D1Database, env: CloudflareEnv) {
  const now = Math.floor(Date.now() / 1000)
  const stuck = await listStuckProcessingSubmissions(db, now, STUCK_REQUEUE_LIMIT)
  const jobs: VideoJobMessage[] = []

  for (const row of stuck) {
    const job = videoJobFromStoredSource(row.uuid, row.video_source_type, row.video_source_ref)
    if (job) {
      await touchSubmissionVideo(db, row.uuid, now)
      jobs.push(job)
    } else {
      const error = "Video processing didn't finish. Please submit again."
      if (await failStuckSubmissionVideo(db, row.uuid, error, now)) {
        await notifyVideoFailed(db, row.uuid, error)
      }
    }
  }
  if (jobs.length > 0 && env.VIDEO_QUEUE) {
    await enqueueVideoJobs(env, jobs)
  }

  // Upload rows only matter until they're consumed or their window passes.
  const uploadRowsDeleted = await deleteOldVideoUploads(db, now - 7 * 24 * 60 * 60)

  // Backfill rides along too, in case its chain of callbacks ever broke.
  const backfill = env.VIDEO_QUEUE ? await continueBackfill(db, env) : { started: 0 }

  return { videosRequeued: jobs.length, uploadRowsDeleted, backfillStarted: backfill.started }
}
