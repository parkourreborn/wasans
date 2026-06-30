"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { reportClientError } from "@/components/custom/client-error-logger"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    void reportClientError({
      source: "client",
      message: error.message,
      name: error.name,
      stack: error.stack,
      digest: error.digest,
    })
  }, [error])

  return (
    <html lang="en" className="dark">
      <body>
        <main className="flex min-h-svh items-center justify-center p-6">
          <div className="w-full max-w-md space-y-4 rounded-md border border-border bg-background p-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">Something broke</h1>
              <p className="text-sm text-muted-foreground">
                The error was logged for moderators to investigate.
              </p>
            </div>
            <Button type="button" onClick={reset}>
              Try again
            </Button>
          </div>
        </main>
      </body>
    </html>
  )
}
