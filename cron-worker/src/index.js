// Standalone Cloudflare Worker, deployed separately from the main wasans
// app. Its only job is to call the main app's trial grace-period sweep
// endpoint once a day. Kept separate rather than bolted onto the Next.js
// app's OpenNext-generated worker, since that build output is regenerated
// on every deploy and isn't a safe place to hand-add a scheduled() export.
//
// Deploy from this directory with `npx wrangler deploy`, and provision its
// secret with `npx wrangler secret put CRON_SECRET` (same value as the main
// wasans worker's CRON_SECRET) — see the README at the repo root for the
// full one-time setup list.

const SWEEP_URL = "https://wasans.tully.sh/v2/admin/trials/sweep"

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runSweep(env))
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
