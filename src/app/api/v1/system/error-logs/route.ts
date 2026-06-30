import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getAuthUser } from "@/lib/server/auth"
import { insertSiteErrorLog } from "@/lib/server/audit"
import { jsonError, jsonResponse } from "@/lib/server/http"

function textValue(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  let body: Record<string, unknown>

  try {
    body = objectValue(await request.json())
  } catch {
    body = {}
  }

  try {
    const user = await getAuthUser(request, env.wasans).catch(() => null)
    const source = body.source === "client_console" ? "client_console" : "client"

    await insertSiteErrorLog(env.wasans, {
      source,
      message: textValue(body.message, 1000) || "Unknown client error",
      name: textValue(body.name, 200),
      stack: textValue(body.stack, 8000),
      path: textValue(body.path, 1000) || new URL(request.url).pathname,
      method: "CLIENT",
      userAgent: request.headers.get("user-agent"),
      actor: user,
      details: {
        href: textValue(body.href, 1000),
        filename: textValue(body.filename, 1000),
        lineno: typeof body.lineno === "number" ? body.lineno : null,
        colno: typeof body.colno === "number" ? body.colno : null,
        componentStack: textValue(body.componentStack, 8000),
        digest: textValue(body.digest, 500),
      },
    })
  } catch (error) {
    console.error("Failed to store client error log:", error)
  }

  return jsonResponse({ ok: true })
}
