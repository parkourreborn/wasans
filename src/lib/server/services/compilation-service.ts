import "server-only"
import { insertAuditLog } from "@/lib/server/audit"
import {
  compilationAsOf,
  compilationFileStem,
  compilationObjectKey,
  compilationTitle,
  formatWrHeldFor,
  isCompilationStale,
  type CompilationTrigger,
} from "@/lib/server/compilations"
import {
  findInProgressCompilation,
  insertCompilation,
  listCompilationEntries,
  markCompilationFailed,
} from "@/lib/server/repositories/compilation-repository"
import { ApiError } from "@/lib/server/v2/http"
import { generateShortId } from "@/lib/utils"

const MAX_TITLE_LENGTH = 100

type Requester = { uuid: string; player_name: string }

// Queues a WR compilation and hands it to the wasans-video Worker
// (video-worker/) through the VIDEO_SERVICE service binding. Returns
// as soon as the container has been started; the render itself takes
// minutes and reports progress into the wr_compilations row.
export async function startCompilation(
  db: D1Database,
  env: CloudflareEnv,
  options: { trigger: CompilationTrigger; requester?: Requester | null; title?: string | null }
) {
  if (!env.VIDEO_SERVICE) {
    throw new ApiError("The compilation renderer isn't configured", 503, "internal_error")
  }

  const nowDate = new Date()
  const now = Math.floor(nowDate.getTime() / 1000)

  const inProgress = await findInProgressCompilation(db)
  if (inProgress) {
    if (!isCompilationStale(inProgress.updated_at, now)) {
      throw new ApiError("A compilation is already being rendered", 409, "conflict", { id: inProgress.id })
    }
    await markCompilationFailed(db, inProgress.id, "Timed out without a result from the renderer", now)
  }

  const entries = (await listCompilationEntries(db)).map((entry) => ({
    ...entry,
    heldFor: formatWrHeldFor(entry.wrDate, now),
  }))
  if (entries.length === 0) {
    throw new ApiError("There are no world records to compile", 400, "bad_request")
  }

  const id = generateShortId()
  const title = (options.title?.trim() || compilationTitle(nowDate, options.trigger)).slice(0, MAX_TITLE_LENGTH)
  const objectKey = compilationObjectKey(nowDate, options.trigger, id)

  await insertCompilation(db, {
    id,
    title,
    trigger: options.trigger,
    requestedByUuid: options.requester?.uuid ?? null,
    requestedByName: options.requester?.player_name ?? null,
    objectKey,
    entries,
    now,
  })

  try {
    const response = await env.VIDEO_SERVICE.fetch("https://wasans-video/compilations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        title,
        asOf: compilationAsOf(nowDate, options.trigger),
        objectKey,
        downloadFilename: `${compilationFileStem(nowDate, options.trigger)}.mp4`,
        entries,
      }),
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error || `Renderer responded with ${response.status}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await markCompilationFailed(db, id, `Could not start the renderer: ${message}`, now)
    throw new ApiError(`Could not start the renderer: ${message}`, 502, "internal_error")
  }

  await insertAuditLog(db, "wr_compilation_started", "wr_compilation", id, {
    actor: options.requester ?? null,
    details: { trigger: options.trigger, title, trials: entries.length },
  })

  return { id, title, objectKey, trials: entries.length }
}
