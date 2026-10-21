// Submission video processing. The main app enqueues one message per video
// on the `video-processing` queue (new upload, Medal link, or a backfill of
// a video that predates processing). The queue consumer (src/index.js)
// starts one SubmissionVideoProcessor container per submission, which runs
// container/process.mjs and exits:
//
//   original -> remux/transcode to H.264 MP4 (<=1080p, <=60fps) -> thumbnail
//   -> scores/{uuid}.mp4 + scores/{uuid}-preview.jpg in the public bucket
//
// A "drive" job is a file from the old WR Drive (see the main app's
// wr-import-service.ts) instead: the container downloads it from Google
// Drive (streamed through /drive-source, with this Worker's
// GOOGLE_DRIVE_API_KEY), re-encodes it the same way and uploads it to
// imports/{drive file id}, with no thumbnail and nothing published, so the
// import queue can play it. The file never passes through the main app.
//
// Originals live in the private wasans-uploads bucket as originals/{uuid}
// (moderators can download them; the main app deletes them 7 days after
// review, or moves a world record's to world-records/ for good). Players'
// direct uploads land in incoming/ first and are moved to originals/ when
// processing starts.
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
// How long after starting a job its container must be running (or done).
const START_CHECK_SECONDS = 60
// The platform's answers when every instance is taken: the container was
// never placed, so it isn't a failed run.
const CAPACITY_ERROR = /maximum number of running container instances exceeded|no container instance that can be provided|too many containers per second/i

const MAX_VIDEO_BYTES = 500 * 1024 * 1024
const MAX_DURATION_SECONDS = 10 * 60
// Drive files are the old originals, never re-encoded, so they get more
// room (the container has 16 GB of disk for the file and its encode).
const MAX_DRIVE_BYTES = 4 * 1024 * 1024 * 1024
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024
// "import": a world record from the old WR Drive. The main app has already
// put its file at originals/{uuid}, or, when it reprocesses one that failed,
// names where it's archived (originalKey, read-only).
// "drive": a file from the old WR Drive waiting in the import queue.
const REASONS = new Set(["upload", "medal", "backfill", "import", "drive"])
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"

export function processorName(job) {
  return job.reason === "drive" ? `drive-${job.driveFileId}` : `submission-${job.submissionUuid}`
}

function jobLabel(job) {
  return job.reason === "drive" ? `Drive file ${job.driveFileId}` : job.submissionUuid
}

function keysFor(job) {
  if (job.reason === "drive") {
    return { original: `imports/${job.driveFileId}` }
  }
  return {
    original: job.originalKey ?? `originals/${job.submissionUuid}`,
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

  // A Drive file can only be downloaded and put in imports/, nothing else.
  if (job.reason === "drive") {
    if (request.method === "GET" && pathname === "/drive-source") {
      return fetchDriveFile(env, job.driveFileId)
    }
    const replace = pathname.match(/^\/original\/multipart\/(create|part|complete|abort)$/)
    if (replace) {
      return handleMultipart(request, env.UPLOADS, keys.original, replace[1], {
        contentType: "video/mp4",
        customMetadata: { drive_file_id: job.driveFileId },
      })
    }
    return new Response("Forbidden", { status: 403 })
  }

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

// The file straight from Google Drive, streamed to the container as it
// arrives. 501 when this Worker has no API key, which retrying won't fix.
async function fetchDriveFile(env, driveFileId) {
  if (!env.GOOGLE_DRIVE_API_KEY) {
    return new Response("The wasans-video Worker has no GOOGLE_DRIVE_API_KEY secret", { status: 501 })
  }
  const url = new URL(`${DRIVE_FILES_URL}/${encodeURIComponent(driveFileId)}`)
  url.searchParams.set("alt", "media")
  url.searchParams.set("supportsAllDrives", "true")
  url.searchParams.set("key", env.GOOGLE_DRIVE_API_KEY)
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    const json = await response.json().catch(() => null)
    return new Response(json?.error?.message || `Google Drive answered ${response.status}`, { status: response.status || 502 })
  }
  const length = response.headers.get("content-length")
  return new Response(response.body, { headers: length ? { "content-length": length } : {} })
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
  if (!REASONS.has(body?.reason)) {
    return null
  }
  const drive = body.reason === "drive"
  const submissionUuid = drive ? null : String(body.submissionUuid || "")
  const driveFileId = drive ? String(body.driveFileId || "") : null
  if (drive ? !/^[A-Za-z0-9_-]{10,128}$/.test(driveFileId) : !/^[A-Za-z0-9_-]{6,64}$/.test(submissionUuid)) {
    return null
  }
  if (body.reason === "upload" && !String(body.incomingKey || "").startsWith("incoming/")) {
    return null
  }
  if (body.reason === "medal" && !/^https:\/\/(www\.)?medal\.tv\//.test(String(body.medalUrl || ""))) {
    return null
  }
  // An import job only ever reads its original, so this can't be used to
  // write into the archive.
  if (body.originalKey != null && (body.reason !== "import" || !String(body.originalKey).startsWith("world-records/"))) {
    return null
  }
  return {
    submissionUuid,
    driveFileId,
    reason: body.reason,
    incomingKey: body.reason === "upload" ? body.incomingKey : null,
    medalUrl: body.reason === "medal" ? body.medalUrl : null,
    originalKey: body.originalKey != null ? String(body.originalKey) : null,
    attempt: Number.isInteger(body.attempt) && body.attempt > 0 ? body.attempt : 1,
  }
}

function toMessage(job) {
  const { submissionUuid, driveFileId, reason, incomingKey, medalUrl, originalKey, attempt } = job
  return { submissionUuid, driveFileId, reason, incomingKey, medalUrl, originalKey, attempt }
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
  // A Drive file is copied once imports/{id} exists (it only appears when
  // the upload completes). A leftover duplicate job for it would download
  // and re-encode the whole file again, holding an instance for nothing, so
  // it just reports the copy as done instead. The main app ignores that if
  // it already knew.
  if (job.reason === "drive" && (await env.UPLOADS.head(keysFor(job).original))) {
    await reportDriveCopied(env, job.driveFileId)
    return
  }
  await getContainer(env.VIDEO_PROCESSOR, processorName(job)).startJob(job)
}

// Throws if the main app can't be reached, so the queue tries again.
async function reportDriveCopied(env, driveFileId) {
  const response = await fetch(`${env.APP_URL}/v2/internal/wr-imports/${driveFileId}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.VIDEO_CALLBACK_SECRET}` },
    body: JSON.stringify({ reason: "drive", status: "ready", error: null }),
  })
  if (!response.ok) {
    throw new Error(`Reporting Drive file ${driveFileId} as copied failed: ${response.status}`)
  }
  console.log(`Drive file ${driveFileId} is already copied; skipped a duplicate job`)
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
      throw new Error(`${jobLabel(job)} is already being processed`)
    }
    this.startingJob = true

    const runId = crypto.randomUUID()
    try {
      await this.ctx.storage.put("job", { ...job, runId, finished: false })
      const containerJob = {
        ...toMessage(job),
        maxBytes: job.reason === "drive" ? MAX_DRIVE_BYTES : MAX_VIDEO_BYTES,
        maxDurationSeconds: MAX_DURATION_SECONDS,
      }
      await this.start({ envVars: { JOB_JSON: toBase64(JSON.stringify(containerJob)) } })
      // onStop ignores stops while the container is starting, so one that
      // already died has to be counted here.
      if (!this.ctx.container?.running) {
        await this.complete({
          status: "failed",
          retryable: true,
          error: "Something went wrong while processing the video.",
          detail: "Processor exited right after starting",
        })
      } else {
        await this.schedule(START_CHECK_SECONDS, "checkStarted", { runId })
      }
    } catch (error) {
      await this.ctx.storage.put("job", { ...job, finished: true })
      throw error
    } finally {
      this.startingJob = false
    }
  }

  // A container that never gets an instance can end without onStop or
  // onError firing, which would leave its job lost until the main app's
  // daily sweep, so startJob checks back.
  async checkStarted({ runId }) {
    const job = await this.getJob()
    if (!job || job.finished || job.runId !== runId || this.ctx.container?.running) {
      return
    }
    await this.requeue("its container never got an instance")
  }

  // The container never ran, so the job goes back on the queue without
  // using one of its attempts.
  async requeue(why) {
    const job = await this.getJob()
    if (!job || job.finished) {
      return
    }
    await this.ctx.storage.put("job", { ...job, finished: true })
    console.warn(`Queueing ${jobLabel(job)} again: ${why}`)
    await this.env.VIDEO_QUEUE.send(toMessage(job), { delaySeconds: RETRY_DELAY_SECONDS })
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
      console.warn(`Retrying ${jobLabel(job)} (attempt ${job.attempt + 1}): ${result.detail || result.error}`)
      await this.env.VIDEO_QUEUE.send(
        { ...toMessage(job), attempt: job.attempt + 1 },
        { delaySeconds: RETRY_DELAY_SECONDS * job.attempt }
      )
      return
    }

    if (result?.status === "failed") {
      console.error(`Processing ${jobLabel(job)} failed: ${result.detail || result.error}`)
    }

    const payload = {
      reason: job.reason,
      // Which file an import read: the main app ignores a leftover job's
      // result for a run whose original has since been archived.
      original_key: job.reason === "import" ? (job.originalKey ?? null) : null,
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
    const path =
      job.reason === "drive"
        ? `/v2/internal/wr-imports/${job.driveFileId}`
        : `/v2/internal/submission-videos/${job.submissionUuid}`
    await this.deliverResult({ path, label: jobLabel(job), payload, attempt: 1 })
  }

  async deliverResult({ path, label, submissionUuid, payload, attempt }) {
    // Retries scheduled before drive jobs existed only carry submissionUuid.
    path ??= `/v2/internal/submission-videos/${submissionUuid}`
    label ??= submissionUuid
    try {
      const response = await fetch(`${this.env.APP_URL}${path}`, {
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
      console.error(`Result callback for ${label} failed: ${response.status} ${await response.text().catch(() => "")}`)
    } catch (error) {
      console.error(`Result callback for ${label} failed:`, error)
    }

    if (attempt < MAX_DELIVERY_ATTEMPTS) {
      await this.schedule(30 * 2 ** (attempt - 1), "deliverResult", { path, label, payload, attempt: attempt + 1 })
    } else {
      // The main app's daily sweep re-queues submissions stuck in
      // "processing", so this isn't the end of the road.
      console.error(`Giving up on the result callback for ${label}`)
    }
  }

  // Both of these also fire while startJob is still starting the container,
  // when a start fails (every instance busy, too many starts at once) or
  // the alarm sees it "stopped" before it's up. That isn't a run: startJob
  // throws and the queue tries the message again without using an attempt.
  // Counting it here as well used up the job's attempts while it waited for
  // an instance, and queued an extra copy of it each time.
  async onStop({ exitCode, reason }) {
    if (this.startingJob) {
      return
    }
    await this.complete({
      status: "failed",
      retryable: true,
      error: "Something went wrong while processing the video.",
      detail: `Processor stopped before reporting (exit code ${exitCode}, ${reason})`,
    })
  }

  async onError(error) {
    console.error("Video processor container error:", error)
    if (this.startingJob) {
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    if (CAPACITY_ERROR.test(message)) {
      await this.requeue(message)
      throw error
    }
    await this.complete({
      status: "failed",
      retryable: true,
      error: "Something went wrong while processing the video.",
      detail: message,
    })
    throw error
  }
}

// Assigned, not a static class field (see CompilationRenderer.outboundByHost).
SubmissionVideoProcessor.outboundByHost = {
  "media.internal": (request, env, ctx) => handleMedia(request, env, ctx),
  "status.internal": (request, env, ctx) => handleResult(request, env, ctx),
}
