"use client"

import { useCallback, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { XIcon } from "lucide-react"
import { formatTime } from "@/lib/format"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { useNavBadgeState } from "@/components/site/nav-badges"
import type { FailedVideos } from "@/components/site/use-nav-badges"
import { Button } from "@/components/ui/button"

// Shown to a player whose own pending run has a video that failed to
// process. Such a run can only be denied, and before this nothing told the
// player. Dismissing hides it until another run fails; the account menu
// keeps pointing at it either way, and it goes for good once the run is
// deleted (or denied).

const DISMISSED_KEY = "wasans:dismissed-failed-video"
const DISMISSED_EVENT = "wasans:dismissed-failed-video-updated"

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener)
  window.addEventListener(DISMISSED_EVENT, listener)
  return () => {
    window.removeEventListener("storage", listener)
    window.removeEventListener(DISMISSED_EVENT, listener)
  }
}

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

// Changes whenever the set of failed runs does, so a new failure shows again.
function noticeKey(failed: FailedVideos) {
  return failed.first ? `${failed.count}:${failed.first.uuid}` : ""
}

export function failedVideoHref(failed: FailedVideos, playerUuid: string) {
  return failed.count === 1 && failed.first
    ? `/submissions/${encodeURIComponent(failed.first.uuid)}`
    : `/submissions/trials?player_uuid=${encodeURIComponent(playerUuid)}&video_status=failed`
}

export function FailedVideoNotice() {
  const { user } = useAuthSession()
  const { failedVideos } = useNavBadgeState()
  const pathname = usePathname()
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => null)
  const key = noticeKey(failedVideos)

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, key)
    } catch {
      // Private mode: it just comes back on the next page.
    }
    window.dispatchEvent(new Event(DISMISSED_EVENT))
  }, [key])

  if (!user || failedVideos.count === 0 || !failedVideos.first || dismissed === key) {
    return null
  }

  const href = failedVideoHref(failedVideos, user.uuid)
  // The run page (or the filtered list) already explains it.
  if (pathname === href.split("?")[0]) {
    return null
  }

  const { trial_name, time } = failedVideos.first
  const message =
    failedVideos.count === 1
      ? `The video for your ${trial_name} ${formatTime(time)} run couldn't be processed, so it can't be reviewed.`
      : `${failedVideos.count} of your runs have videos that couldn't be processed, so they can't be reviewed.`

  return (
    <div role="status" className="border-b border-destructive/40 bg-destructive/10">
      <div className="mx-auto flex min-h-11 max-w-[1200px] items-center gap-3 px-4 py-2 text-sm">
        <span className="label-caps shrink-0 text-[13px] text-destructive">Video failed</span>
        <span className="min-w-0 flex-1">
          {message}{" "}
          <Link href={href} className="font-medium underline underline-offset-2 hover:no-underline">
            {failedVideos.count === 1 ? "Open the run to resubmit" : "See your runs"}
          </Link>
        </span>
        <Button type="button" variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Dismiss video failed notice">
          <XIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
