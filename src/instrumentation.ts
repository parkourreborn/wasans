import type { Instrumentation } from "next"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { errorToLogInput, insertSiteErrorLog } from "@/lib/server/audit"

let isWritingConsoleError = false

function textFromConsoleArgs(args: unknown[]) {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}`
      }

      if (typeof arg === "string") {
        return arg
      }

      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(" ")
}

async function getDb() {
  const { env } = await getCloudflareContext({ async: true })
  return env?.wasans ?? null
}

async function logServerConsoleError(args: unknown[]) {
  if (isWritingConsoleError) {
    return
  }

  isWritingConsoleError = true

  try {
    const db = await getDb()
    if (!db) {
      return
    }

    const firstError = args.find((arg) => arg instanceof Error)

    await insertSiteErrorLog(db, {
      source: "server_console",
      message: textFromConsoleArgs(args) || "Server console error",
      name: firstError instanceof Error ? firstError.name : null,
      stack: firstError instanceof Error ? firstError.stack : null,
      details: {
        args: args.map((arg) => {
          if (arg instanceof Error) {
            return { name: arg.name, message: arg.message, stack: arg.stack }
          }

          return arg
        }),
      },
    })
  } catch {
    // Avoid recursive console.error loops from the logger itself.
  } finally {
    isWritingConsoleError = false
  }
}

export function register() {
  const globalState = globalThis as typeof globalThis & {
    __wasansConsoleErrorPatched?: boolean
  }

  if (globalState.__wasansConsoleErrorPatched) {
    return
  }

  globalState.__wasansConsoleErrorPatched = true
  const originalConsoleError = console.error

  console.error = (...args: unknown[]) => {
    originalConsoleError(...args)
    void logServerConsoleError(args)
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  try {
    const db = await getDb()
    if (!db) {
      return
    }

    const headerValue = (name: string) => {
      const value = request.headers[name]
      return Array.isArray(value) ? value.join(", ") : value ?? null
    }

    await insertSiteErrorLog(
      db,
      errorToLogInput(error, "server", {
        path: request.path,
        method: request.method,
        userAgent: headerValue("user-agent"),
        details: {
          routePath: context.routePath,
          routeType: context.routeType,
          routerKind: context.routerKind,
          renderSource: context.renderSource,
          revalidateReason: context.revalidateReason,
          referer: headerValue("referer"),
        },
      })
    )
  } catch (logError) {
    console.error("Failed to store request error log:", logError)
  }
}
