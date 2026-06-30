import "server-only"
import { parsePagination } from "@/lib/server/http"
import { listSubmissions, getSubmissionWithScore } from "@/lib/server/repositories/submission-repository"

export async function querySubmissions(db: D1Database, request: Request) {
  const url = new URL(request.url)
  const { page, limit, offset } = parsePagination(url, { page: 1, limit: 50, maxLimit: 100 })

  const state = url.searchParams.get("state")
  const playerUuid = url.searchParams.get("player_uuid")
  const search = String(url.searchParams.get("search") || "").trim().toLowerCase()

  const data = await listSubmissions(db, {
    limit,
    offset,
    state,
    playerUuid,
    search: search || undefined,
  })

  return {
    results: data.results,
    count: data.total,
    page,
    limit,
  }
}

export async function querySubmissionByUuid(db: D1Database, uuid: string) {
  const result = await getSubmissionWithScore(db, uuid)
  return { results: result ? [result] : [] }
}
