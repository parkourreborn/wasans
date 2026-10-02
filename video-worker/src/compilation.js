// WR compilation renderer. The main wasans app builds the job (which WRs,
// in which order, title, R2 key; see src/lib/server/services/
// compilation-service.ts) and POSTs it to this Worker through its
// VIDEO_SERVICE service binding. A single Container (container/render.mjs)
// then renders the video with ffmpeg and exits.
//
// The container reaches R2 and D1 only through the outbound handlers below.
// It makes plain HTTP requests to virtual hosts, which run here in the
// Workers runtime with this Worker's bindings, so no R2/D1 credentials ever
// enter the container:
//
//   r2.internal       read submission clips, multipart-upload the result
//   status.internal   write progress/result to the wr_compilations row
//
// Posting to YouTube is done by hand from /admin (copy title/description).
// API uploads from an unaudited Google project are locked private for good.

import { Container, getContainer } from "@cloudflare/containers"
import { handleMultipart, json, toBase64 } from "./shared.js"

// Only one compilation renders at a time, so every job goes to the same
// container instance.
const RENDERER_NAME = "renderer"

const TERMINAL_STATUSES = ["done", "failed"]
const REPORTED_STATUSES = new Set(["rendering", "uploading", "done", "failed"])

async function markFailed(env, jobId, message) {
  if (!jobId) return
  const now = Math.floor(Date.now() / 1000)
  await env.wasans
    .prepare(
      `UPDATE wr_compilations
       SET status = 'failed', error = ?, updated_at = ?, finished_at = ?
       WHERE id = ? AND status NOT IN ('done', 'failed')`
    )
    .bind(String(message).slice(0, 2000), now, now, jobId)
    .run()
}

// Resolves the job the container's own Durable Object is running, so a
// handler can only ever touch the job that container was started for.
async function currentJobFor(env, ctx) {
  const stub = env.COMPILATION_RENDERER.get(env.COMPILATION_RENDERER.idFromString(ctx.containerId))
  return stub.currentJob()
}

async function handleR2(request, env, ctx) {
  const url = new URL(request.url)
  const bucket = env.SUBMISSION_VIDEOS

  // GET /object/<key>: source clips. Read-only, and only submission videos.
  if (request.method === "GET" && url.pathname.startsWith("/object/")) {
    const key = decodeURIComponent(url.pathname.slice("/object/".length))
    if (!key.startsWith("scores/")) {
      return new Response("Forbidden", { status: 403 })
    }
    const object = await bucket.get(key)
    if (!object) {
      return new Response("Not found", { status: 404 })
    }
    return new Response(object.body, { headers: { "content-type": "video/mp4" } })
  }

  // /compilation/multipart/<op>: the finished video, written to the job's
  // own compilations/ key, so the container can't overwrite anything else.
  const match = url.pathname.match(/^\/compilation\/multipart\/(create|part|complete|abort)$/)
  if (match) {
    const job = await currentJobFor(env, ctx)
    if (!job?.objectKey?.startsWith("compilations/")) {
      return new Response("Forbidden", { status: 403 })
    }
    return handleMultipart(request, bucket, job.objectKey, match[1], { contentType: "video/mp4" })
  }

  return new Response("Not found", { status: 404 })
}

async function handleStatus(request, env, ctx) {
  const update = await request.json()
  const jobId = (await currentJobFor(env, ctx))?.id
  if (!jobId || update.id !== jobId || !REPORTED_STATUSES.has(update.status)) {
    return new Response("Forbidden", { status: 403 })
  }

  const now = Math.floor(Date.now() / 1000)
  const finished = TERMINAL_STATUSES.includes(update.status)
  const asJson = (value) => (value === undefined ? null : JSON.stringify(value))
  const orNull = (value) => (value === undefined ? null : value)

  await env.wasans
    .prepare(
      `UPDATE wr_compilations SET
         status = ?,
         progress_done = COALESCE(?, progress_done),
         progress_total = COALESCE(?, progress_total),
         skipped_json = COALESCE(?, skipped_json),
         chapters_json = COALESCE(?, chapters_json),
         duration_seconds = COALESCE(?, duration_seconds),
         size_bytes = COALESCE(?, size_bytes),
         error = COALESCE(?, error),
         updated_at = ?,
         finished_at = CASE WHEN ? THEN ? ELSE finished_at END
       WHERE id = ? AND status NOT IN ('done', 'failed')`
    )
    .bind(
      update.status,
      orNull(update.progress_done),
      orNull(update.progress_total),
      asJson(update.skipped),
      asJson(update.chapters),
      orNull(update.duration_seconds),
      orNull(update.size_bytes),
      orNull(update.error),
      now,
      finished ? 1 : 0,
      now,
      jobId
    )
    .run()

  return json({ ok: true })
}

export class CompilationRenderer extends Container {
  // A full compilation takes well under this; it's only a backstop in case
  // ffmpeg ever hangs. The container exits on its own when it finishes.
  sleepAfter = "4h"
  // No internet: everything the renderer needs is served by the
  // *.internal outbound handlers below, which run regardless (the
  // container library checks host handlers before this setting).
  enableInternet = false

  async currentJob() {
    return (await this.ctx.storage.get("job")) ?? null
  }

  async currentJobId() {
    return (await this.currentJob())?.id ?? null
  }

  async startJob(job) {
    // A Durable Object runs one event at a time, so this check-and-set is
    // atomic: two near-simultaneous requests can't both see an idle
    // container and race to start it with different jobs.
    if (this.startingJob || this.ctx.container?.running) {
      throw new Error("A compilation is already rendering")
    }
    this.startingJob = true

    try {
      await this.ctx.storage.put("job", { id: job.id, objectKey: job.objectKey })
      await this.start({ envVars: { JOB_JSON: toBase64(JSON.stringify(job)) } })
    } finally {
      this.startingJob = false
    }
  }

  // Covers every way a render can end without reporting "done"/"failed"
  // itself: a crash, an OOM kill, the sleepAfter backstop, a host restart.
  // A job that already finished is left untouched (see markFailed's WHERE).
  async onStop({ exitCode, reason }) {
    const jobId = await this.currentJobId()
    await markFailed(this.env, jobId, `Renderer stopped before finishing (exit code ${exitCode}, ${reason})`)
  }

  async onError(error) {
    console.error("Compilation container error:", error)
    const jobId = await this.currentJobId()
    await markFailed(this.env, jobId, `Renderer error: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

// Assigned rather than declared as a static class field: the base class
// implements outboundByHost as a setter that registers the handlers, and a
// class field would shadow it without registering anything.
CompilationRenderer.outboundByHost = {
  "r2.internal": (request, env, ctx) => handleR2(request, env, ctx),
  "status.internal": (request, env, ctx) => handleStatus(request, env, ctx),
}

// POST /compilations from the main app (see src/index.js).
export async function handleCompilationRequest(request, env) {
  const job = await request.json().catch(() => null)
  if (!job?.id || !Array.isArray(job.entries) || !job.objectKey?.startsWith("compilations/")) {
    return json({ error: "Invalid job" }, 400)
  }

  try {
    await getContainer(env.COMPILATION_RENDERER, RENDERER_NAME).startJob(job)
    return json({ ok: true }, 202)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ error: message }, message.includes("already rendering") ? 409 : 500)
  }
}
