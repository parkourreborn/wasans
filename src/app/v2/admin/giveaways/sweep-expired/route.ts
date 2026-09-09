import { jsonError } from "@/lib/server/http"
import { secretsMatch } from "@/lib/constant-time"
import { autoConcludeExpiredGiveaways } from "@/lib/server/repositories/giveaway-repository"
import { notifyGiveawayChanged } from "@/lib/server/services/giveaway-notify-service"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

// Called once a minute by the standalone cron-worker (see cron-worker/) --
// draws winners for any giveaway whose deadline has passed while it was
// still active (or closes it if nobody entered), so an owner never has to
// manually end one. joinGiveaway independently rejects entries past the
// deadline too, so a late sweep can't let a straggler entry in -- this is
// what actually concludes the giveaway and notifies the bot.
function isAuthorizedSweepRequest(request: Request, env: CloudflareEnv) {
  const authorization = request.headers.get("authorization")
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : ""
  return secretsMatch(provided, String(env.CRON_SECRET || ""))
}

export const POST = withV2Context(async (ctx) => {
  if (!isAuthorizedSweepRequest(ctx.request, ctx.env)) {
    return jsonError("Unauthorized", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const concluded = await autoConcludeExpiredGiveaways(ctx.db, Math.floor(Date.now() / 1000))

  if (concluded.length > 0) {
    await bumpCacheGeneration(ctx.cache)
    for (const { uuid, winnersDrawn } of concluded) {
      await notifyGiveawayChanged(ctx.db, uuid, winnersDrawn)
    }
  }

  return jsonOk({ ok: true, concluded: concluded.length }, { requestId: ctx.requestId })
})
