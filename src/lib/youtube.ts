// Handles youtube.com/watch?v=, youtu.be/, and youtube.com/shorts|embed/ links
// — the same hosts allowedComboLinkHosts validates on submission.
export function getYoutubeEmbedId(url: string) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()

    if (host === "youtu.be") {
      return parsed.pathname.split("/").filter(Boolean)[0] || null
    }

    if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
      const videoId = parsed.searchParams.get("v")
      if (videoId) {
        return videoId
      }

      const [first, second] = parsed.pathname.split("/").filter(Boolean)
      if (first === "shorts" || first === "embed") {
        return second || null
      }
    }

    return null
  } catch {
    return null
  }
}
