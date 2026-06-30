import "server-only"
import { insertAuditLog } from "@/lib/server/audit"
import { postPendingRun } from "@/lib/server/notifications"
import { trials } from "@/lib/trials"
import { generateShortId } from "@/lib/utils"
import {
  createSubmission,
  findPersonalBestByTrials,
  findPlayerByUuid,
  setSubmissionThreadId,
} from "@/lib/server/repositories/submission-repository"

export type IncomingSubmission = {
  trial_name?: unknown
  time?: unknown
  proof_url?: unknown
}

const allowedLinkHosts = ["medal.tv", "www.medal.tv"]
const publicVideoBaseUrl = "https://assets.wasans.tully.sh"
const scoreVideoContentType = "video/mp4"
const scorePreviewContentType = "image/jpeg"

function isAllowedTrial(value: unknown): value is (typeof trials)[number] {
  return typeof value === "string" && trials.includes(value as (typeof trials)[number])
}

function parseProofLink(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    return null
  }

  try {
    const url = new URL(value.trim())
    const host = url.hostname.toLowerCase()

    if (url.protocol !== "https:" || !allowedLinkHosts.includes(host)) {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
}

function getMedalContentApiUrl(link: string) {
  const match = link.match(/clips\/([^?]+)/)
  return match ? `https://medal.tv/api/content/${match[1]}/socialVideoUrl` : null
}

function isMedalLink(link: string) {
  const host = new URL(link).hostname.toLowerCase()
  return host === "medal.tv" || host === "www.medal.tv"
}

async function fetchMedalVideo(link: string) {
  const contentApiUrl = getMedalContentApiUrl(link)

  if (!contentApiUrl) {
    throw new Error("Unable to read the Medal clip id")
  }

  const response = await fetch(contentApiUrl, {
    headers: {
      accept: "application/json, text/plain;q=0.9",
    },
  })

  if (!response.ok) {
    throw new Error("Unable to resolve the Medal video URL")
  }

  const contentType = response.headers.get("content-type") || ""

  if (contentType.startsWith("video/") || contentType === "application/octet-stream") {
    return response
  }

  const body = await response.text()
  let videoUrl: unknown = body.trim()

  if (contentType.includes("application/json") || body.startsWith("{") || body.startsWith("[")) {
    videoUrl = JSON.parse(body) as unknown
  }

  if (typeof videoUrl === "object" && videoUrl && "url" in videoUrl) {
    videoUrl = (videoUrl as { url?: unknown }).url
  } else if (typeof videoUrl === "object" && videoUrl && "socialVideoUrl" in videoUrl) {
    videoUrl = (videoUrl as { socialVideoUrl?: unknown }).socialVideoUrl
  }

  if (typeof videoUrl !== "string") {
    throw new Error("Medal did not return a video URL")
  }

  const parsedVideoUrl = new URL(videoUrl)
  if (parsedVideoUrl.protocol !== "https:") {
    throw new Error("Medal returned an invalid video URL")
  }

  return fetch(parsedVideoUrl.toString())
}

async function uploadVideo(
  bucket: R2Bucket,
  objectKey: string,
  value: Blob | ReadableStream | ArrayBuffer,
  contentType: string
) {
  await bucket.put(objectKey, value, {
    httpMetadata: {
      contentType,
    },
  })

  const uploadedObject = await bucket.head(objectKey)
  return Boolean(uploadedObject)
}

export async function createSubmissionsFromRequest(db: D1Database, env: CloudflareEnv, user: { uuid: string }) {
  const now = String(Math.floor(Date.now() / 1000))

  return async (formData: FormData) => {
    const rawSubmissions = String(formData.get("submissions") || "")
    let incomingSubmissions: IncomingSubmission[]

    try {
      incomingSubmissions = JSON.parse(rawSubmissions)
    } catch {
      throw new Error("Submissions payload is invalid")
    }

    if (!Array.isArray(incomingSubmissions) || incomingSubmissions.length === 0) {
      throw new Error("Add at least one submission")
    }

    const player = await findPlayerByUuid(db, user.uuid)
    if (!player) {
      throw new Error("Player was not found")
    }

    const requestedTrials = [...new Set(incomingSubmissions.map((submission) => String(submission?.trial_name || "")).filter(Boolean))]
    const personalBestMap = await findPersonalBestByTrials(db, user.uuid, requestedTrials)

    const created: Array<{ uuid: string; trial_name: string; proof_url: string; object_key?: string }> = []

    for (let index = 0; index < incomingSubmissions.length; index += 1) {
      const submission = incomingSubmissions[index]
      const trialName = submission?.trial_name
      const rawTime = String(submission?.time ?? "")
      const time = Number(submission?.time)
      const link = parseProofLink(submission?.proof_url)
      const file = formData.get(`proof_file_${index}`)

      if (!isAllowedTrial(trialName)) {
        throw new Error(`Submission ${index + 1} has an invalid trial`)
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

      const uuid = generateShortId()
      let proofUrl = link || ""
      let objectKey: string | undefined
      let source: "upload" | "medal" | "link" = "link"

      if (file instanceof File && file.size > 0) {
        source = "upload"
        if (!(file.type === "" || file.type.startsWith("video/"))) {
          throw new Error(`Submission ${index + 1} must use a video file`)
        }

        if (!env.SUBMISSION_VIDEOS) {
          throw new Error("Submission video bucket is not available")
        }

        objectKey = `scores/${uuid}.mp4`
        proofUrl = `${publicVideoBaseUrl}/scores/${uuid}.mp4`
        const uploaded = await uploadVideo(env.SUBMISSION_VIDEOS, objectKey, file, scoreVideoContentType)

        if (!uploaded) {
          await env.SUBMISSION_VIDEOS.delete(objectKey).catch(() => {})
          throw new Error(`Unable to verify uploaded video for submission ${index + 1}`)
        }

        const preview = formData.get(`preview_file_${index}`)
        if (preview instanceof File && preview.size > 0) {
          const previewKey = `scores/${uuid}-preview.jpg`
          const uploadedPreview = await uploadVideo(env.SUBMISSION_VIDEOS, previewKey, preview, scorePreviewContentType)
          if (!uploadedPreview) {
            await env.SUBMISSION_VIDEOS.delete(previewKey).catch(() => {})
          }
        }
      } else if (link && isMedalLink(link)) {
        source = "medal"
        if (!env.SUBMISSION_VIDEOS) {
          throw new Error("Submission video bucket is not available")
        }

        objectKey = `scores/${uuid}.mp4`
        proofUrl = `${publicVideoBaseUrl}/scores/${uuid}.mp4`
        const medalVideoResponse = await fetchMedalVideo(link)
        if (!medalVideoResponse.ok || !medalVideoResponse.body) {
          throw new Error(`Unable to download Medal video for submission ${index + 1}`)
        }

        const medalVideoType = medalVideoResponse.headers.get("content-type") || scoreVideoContentType
        if (!medalVideoType.startsWith("video/") && medalVideoType !== "application/octet-stream") {
          throw new Error(`Medal did not return a video file for submission ${index + 1}`)
        }

        const uploaded = await uploadVideo(
          env.SUBMISSION_VIDEOS,
          objectKey,
          await medalVideoResponse.arrayBuffer(),
          medalVideoType.startsWith("video/") ? medalVideoType : scoreVideoContentType
        )

        if (!uploaded) {
          await env.SUBMISSION_VIDEOS.delete(objectKey).catch(() => {})
          throw new Error(`Unable to verify downloaded video for submission ${index + 1}`)
        }
      } else if (!link) {
        throw new Error(`Submission ${index + 1} needs a Medal link, or a video file`)
      }

      await createSubmission(db, {
        uuid,
        playerUuid: player.uuid,
        trialName,
        playerName: player.player_name,
        time,
        now,
      })

      await insertAuditLog(db, "submission_created", "submission", uuid, {
        actor: { uuid: player.uuid, player_name: player.player_name },
        details: {
          trial_name: trialName,
          time,
          proof_url: proofUrl,
          source,
        },
      })

      try {
        const { threadId } = await postPendingRun({
          submission_uuid: uuid,
          player_uuid: player.uuid,
          player_name: player.player_name,
          trial_name: trialName,
          time,
          oldTime: personalBest,
          player_score: Number(player.score),
          discordUserId: player.player_id,
        })

        if (threadId) {
          await setSubmissionThreadId(db, uuid, threadId)
        }
      } catch (error) {
        console.error("Failed to post pending run:", error)
      }

      created.push({ uuid, trial_name: trialName, proof_url: proofUrl, ...(objectKey ? { object_key: objectKey } : {}) })
    }

    return created
  }
}
