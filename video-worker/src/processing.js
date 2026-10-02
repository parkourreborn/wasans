// Submission video processing. The main app enqueues one message per video
// on the `video-processing` queue (new upload, Medal link, or a backfill of
// a video that predates processing). The queue consumer (src/index.js)
// starts one SubmissionVideoProcessor container per submission, which runs
// container/process.mjs and exits:
//
//   original -> remux/transcode to H.264 MP4 (<=1080p, <=60fps) -> thumbnail
//   -> scores/{uuid}.mp4 + scores/{uuid}-preview.jpg in the public bucket
//
// Originals live in the private wasans-uploads bucket as originals/{uuid}
// (moderators can download them, and a lifecycle rule deletes them after
// 90 days). Players' direct uploads land in incoming/ first and are moved
// to originals/ when processing starts.
//
// The container reaches R2 only through the media.internal outbound
// handler below, and every key it touches is derived from its own job, so
// it can't read or write another submission's files. Results go back to
// the main app's /v2/internal/submission-videos/{uuid} callback, which owns
// the submissions table and the follow-up (Discord post, cache bump).

import { Container, getContainer } from "@cloudflare/containers"
import { copyObject, handleMultipart, json, toBase64 } from "./shared.js"

// Total runs per message before giving up on a retryable failure.
const MAX_ATTEMPTS = 3
const RETRY_DELAY_SECONDS = 60
// Callback deliveries to the main app before giving up (with backoff).
const MAX_DELIVERY_ATTEMPTS = 6

const MAX_VIDEO_BYTES = 500 * 1024 * 1024
const MAX_DURATION_SECONDS = 10 * 60
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024
const REASONS = new Set(["upload", "medal", "backfill"])

export function processorName(submissionUuid) {
  return `submission-${submissionUuid}`
}

function keysFor(job) {
  return {
    original: `originals/${job.submissionUuid}`,
    published: `scores/${job.submissionUuid}.mp4`,
    preview: `scores/${job.submissionUuid}-preview.jpg`,
    incoming: job.incomingKey,
  }
}

async function currentJobFor(env, ctx) {
  const stub = env.VIDEO_PROCESSOR.get(env.VIDEO_PROCESSOR.idFromString(ctx.containerId))
  return stub.getJob()
}

async function handleMedia(request, env, ctx) {
  const job = await currentJobFor(env, ctx)
  if (!job || job.finished) {
    return new Response("No active job", { status: 403 })
  }

  const keys = keysFor(job)
  const { pathname } = new URL(request.url)
  const metadata = { submission_uuid: job.submissionUuid, source: job.reason }

  if (request.method === "GET" && pathname === "/original") {
    const object = await env.UPLOADS.get(keys.original)
    return object ? new Response(object.body) : new Response("Not found", { status: 404 })
  }

  if (request.method === "POST" && pathname === "/original/promote-upload") {
    if (job.reason !== "upload" || !keys.incoming?.startsWith("incoming/")) {
      return new Response("Forbidden", { status: 403 })
    }
    if (await env.UPLOADS.head(keys.original)) {
      return json({ ok: true })
    }
    if (!(await copyObject(env.UPLOADS, keys.incoming, env.UPLOADS, keys.original, metadata))) {
      return new Response("Upload not found", { status: 404 })
    }
    await env.UPLOADS.delete(keys.incoming)
    return json({ ok: true })
  }

  const originalMultipart = pathname.match(/^\/original\/multipart\/(create|part|complete|abort)$/)
  if (originalMultipart) {
    if (job.reason !== "medal") {
      return new Response("Forbidden", { status: 403 })
    }
    return handleMultipart(request, env.UPLOADS, keys.original, originalMultipart[1], {
      contentType: "video/mp4",
      customMetadata: metadata,
    })
  }

  if (request.method === "POST" && pathname === "/original/copy-from-published") {
    if (job.reason !== "backfill") {
      return new Response("Forbidden", { status: 403 })
    }
    if (!(await env.UPLOADS.head(keys.original))) {
      if (!(await copyObject(env.SUBMISSION_VIDEOS, keys.published, env.UPLOADS, keys.original, metadata))) {
        return new Response("Published video not found", { status: 404 })
      }
    }
    return json({ ok: true })
  }

  if (request.method === "GET" && pathname === "/published") {
    if (job.reason !== "backfill") {
      return new Response("Forbidden", { status: 403 })
    }
    const object = await env.SUBMISSION_VIDEOS.get(keys.published)
    return object ? new Response(object.body) : new Response("Not found", { status: 404 })
  }

  const publishedMultipart = pathname.match(/^\/published\/multipart\/(create|part|complete|abort)$/)
  if (publishedMultipart) {
    return handleMultipart(request, env.SUBMISSION_VIDEOS, keys.published, publishedMultipart[1], {
      contentType: "video/mp4",
    })
  }

  if (request.method === "PUT" && pathname === "/preview") {
    const body = await request.arrayBuffer()
    if (body.byteLength === 0 || body.byteLength > MAX_PREVIEW_BYTES) {
      return new Response("Invalid preview", { status: 400 })
    }
    await env.SUBMISSION_VIDEOS.put(keys.preview, body, { httpMetadata: { contentType: "image/jpeg" } })
    return json({ ok: true })
  }

  return new Response("Not found", { status: 404 })
}

async function handleResult(request, env, ctx) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }
  const stub = env.VIDEO_PROCESSOR.get(env.VIDEO_PROCESSOR.idFromString(ctx.containerId))
  await stub.complete(await request.json())
  return json({ ok: true })
}

// Validates a queue message into the job a processor runs.
function toJob(body) {
  const submissionUuid = String(body?.submissionUuid || "")
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(submissionUuid) || !REASONS.has(body?.reason)) {
    return null
  }
  if (body.reason === "upload" && !String(body.incomingKey || "").startsWith("incoming/")) {
    return null
  }
  if (body.reason === "medal" && !/^https:\/\/(www\.)?medal\.tv\//.test(String(body.medalUrl || ""))) {
    return null
  }
  return {
    submissionUuid,
    reason: body.reason,
    incomingKey: body.reason === "upload" ? body.incomingKey : null,
    medalUrl: body.reason === "medal" ? body.medalUrl : null,
    attempt: Number.isInteger(body.attempt) && body.attempt > 0 ? body.attempt : 1,
  }
}

function toMessage(job) {
  const { submissionUuid, reason, incomingKey, medalUrl, attempt } = job
  return { submissionUuid, reason, incomingKey, medalUrl, attempt }
}

// Queue consumer entry point (see src/index.js). Throws if the container
// can't be started right now (busy, or at max_instances); the consumer then
// retries the message later.
export async function startProcessing(env, body) {
  const job = toJob(body)
  if (!job) {
    console.error("Dropping invalid video-processing message:", JSON.stringify(body))
    return
  }
  await getContainer(env.VIDEO_PROCESSOR, processorName(job.submissionUuid)).startJob(job)
}

export class SubmissionVideoProcessor extends Container {
  // Backstop for a hung ffmpeg; a 10-minute 1080p video finishes well
  // inside this. The container exits on its own when done.
  sleepAfter = "1h"
  // Medal clips are downloaded straight from medal.tv.
  enableInternet = true
  entrypoint = ["node", "/app/process.mjs"]

  async getJob() {
    return (await this.ctx.storage.get("job")) ?? null
  }

  async startJob(job) {
    // A Durable Object runs one event at a time, so this check-and-set is
    // atomic (see CompilationRenderer.startJob).
    if (this.startingJob || this.ctx.container?.running) {
      throw new Error(`Submission ${job.submissionUuid} is already being processed`)
    }
    this.startingJob = true

    try {
      await this.ctx.storage.put("job", { ...job, finished: false })
      const containerJob = {
        ...toMessage(job),
        maxBytes: MAX_VIDEO_BYTES,
        maxDurationSeconds: MAX_DURATION_SECONDS,
      }
      await this.start({ envVars: { JOB_JSON: toBase64(JSON.stringify(containerJob)) } })
    } catch (error) {
      await this.ctx.storage.put("job", { ...job, finished: true })
      throw error
    } finally {
      this.startingJob = false
    }
  }

  // Called once per run: by the container's own report, or by onStop if it
  // died without one. Retryable failures go back on the queue (with a delay)
  // until MAX_ATTEMPTS; everything else is final and goes to the main app.
  async complete(result) {
    const job = await this.getJob()
    if (!job || job.finished) {
      return
    }
    await this.ctx.storage.put("job", { ...job, finished: true })

    if (result?.status === "failed" && result.retryable && job.attempt < MAX_ATTEMPTS) {
      console.warn(`Retrying ${job.submissionUuid} (attempt ${job.attempt + 1}): ${result.detail || result.error}`)
      await this.env.VIDEO_QUEUE.send(
        { ...toMessage(job), attempt: job.attempt + 1 },
        { delaySeconds: RETRY_DELAY_SECONDS * job.attempt }
      )
      return
    }

    if (result?.status === "failed") {
      console.error(`Processing ${job.submissionUuid} failed: ${result.detail || result.error}`)
    }

    const payload = {
      reason: job.reason,
      status: result?.status === "ready" ? "ready" : "failed",
      error: result?.status === "ready" ? null : String(result?.error || "Video processing failed").slice(0, 500),
      mode: result?.mode ?? null,
      original_kept: Boolean(result?.original_kept),
      width: result?.width ?? null,
      height: result?.height ?? null,
      fps: result?.fps ?? null,
      duration_seconds: result?.duration_seconds ?? null,
      size_bytes: result?.size_bytes ?? null,
    }
    await this.deliverResult({ submissionUuid: job.submissionUuid, payload, attempt: 1 })
  }

  async deliverResult({ submissionUuid, payload, attempt }) {
    try {
      const response = await fetch(`${this.env.APP_URL}/v2/internal/submission-videos/${submissionUuid}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.env.VIDEO_CALLBACK_SECRET}`,
        },
        body: JSON.stringify(payload),
      })
      if (response.ok) {
        return
      }
      console.error(`Result callback for ${submissionUuid} failed: ${response.status} ${await response.text().catch(() => "")}`)
    } catch (error) {
      console.error(`Result callback for ${submissionUuid} failed:`, error)
    }

    if (attempt < MAX_DELIVERY_ATTEMPTS) {
      await this.schedule(30 * 2 ** (attempt - 1), "deliverResult", { submissionUuid, payload, attempt: attempt + 1 })
    } else {
      // The main app's daily sweep re-queues submissions stuck in
      // "processing", so this isn't the end of the road.
      console.error(`Giving up on the result callback for ${submissionUuid}`)
    }
  }

  async onStop({ exitCode, reason }) {
    await this.complete({
      status: "failed",
      retryable: true,
      error: "Something went wrong while processing the video.",
      detail: `Processor stopped before reporting (exit code ${exitCode}, ${reason})`,
    })
  }

  async onError(error) {
    console.error("Video processor container error:", error)
    await this.complete({
      status: "failed",
      retryable: true,
      error: "Something went wrong while processing the video.",
      detail: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

// Assigned, not a static class field (see CompilationRenderer.outboundByHost).
SubmissionVideoProcessor.outboundByHost = {
  "media.internal": (request, env, ctx) => handleMedia(request, env, ctx),
  "status.internal": (request, env, ctx) => handleResult(request, env, ctx),
}
