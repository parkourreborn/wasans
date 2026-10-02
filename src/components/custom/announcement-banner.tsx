"use client"

import * as React from "react"
import { apiV2 } from "@/lib/api"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

type AnnouncementRow = {
  uuid: string
  body: string
  link_url: string | null
  expires_at: number | null
}
type AnnouncementsResponse = { data?: AnnouncementRow[] }

export function AnnouncementBanner() {
  const { status } = useAuthSession()
  const [announcements, setAnnouncements] = React.useState<AnnouncementRow[]>([])
  const [dismissing, setDismissing] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (status === "loading") {
      return
    }

    let cancelled = false
    fetch(apiV2("/announcements"), { cache: "no-store" })
      .then((response) => response.json().catch(() => null) as Promise<AnnouncementsResponse | null>)
      .then((json) => {
        if (!cancelled) {
          setAnnouncements(json?.data || [])
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [status])

  const dismiss = async (uuid: string) => {
    setDismissing(uuid)
    setAnnouncements((prev) => prev.filter((a) => a.uuid !== uuid))
    try {
      await fetch(apiV2(`/announcements/${uuid}/dismiss`), { method: "POST" })
    } catch {
      // Best-effort: if this fails, the announcement just reappears on the
      // viewer's next visit/refetch, which is an acceptable fallback.
    } finally {
      setDismissing(null)
    }
  }

  if (announcements.length === 0) {
    return null
  }

  return (
    // Deliberately not sticky: the mobile header already claims sticky
    // top-0, and stacking a second sticky element there fights it for the
    // same offset. This shows at the very top on load/dismiss and scrolls
    // away with the rest of the page, which still satisfies "shown at the
    // top of the screen until dismissed."
    <div className="flex flex-col">
      {announcements.map((a) => (
        <div
          key={a.uuid}
          className="flex items-center justify-between gap-3 border-b border-border/70 bg-primary/10 px-4 py-2 text-sm"
        >
          <div className="min-w-0 flex-1 truncate">
            {a.link_url ? (
              <a href={a.link_url} className="underline underline-offset-2 hover:no-underline">
                {a.body}
              </a>
            ) : (
              a.body
            )}
          </div>
          {status === "authenticated" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={dismissing === a.uuid}
              onClick={() => dismiss(a.uuid)}
              aria-label="Dismiss announcement"
            >
              <XIcon className="size-4" />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
