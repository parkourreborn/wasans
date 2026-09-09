"use client"

import * as React from "react"
import { apiV2 } from "@/lib/api"
import { SectionCard } from "@/components/custom/page-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { XIcon } from "lucide-react"

type AnnouncementRow = {
  uuid: string
  body: string
  link_url: string | null
  expires_at: number | null
  created_at: number
  created_by_name: string | null
}
type AnnouncementsResponse = { data?: AnnouncementRow[] }

function jsonErrorMessage(json: unknown, fallback: string) {
  if (json && typeof json === "object" && "error" in json) {
    const error = (json as { error?: { message?: string } }).error
    if (error?.message) {
      return error.message
    }
  }
  return fallback
}

function formatTimestamp(value: number | null) {
  if (!value) {
    return "—"
  }
  return new Date(value * 1000).toLocaleString()
}

// datetime-local <input> values are local-time, seconds-less strings
// ("2026-09-08T14:30"); Date parses that as local time, which is what we
// want since the owner is picking a wall-clock deadline.
function datetimeLocalToUnixSeconds(value: string): number | null {
  if (!value) {
    return null
  }
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

export function AnnouncementsSection() {
  const [announcements, setAnnouncements] = React.useState<AnnouncementRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [body, setBody] = React.useState("")
  const [linkUrl, setLinkUrl] = React.useState("")
  const [expiresAt, setExpiresAt] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [deletingUuid, setDeletingUuid] = React.useState<string | null>(null)
  const [now, setNow] = React.useState(0)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(apiV2("/admin/announcements"), { cache: "no-store" })
      const json = (await response.json().catch(() => null)) as AnnouncementsResponse | null
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to load announcements"))
      }
      setAnnouncements(json?.data || [])
      setNow(Math.floor(Date.now() / 1000))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load announcements")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const createAnnouncement = async () => {
    const trimmedBody = body.trim()
    if (!trimmedBody) {
      toast.error("Announcement text is required")
      return
    }

    setCreating(true)
    try {
      const response = await fetch(apiV2("/announcements"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: trimmedBody,
          link_url: linkUrl.trim() || null,
          expires_at: datetimeLocalToUnixSeconds(expiresAt),
        }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to post announcement"))
      }
      setBody("")
      setLinkUrl("")
      setExpiresAt("")
      toast.success("Announcement posted")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to post announcement")
    } finally {
      setCreating(false)
    }
  }

  const deleteAnnouncement = async (uuid: string) => {
    setDeletingUuid(uuid)
    try {
      const response = await fetch(apiV2(`/announcements/${uuid}`), { method: "DELETE" })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to delete announcement"))
      }
      setAnnouncements((prev) => prev.filter((a) => a.uuid !== uuid))
      toast.success("Announcement deleted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to delete announcement")
    } finally {
      setDeletingUuid(null)
    }
  }

  return (
    <SectionCard
      title="Announcements"
      description="Shown as a dismissible banner site-wide. Dismissing is remembered per-account, so a message stays dismissed across devices."
    >
      <div className="space-y-3 rounded-lg border border-border p-3">
        <Textarea
          placeholder="Announcement text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Link URL (optional)"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
          <Input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            title="Auto-expires at (optional)"
          />
          <Button type="button" onClick={createAnnouncement} disabled={creating}>
            {creating ? <Spinner className="size-4" /> : null}
            Post
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading announcements...
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {announcements.map((a) => (
            <div key={a.uuid} className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm">{a.body}</p>
                <p className="text-xs text-muted-foreground">
                  {a.link_url ? `${a.link_url} · ` : ""}
                  Posted {formatTimestamp(a.created_at)}
                  {a.created_by_name ? ` by ${a.created_by_name}` : ""}
                  {a.expires_at
                    ? a.expires_at > now
                      ? ` · expires ${formatTimestamp(a.expires_at)}`
                      : ` · expired ${formatTimestamp(a.expires_at)}`
                    : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={deletingUuid === a.uuid}
                onClick={() => deleteAnnouncement(a.uuid)}
                aria-label="Delete announcement"
              >
                {deletingUuid === a.uuid ? <Spinner className="size-4" /> : <XIcon className="size-4" />}
              </Button>
            </div>
          ))}
          {announcements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No announcements yet.</p>
          ) : null}
        </div>
      )}
    </SectionCard>
  )
}
