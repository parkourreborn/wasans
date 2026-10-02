import "server-only"
import { insertAuditLog } from "@/lib/server/audit"
import { trials } from "@/lib/trials"
import { generateShortId } from "@/lib/utils"
import {
  createSubmission,
  findPersonalBestByTrials,
  findPlayerByUuid,
} from "@/lib/server/repositories/submission-repository"
import { getTrialLifecycle, type TrialLifecycleRow } from "@/lib/server/repositories/trial-repository"
import {
  consumeVideoUpload,
  findVideoUpload,
  markSubmissionVideoQueued,
} from "@/lib/server/repositories/video-repository"
import { enqueueVideoJobs } from "@/lib/server/services/video-processing-service"
import { canAcceptNewSubmissions } from "@/lib/server/trial-lifecycle"
import { MAX_UPLOAD_BYTES, isUploadConsumable, type VideoJobMessage } from "@/lib/server/video-processing"

export type IncomingSubmission = {
  trial_name?: unknown
  time?: unknown
  proof_url?: unknown
  upload_id?: unknown
}

const allowedLinkHosts = ["medal.tv", "www.medal.tv"]

// One request may cover at most one run per trial; anything beyond that is
// not a player filling in the form.
const maxSubmissionsPerRequest = 32

function isAllowedTrial(value: unknown): value is (typeof trials)[number] {
  return typeof value === "string" && trials.includes(value as (typeof trials)[number])
}

function parseMedalLink(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    return null
  }

  try {
    const url = new URL(value.trim())
    const host = url.hostname.toLowerCase()

    if (url.protocol !== "https:" || !allowedLinkHosts.includes(host) || !/\/clips\/[^/?]+/.test(url.pathname)) {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
}

type PreparedSubmission = {
  uuid: string
  trialName: (typeof trials)[number]
  time: number
  trialVersion: number
  source: { type: "upload"; uploadId: string; objectKey: string } | { type: "medal"; url: string }
}

// Videos are no longer sent to this endpoint at all. A file is uploaded
// straight to the private R2 bucket with a presigned URL from
// /v2/uploads, and only its upload_id comes here. A Medal link is
// downloaded by the processing container rather than by this Worker. Either
// way the submission is created immediately with video_status
// 'processing', and the wasans-video Worker takes it from there (see
// video-processing-service.ts for what happens when it finishes).
//
// Everything is validated before anything is written, so a bad entry
// anywhere in the batch can't leave the earlier ones half-created.
export async function createSubmissions(
  db: D1Database,
  env: CloudflareEnv,
  user: { uuid: string },
  incomingSubmissions: unknown
) {
  if (!Array.isArray(incomingSubmissions) || incomingSubmissions.length === 0) {
    throw new Error("Add at least one submission")
  }

  if (incomingSubmissions.length > maxSubmissionsPerRequest) {
    throw new Error(`A single request can hold at most ${maxSubmissionsPerRequest} submissions`)
  }

  const player = await findPlayerByUuid(db, user.uuid)
  if (!player) {
    throw new Error("Player was not found")
  }

  const now = Math.floor(Date.now() / 1000)
  const entries = incomingSubmissions as IncomingSubmission[]
  const requestedTrials = [...new Set(entries.map((submission) => String(submission?.trial_name || "")).filter(Boolean))]
  const personalBestMap = await findPersonalBestByTrials(db, user.uuid, requestedTrials)
  const trialLifecycleEntries = await Promise.all(
    requestedTrials.map(async (name) => [name, await getTrialLifecycle(db, name)] as const)
  )
  const trialLifecycleMap = new Map<string, TrialLifecycleRow | null>(trialLifecycleEntries)
  const usedUploadIds = new Set<string>()

  const prepared: PreparedSubmission[] = []
  for (let index = 0; index < entries.length; index += 1) {
    const submission = entries[index]
    const trialName = submission?.trial_name
    const rawTime = String(submission?.time ?? "")
    const time = Number(submission?.time)

    if (!isAllowedTrial(trialName)) {
      throw new Error(`Submission ${index + 1} has an invalid trial`)
    }

    const trialLifecycle = trialLifecycleMap.get(trialName)
    if (!trialLifecycle) {
      throw new Error(`Submission ${index + 1}'s trial isn't accepting submissions yet`)
    }
    if (!canAcceptNewSubmissions(trialLifecycle)) {
      throw new Error(`Submission ${index + 1}'s trial has been removed and no longer accepts submissions`)
    }

    if (!Number.isFinite(time) || time <= 0) {
      throw new Error(`Submission ${index + 1} needs a valid time`)
    }

    if (!/^\d+(\.\d{1,3})?$/.test(rawTime)) {
      throw new Error(`Submission ${index + 1} can only use three decimal places`)
    }

    const personalBest = personalBestMap.get(trialName)
    if (personalBest && time > personalBest) {
      throw new Error(`Submission ${index + 1} is slower than the current personal best for ${trialName}`)
    }

    const base = { uuid: generateShortId(), trialName, time, trialVersion: trialLifecycle.version }
    const uploadId = typeof submission?.upload_id === "string" ? submission.upload_id.trim() : ""

    if (uploadId) {
      const upload = await findVideoUpload(db, uploadId)
      if (!upload || usedUploadIds.has(uploadId) || !isUploadConsumable(upload, user.uuid, now)) {
        throw new Error(`Submission ${index + 1}'s upload has expired or was already used. Please upload the video again.`)
      }

      // The presigned URL pins the size, but check what actually landed
      // before accepting it.
      const object = env.UPLOADS ? await env.UPLOADS.head(upload.object_key) : null
      if (!object) {
        throw new Error(`Submission ${index + 1}'s video upload didn't finish. Please upload it again.`)
      }
      if (object.size > MAX_UPLOAD_BYTES) {
        throw new Error(`Submission ${index + 1}'s video is too large`)
      }

      usedUploadIds.add(uploadId)
      prepared.push({ ...base, source: { type: "upload", uploadId, objectKey: upload.object_key } })
      continue
    }

    const medalUrl = parseMedalLink(submission?.proof_url)
    if (medalUrl) {
      prepared.push({ ...base, source: { type: "medal", url: medalUrl } })
      continue
    }

    throw new Error(`Submission ${index + 1} needs a Medal clip link, or a video file`)
  }

  const created: Array<{ uuid: string; trial_name: string; video_status: "processing" }> = []
  const jobs: VideoJobMessage[] = []

  for (const submission of prepared) {
    if (submission.source.type === "upload") {
      const consumed = await consumeVideoUpload(db, {
        id: submission.source.uploadId,
        playerUuid: user.uuid,
        submissionUuid: submission.uuid,
        now,
      })
      if (!consumed) {
        throw new Error("That upload was already used. Please upload the video again.")
      }
    }

    await createSubmission(db, {
      uuid: submission.uuid,
      playerUuid: player.uuid,
      trialName: submission.trialName,
      playerName: player.player_name,
      time: submission.time,
      now,
      trialVersion: submission.trialVersion,
    })

    const source =
      submission.source.type === "upload"
        ? { type: "upload" as const, ref: submission.source.objectKey }
        : { type: "medal" as const, ref: submission.source.url }
    await markSubmissionVideoQueued(db, submission.uuid, source, now)
    jobs.push(
      submission.source.type === "upload"
        ? { submissionUuid: submission.uuid, reason: "upload", incomingKey: submission.source.objectKey, attempt: 1 }
        : { submissionUuid: submission.uuid, reason: "medal", medalUrl: submission.source.url, attempt: 1 }
    )

    await insertAuditLog(db, "submission_created", "submission", submission.uuid, {
      actor: { uuid: player.uuid, player_name: player.player_name },
      details: {
        trial_name: submission.trialName,
        time: submission.time,
        source: submission.source.type,
        ...(submission.source.type === "medal" ? { proof_url: submission.source.url } : { upload_id: submission.source.uploadId }),
      },
    })

    created.push({ uuid: submission.uuid, trial_name: submission.trialName, video_status: "processing" })
  }

  // If this fails the submissions still exist as "processing", and the
  // daily maintenance sweep re-queues them from their stored source.
  try {
    await enqueueVideoJobs(env, jobs)
  } catch (error) {
    console.error("Failed to queue video processing:", error)
  }

  return created
}
