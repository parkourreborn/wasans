"use client"

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <main style={{ padding: "2rem", fontFamily: "monospace" }}>
          <h1>Unexpected Error</h1>
          <p>{error.message}</p>
        </main>
      </body>
    </html>
  )
}
