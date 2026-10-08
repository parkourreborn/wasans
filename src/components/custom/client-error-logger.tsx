"use client"

import { useEffect } from "react"
import { apiV2 } from "@/lib/api"

type ClientErrorPayload = {
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

export function reportClientError(payload: ClientErrorPayload) {
  const body = {
    ...payload,
    path: payload.path || window.location.pathname,
    href: payload.href || window.location.href,
  }

  return fetch(apiV2("/system/error-logs"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined)
}

// Only real crashes are reported: uncaught errors and unhandled rejections.
// console.error is deliberately not captured; libraries and React dev warnings
// write there and it buried the actual errors.
export function ClientErrorLogger() {
  useEffect(() => {
    const seen = new Set<string>()

    const report = (payload: ClientErrorPayload) => {
      const key = `${payload.message}:${payload.stack || ""}`
      if (seen.has(key)) {
        return
      }

      seen.add(key)
      void reportClientError(payload)
    }

    const onError = (event: ErrorEvent) => {
      report({
        ...payloadFromUnknown(event.error || event.message),
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      })
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      report({
        ...payloadFromUnknown(event.reason),
      })
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onUnhandledRejection)

    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onUnhandledRejection)
    }
  }, [])

  return null
}
