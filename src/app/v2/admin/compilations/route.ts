import { compilationYouTubeDescription, compilationYouTubeTitle, type CompilationChapter } from "@/lib/server/compilations"
import { listCompilations, type CompilationRow } from "@/lib/server/repositories/compilation-repository"
import { startCompilation } from "@/lib/server/services/compilation-service"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

const publicAssetsBaseUrl = "https://assets.wasans.tully.sh"
const listLimit = 24

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function toApiCompilation(row: CompilationRow) {
  const entries = parseJson<unknown[]>(row.entries_json, [])
  return {
    id: row.id,
    title: row.title,
    trigger: row.trigger,
    requested_by_name: row.requested_by_name,
    status: row.status,
    progress_done: row.progress_done,
    progress_total: row.progress_total,
    trials: entries.length,
    skipped: parseJson<Array<{ trial: string; reason: string }>>(row.skipped_json, []),
    duration_seconds: row.duration_seconds,
    size_bytes: row.size_bytes,
    download_url: row.status === "done" ? `${publicAssetsBaseUrl}/${row.object_key}` : null,
    // Ready to paste into YouTube Studio (see compilationYouTubeTitle).
    youtube_title: compilationYouTubeTitle(new Date(row.created_at * 1000)),
    youtube_description:
      row.status === "done" ? compilationYouTubeDescription(parseJson<CompilationChapter[]>(row.chapters_json, [])) : null,
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    finished_at: row.finished_at,
  }
}

export const GET = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)

  const rows = await listCompilations(ctx.db, listLimit)
  return jsonOk(rows.map(toApiCompilation), { requestId: ctx.requestId })
})

// "Generate now" from /admin. The monthly run goes through ./scheduled.
export const POST = withV2Context(async (ctx) => {
  const user = await requireV2Owner(ctx)

  const body = (await ctx.request.json().catch(() => null)) as { title?: unknown } | null
  const title = typeof body?.title === "string" ? body.title : null

  const result = await startCompilation(ctx.db, ctx.env, { trigger: "manual", requester: user, title })
  return jsonOk(result, { status: 202, requestId: ctx.requestId })
})
