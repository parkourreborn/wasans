// Standalone Cloudflare Worker, deployed separately from the main wasans
// app. Its job is to call the main app's daily maintenance endpoints (trial
// grace-period sweep, expired rate-limit/idempotency cleanup). Kept separate
// rather than bolted onto the Next.js app's OpenNext-generated worker, since
// that build output is regenerated on every deploy and isn't a safe place to
// hand-add a scheduled() export.
//
// Deploy from this directory with `npx wrangler deploy`, and provision its
// secret with `npx wrangler secret put CRON_SECRET` (same value as the main
// wasans worker's CRON_SECRET) — see the README at the repo root for the
// full one-time setup list.

const SWEEP_URL = "https://wasans.tully.sh/v2/admin/trials/sweep"
const CLEANUP_URL = "https://wasans.tully.sh/v2/admin/maintenance/cleanup-expired"

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runSweep(env))
    ctx.waitUntil(runCleanup(env))
  },
}

async function runSweep(env) {
  try {
    const response = await fetch(SWEEP_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CRON_SECRET}`,
      },
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      console.error(`Trial sweep failed: ${response.status} ${body}`)
    }
  } catch (error) {
    console.error("Trial sweep request failed:", error)
  }
}

async function runCleanup(env) {
  try {
    const response = await fetch(CLEANUP_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CRON_SECRET}`,
      },
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      console.error(`Expired API state cleanup failed: ${response.status} ${body}`)
    }
  } catch (error) {
    console.error("Expired API state cleanup request failed:", error)
  }
}
