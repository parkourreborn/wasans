import { jsonError } from "@/lib/server/http"
import { listTrialLifecycles } from "@/lib/server/repositories/trial-repository"
import { refreshPbsForTrial } from "@/lib/server/pbs"
import { refreshScoresForTrial } from "@/lib/server/player-scores"
import { refreshWorldRecords } from "@/lib/server/wrs"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

// Called once a day by a small standalone Cloudflare Cron Trigger worker
// (see cron-worker/ at the repo root) — not by users or the site itself.
// Re-derives WRs/PBs/scores for every trial unconditionally rather than
// trying to precisely detect "did a grace boundary just cross" — trial
// counts are small (dozens, not thousands) so a full daily sweep is cheap,
// idempotent, and self-healing if a run is ever missed.
function isAuthorizedSweepRequest(request: Request, env: CloudflareEnv) {
  const authorization = request.headers.get("authorization")
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : ""
  return Boolean(provided && env.CRON_SECRET && provided === env.CRON_SECRET)
}

export const POST = withV2Context(async (ctx) => {
  if (!isAuthorizedSweepRequest(ctx.request, ctx.env)) {
    return jsonError("Unauthorized", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const trials = await listTrialLifecycles(ctx.db)

  for (const trial of trials) {
    await refreshWorldRecords(ctx.db, trial.name)
    await refreshPbsForTrial(ctx.db, trial.name)
    await refreshScoresForTrial(ctx.db, trial.name, { discordUpdateMode: "changed" })
  }

  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ ok: true, trials_processed: trials.length }, { requestId: ctx.requestId })
})
