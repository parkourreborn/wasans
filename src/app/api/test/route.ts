import { getCloudflareContext } from "@opennextjs/cloudflare"

export async function GET(_: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "KV binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  const key = "counter"
  const currentValue = await env.wasans.get(key)
  const nextValue = currentValue ? Number(currentValue) + 1 : 1

//   await env.wasans.put("video:1", JSON.stringify({player: "Dobert", trial: "Neon Bold", time: "00:13.063", date:"2026-04-24" }))

  return new Response(JSON.stringify({ counter: nextValue }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}
