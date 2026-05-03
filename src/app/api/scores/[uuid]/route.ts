import { getCloudflareContext } from "@opennextjs/cloudflare"

export async function GET(_: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const { uuid } = await params

  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "KV binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  const key = `video:${uuid}`
  const value = await env.wasans.get(key)

  if (value === null) {
    return new Response(JSON.stringify({ error: "Key not found", key }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })
  }

  return new Response(JSON.stringify({ key, value: JSON.parse(value) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const { uuid } = await params

  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "KV binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  const payload = await request.json()
  const key = `video:${uuid}`
  await env.wasans.put(key, JSON.stringify(payload))

  return new Response(JSON.stringify({ key, value: payload }), {
    status: 201,
    headers: { "content-type": "application/json" },
  })
}
