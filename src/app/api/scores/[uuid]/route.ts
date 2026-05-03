import { getCloudflareContext } from "@opennextjs/cloudflare"

export async function GET(_: Request, { params }: { params: { uuid: string } }) {
  const { env } = await getCloudflareContext({ async: true })
  const { uuid } = await params;

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

export async function POST(_: Request, { params }: { params: { uuid: string } }) {
  const { env } = await getCloudflareContext({ async: true })
  const { uuid } = await params;

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
