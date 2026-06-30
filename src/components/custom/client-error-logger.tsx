"use client"

import { useEffect } from "react"
import { apiV1 } from "@/lib/api"

type ClientErrorPayload = {
  source?: "client" | "client_console"
  message: string
  name?: string
  stack?: string
  path?: string
  href?: string
  filename?: string
  lineno?: number
  colno?: number
  componentStack?: string
  digest?: string
}

function payloadFromUnknown(error: unknown): ClientErrorPayload {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    }
  }

  if (typeof error === "string") {
    return { message: error }
  }

  try {
    return { message: JSON.stringify(error) }
  } catch {
    return { message: String(error) }
  }
}

function consoleArgsToPayload(args: unknown[]): ClientErrorPayload {
  const firstError = args.find((arg) => arg instanceof Error)
  const message = args
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

  return {
    source: "client_console",
    message: message || "Client console error",
    name: firstError instanceof Error ? firstError.name : undefined,
    stack: firstError instanceof Error ? firstError.stack : undefined,
  }
}

export function reportClientError(payload: ClientErrorPayload) {
  const body = {
    ...payload,
    path: payload.path || window.location.pathname,
    href: payload.href || window.location.href,
  }

  return fetch(apiV1("/admin/audit-logs"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined)
}

export function ClientErrorLogger() {
  useEffect(() => {
    const seen = new Set<string>()
    const originalConsoleError = console.error

    const report = (payload: ClientErrorPayload) => {
      const key = `${payload.source || "client"}:${payload.message}:${payload.stack || ""}`
      if (seen.has(key)) {
        return
      }

      seen.add(key)
      void reportClientError(payload)
    }

    const onError = (event: ErrorEvent) => {
      report({
        ...payloadFromUnknown(event.error || event.message),
        source: "client",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      })
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      report({
        ...payloadFromUnknown(event.reason),
        source: "client",
      })
    }

    console.error = (...args: unknown[]) => {
      originalConsoleError(...args)
      report(consoleArgsToPayload(args))
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onUnhandledRejection)

    return () => {
      console.error = originalConsoleError
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onUnhandledRejection)
    }
  }, [])

  return null
}
