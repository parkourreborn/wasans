import { ExternalLinkIcon } from "lucide-react"
import { getYoutubeEmbedId } from "@/lib/youtube"
import { cn } from "@/lib/utils"

// "90", "1m30s" or "1h2m3s" from a YouTube link's t/start parameter.
function startSeconds(url: string) {
  try {
    const params = new URL(url).searchParams
    const raw = params.get("t") || params.get("start")
    if (!raw) return 0
    if (/^\d+s?$/.test(raw)) return Number.parseInt(raw, 10)
    const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
    if (!match) return 0
    return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)
  } catch {
    return 0
  }
}

// A combo's proof video. youtube-nocookie keeps YouTube from setting
// tracking cookies until the viewer presses play.
export function YoutubeEmbed({ url, title, className }: { url: string; title: string; className?: string }) {
  const id = getYoutubeEmbedId(url)
  const start = startSeconds(url)

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden rounded-lg border border-line-strong bg-black", className)}>
      {id ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0${start ? `&start=${start}` : ""}`}
          title={title}
          className="absolute inset-0 size-full"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm text-muted-foreground">This link can&apos;t be played here.</p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
          >
            Open the video <ExternalLinkIcon className="size-3.5" aria-hidden />
          </a>
        </div>
      )}
    </div>
  )
}
