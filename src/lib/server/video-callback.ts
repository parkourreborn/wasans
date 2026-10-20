import "server-only"
import { secretsMatch } from "@/lib/constant-time"

// The wasans-video Worker's result callbacks (video-worker/src/processing.js)
// are not for users or the site itself: they're authenticated with
// VIDEO_CALLBACK_SECRET, which only the two Workers share.
export function isAuthorizedVideoCallback(request: Request, env: CloudflareEnv) {
  const authorization = request.headers.get("authorization")
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : ""
  return secretsMatch(provided, String(env.VIDEO_CALLBACK_SECRET || ""))
}
