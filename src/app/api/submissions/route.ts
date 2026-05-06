import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getAuthUser } from "@/lib/server/auth"
import { refreshPlayerScore } from "@/lib/server/player-scores"
import { insertAuditLog } from "@/lib/server/audit"
import { trials } from "@/lib/trials"
import { refreshPlayerPb, refreshPlayerPbs } from "@/lib/server/pbs"

type IncomingSubmission = {
  trial_name?: unknown
  time?: unknown
  proof_url?: unknown
}

type PlayerRow = {
  uuid: string
  player_id: string
  player_name: string
}

type PersonalBestRow = {
  time: number
}

const allowedLinkHosts = ["medal.tv", "www.medal.tv"]
const publicVideoBaseUrl = "https://assets.wasans.tully.sh"
const scoreVideoContentType = "video/mp4"

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

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

  if (contentType.includes("application/json")) {
    videoUrl = JSON.parse(body) as unknown
  } else if (body.startsWith("{") || body.startsWith("[")) {
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

async function createSubmissionRow(
  db: D1Database,
  uuid: string,
  player: PlayerRow,
  trialName: (typeof trials)[number],
  time: number,
  now: string
) {
  await db.prepare(
    `INSERT INTO submissions (
      uuid, player_uuid, trial_name, player_name, time, date, state
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(uuid, player.uuid, trialName, player.player_name, time, now, "pending")
    .run()
}

const cacheHeaders = {
  "cache-control": "max-age=10, stale-while-revalidate=30",
}

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "DB binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"))
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || "50")))
  const offset = (page - 1) * limit
  const status = url.searchParams.get("state")
  const whereClause = status && ["approved", "denied", "pending"].includes(status) ? "WHERE submissions.state = ?" : ""

  const statement = env.wasans.prepare(
    `SELECT submissions.*, players.score as player_score
     FROM submissions
     LEFT JOIN players ON players.uuid = submissions.player_uuid
     ${whereClause}
     ORDER BY submissions.date DESC
     LIMIT ? OFFSET ?`
  )

  const results = whereClause
    ? (await statement.bind(status, limit, offset).all())
    : (await statement.bind(limit, offset).all())

  return new Response(JSON.stringify({ results: results.results || [] }), {
    status: 200,
    headers: {
      ...cacheHeaders,
      "content-type": "application/json",
    },
  })
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const user = await getAuthUser(request, env.wasans)

  if (!user) {
    return jsonError("Authentication required", 401)
  }

  const formData = await request.formData().catch((err) => {
    console.error(err)
    return null
  })

  if (!formData) {
    return jsonError("Submission payload is too large or invalid", 413)
  }

  const playerUuid = user.uuid
  const rawSubmissions = String(formData.get("submissions") || "")

  let incomingSubmissions: IncomingSubmission[]

  try {
    incomingSubmissions = JSON.parse(rawSubmissions)
  } catch {
    return jsonError("Submissions payload is invalid")
  }

  if (!Array.isArray(incomingSubmissions) || incomingSubmissions.length === 0) {
    return jsonError("Add at least one submission")
  }

  const now = String(Math.floor(Date.now() / 1000))
  const created = []
  const player = await env.wasans.prepare(
    `SELECT uuid, player_id, player_name FROM players WHERE uuid = ?`
  )
    .bind(playerUuid)
    .first<PlayerRow>()

  if (!player) {
    return jsonError("Player was not found", 404)
  }

  for (let index = 0; index < incomingSubmissions.length; index += 1) {
    const submission = incomingSubmissions[index]
    const trialName = submission?.trial_name
    const rawTime = String(submission?.time ?? "")
    const time = Number(submission?.time)
    const link = parseProofLink(submission?.proof_url)
    const file = formData.get(`proof_file_${index}`)

    if (!isAllowedTrial(trialName)) {
      return jsonError(`Submission ${index + 1} has an invalid trial`)
    }

    if (!Number.isFinite(time) || time <= 0) {
      return jsonError(`Submission ${index + 1} needs a valid time`)
    }

    if (!/^\d+(\.\d{1,3})?$/.test(rawTime)) {
      return jsonError(`Submission ${index + 1} can only use three decimal places`)
    }

    const personalBest = await env.wasans.prepare(
      `SELECT MIN(time) as time
       FROM submissions
       WHERE player_uuid = ? AND trial_name = ? AND state != 'denied'`
    )
      .bind(playerUuid, trialName)
      .first<PersonalBestRow>()

    if (personalBest?.time && time > personalBest.time) {
      return jsonError(
        `Submission ${index + 1} is slower than the current personal best for ${trialName}`
      )
    }

    if (file instanceof File && file.size > 0) {
      if (!(file.type === "" || file.type.startsWith("video/"))) {
        return jsonError(`Submission ${index + 1} must use a video file`)
      }

      if (!env.SUBMISSION_VIDEOS) {
        return jsonError("Submission video bucket is not available", 500)
      }

      const uuid = crypto.randomUUID()
      const objectKey = `scores/${uuid}.mp4`
      const proofUrl = `${publicVideoBaseUrl}/scores/${uuid}.mp4`

      const uploaded = await uploadVideo(
        env.SUBMISSION_VIDEOS,
        objectKey,
        file,
        file.type || scoreVideoContentType
      )

      if (!uploaded) {
        return jsonError(`Unable to verify uploaded video for submission ${index + 1}`, 500)
      }

      try {
        await createSubmissionRow(env.wasans, uuid, player, trialName, time, now)
        await insertAuditLog(env.wasans, "submission_created", "submission", uuid, {
          actor: { uuid: player.uuid, player_name: player.player_name },
          details: {
            trial_name: trialName,
            time,
            proof_url: proofUrl,
            source: "upload",
          },
        })
      } catch (err) {
        await env.SUBMISSION_VIDEOS.delete(objectKey).catch((deleteErr) => {
          console.error(deleteErr)
        })
        throw err
      }

      created.push({ uuid, trial_name: trialName, proof_url: proofUrl, object_key: objectKey })
      continue
    }

    if (!link) {
      return jsonError(`Submission ${index + 1} needs a Medal link, or a video file`)
    }

    if (isMedalLink(link)) {
      if (!env.SUBMISSION_VIDEOS) {
        return jsonError("Submission video bucket is not available", 500)
      }

      const uuid = crypto.randomUUID()
      const objectKey = `scores/${uuid}.mp4`
      const proofUrl = `${publicVideoBaseUrl}/scores/${uuid}.mp4`
      let medalVideoResponse: Response

      try {
        medalVideoResponse = await fetchMedalVideo(link)
      } catch (err) {
        console.error(err)
        return jsonError(`Unable to download Medal video for submission ${index + 1}`, 502)
      }

      if (!medalVideoResponse.ok || !medalVideoResponse.body) {
        return jsonError(`Unable to download Medal video for submission ${index + 1}`, 502)
      }

      const medalVideoType = medalVideoResponse.headers.get("content-type") || scoreVideoContentType

      if (!medalVideoType.startsWith("video/") && medalVideoType !== "application/octet-stream") {
        return jsonError(`Medal did not return a video file for submission ${index + 1}`, 502)
      }

      const uploaded = await uploadVideo(
        env.SUBMISSION_VIDEOS,
        objectKey,
        await medalVideoResponse.arrayBuffer(),
        medalVideoType === "application/octet-stream" ? scoreVideoContentType : medalVideoType
      )

      if (!uploaded) {
        return jsonError(`Unable to verify downloaded video for submission ${index + 1}`, 500)
      }

      try {
        await createSubmissionRow(env.wasans, uuid, player, trialName, time, now)
        await insertAuditLog(env.wasans, "submission_created", "submission", uuid, {
          actor: { uuid: player.uuid, player_name: player.player_name },
          details: {
            trial_name: trialName,
            time,
            proof_url: proofUrl,
            source: "medal",
          },
        })
      } catch (err) {
        await env.SUBMISSION_VIDEOS.delete(objectKey).catch((deleteErr) => {
          console.error(deleteErr)
        })
        throw err
      }

      created.push({ uuid, trial_name: trialName, proof_url: proofUrl, object_key: objectKey })
      continue
    }

    const uuid = crypto.randomUUID()

    await createSubmissionRow(env.wasans, uuid, player, trialName, time, now)
    await insertAuditLog(env.wasans, "submission_created", "submission", uuid, {
      actor: { uuid: player.uuid, player_name: player.player_name },
      details: {
        trial_name: trialName,
        time,
        proof_url: link,
        source: "link",
      },
    })

    created.push({ uuid, trial_name: trialName, proof_url: link })
  }

  return Response.json({ results: created }, { status: 201 })
}
