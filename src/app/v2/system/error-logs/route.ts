import { insertSiteErrorLog } from "@/lib/server/audit"
import { loadAuthUserByUuid } from "@/lib/server/auth"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

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

export const POST = withV2Context(async (ctx) => {
  let body: Record<string, unknown>

  try {
    body = objectValue(await ctx.request.json())
  } catch {
    body = {}
  }

  try {
    const user = ctx.auth ? await loadAuthUserByUuid(ctx.db, ctx.auth.uuid, ctx.request).catch(() => null) : null
    const source = body.source === "client_console" ? "client_console" : "client"

    await insertSiteErrorLog(ctx.db, {
      source,
      message: textValue(body.message, 1000) || "Unknown client error",
      name: textValue(body.name, 200),
      stack: textValue(body.stack, 8000),
      path: textValue(body.path, 1000) || new URL(ctx.request.url).pathname,
      method: "CLIENT",
      userAgent: ctx.request.headers.get("user-agent"),
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

  return jsonOk({ ok: true }, { requestId: ctx.requestId })
})
