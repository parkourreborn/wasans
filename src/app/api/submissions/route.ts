import { getCloudflareContext } from "@opennextjs/cloudflare"
import { trials } from "@/lib/trials"

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

const allowedLinkHosts = ["youtube.com", "www.youtube.com", "youtu.be", "medal.tv", "www.medal.tv"]
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

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "DB binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  const { results } = await env.wasans.prepare(
    `SELECT * FROM submissions ORDER BY date DESC`
  ).all()

  return Response.json({ results })
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const formData = await request.formData().catch((err) => {
    console.error(err)
    return null
  })

  if (!formData) {
    return jsonError("Submission payload is too large or invalid", 413)
  }

  const playerUuid = String(formData.get("player_uuid") || "").trim()
  const rawSubmissions = String(formData.get("submissions") || "")

  if (!playerUuid) {
    return jsonError("Player is required")
  }

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

      await env.SUBMISSION_VIDEOS.put(objectKey, file, {
        httpMetadata: {
          contentType: file.type || scoreVideoContentType,
        },
      })

      try {
        await env.wasans.prepare(
          `INSERT INTO submissions (
            uuid, player_uuid, trial_name, player_name, time, date, state
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(uuid, player.uuid, trialName, player.player_name, time, now, "pending")
          .run()
      } catch (err) {
        await env.SUBMISSION_VIDEOS.delete(objectKey).catch((deleteErr) => {
          console.error(deleteErr)
        })
        throw err
      }

      created.push({ uuid, trial_name: trialName, proof_url: proofUrl })
      continue
    }

    if (!link) {
      return jsonError(`Submission ${index + 1} needs a YouTube or Medal link, or a video file`)
    }

    const uuid = crypto.randomUUID()

    await env.wasans.prepare(
      `INSERT INTO submissions (
        uuid, player_uuid, trial_name, player_name, time, date, state
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(uuid, player.uuid, trialName, player.player_name, time, now, "pending")
      .run()

    created.push({ uuid, trial_name: trialName, proof_url: link })
  }

  return Response.json({ results: created }, { status: 201 })
}
