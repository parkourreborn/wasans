import { jsonError } from "@/lib/server/http"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import { requireV2User, withV2Context } from "@/lib/server/v2/http"

// Self-serve right-of-access export: everything the site holds about the
// calling player, in one JSON file. Deliberately reads straight off each
// table with its own query rather than reusing repository helpers built for
// paginated/public-facing views (those drop fields, like player_ips, that
// have no public-facing use but are still the player's own personal data).
export const GET = withV2Context(async (ctx) => {
  if (!ctx.auth) {
    return jsonError("Authentication required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const user = await requireV2User(ctx)

  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:account:export", user.uuid), {
    limit: 5,
    windowSeconds: 300,
  })

  if (!rate.allowed) {
    return jsonError("Rate limit exceeded", 429, {
      code: "rate_limited",
      requestId: ctx.requestId,
      details: { retry_after: rate.retryAfter },
      headers: { "retry-after": String(rate.retryAfter) },
    })
  }

  const db = ctx.db
  const uuid = user.uuid

  const [
    playerResult,
    oauthResult,
    ipResult,
    submissionsResult,
    pbsResult,
    wrsResult,
    comboSubmissionsResult,
    comboPbsResult,
    giveawayEntriesResult,
    giveawayWinnersResult,
    prizeWinnersResult,
    prizeCandidatesResult,
    announcementDismissalsResult,
    auditLogsResult,
  ] = await db.batch([
    db.prepare(
      `SELECT uuid, player_id, discord_avatar, discord_discriminator, auth_provider, player_name, date_joined,
              permission, score, account_status, legal_terms_accepted_at, legal_privacy_accepted_at, legal_version
       FROM players WHERE uuid = ?`
    ).bind(uuid),
    db.prepare(`SELECT provider, provider_account_id, created_at, updated_at FROM oauth_accounts WHERE player_uuid = ?`).bind(uuid),
    db.prepare(`SELECT ip_address, count, first_seen, last_seen FROM player_ips WHERE player_uuid = ?`).bind(uuid),
    db.prepare(`SELECT * FROM submissions WHERE player_uuid = ? ORDER BY date DESC`).bind(uuid),
    db.prepare(`SELECT * FROM pbs WHERE player_uuid = ? ORDER BY trial_name ASC`).bind(uuid),
    db.prepare(`SELECT * FROM wrs WHERE player_uuid = ? ORDER BY trial_name ASC`).bind(uuid),
    db.prepare(`SELECT * FROM combo_submissions WHERE player_uuid = ? ORDER BY date DESC`).bind(uuid),
    db.prepare(`SELECT * FROM combo_pbs WHERE player_uuid = ? ORDER BY category_slug ASC`).bind(uuid),
    db.prepare(`SELECT giveaway_uuid, player_name, entered_at FROM giveaway_entries WHERE player_uuid = ?`).bind(uuid),
    db.prepare(
      `SELECT uuid, giveaway_uuid, player_name, round, is_current, drawn_at, claimed, claimed_at
       FROM giveaway_winners WHERE player_uuid = ?`
    ).bind(uuid),
    db.prepare(
      `SELECT uuid, prize_uuid, player_name, source, awarded_at, claimed, claimed_at
       FROM prize_winners WHERE player_uuid = ?`
    ).bind(uuid),
    db.prepare(
      `SELECT uuid, prize_uuid, player_name, status, event_details, detected_at, reviewed_at
       FROM prize_candidates WHERE player_uuid = ?`
    ).bind(uuid),
    db.prepare(`SELECT announcement_uuid, dismissed_at FROM announcement_dismissals WHERE player_uuid = ?`).bind(uuid),
    db.prepare(
      `SELECT created_at, action, entity_type, entity_uuid, target_type, target_uuid, details
       FROM audit_logs WHERE actor_uuid = ? ORDER BY created_at DESC`
    ).bind(uuid),
  ])

  const body = {
    exported_at: Math.floor(Date.now() / 1000),
    player: playerResult.results[0] ?? null,
    oauth_accounts: oauthResult.results || [],
    // Your recorded login IP history -- see the Privacy Policy's "IP addresses" section.
    ip_history: ipResult.results || [],
    submissions: submissionsResult.results || [],
    pbs: pbsResult.results || [],
    wrs: wrsResult.results || [],
    combo_submissions: comboSubmissionsResult.results || [],
    combo_pbs: comboPbsResult.results || [],
    giveaway_entries: giveawayEntriesResult.results || [],
    giveaway_winners: giveawayWinnersResult.results || [],
    prize_winners: prizeWinnersResult.results || [],
    prize_candidates: prizeCandidatesResult.results || [],
    announcement_dismissals: announcementDismissalsResult.results || [],
    audit_logs: auditLogsResult.results || [],
  }

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="wasans-data-${uuid.slice(0, 8)}.json"`,
      "cache-control": "no-store",
      "x-request-id": ctx.requestId,
    },
  })
})
