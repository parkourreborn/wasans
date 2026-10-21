// Pure rules for submission video uploads and processing. No DB, no
// "server-only", so it stays testable like trial-lifecycle.ts. The
// container that does the actual processing lives in video-worker/.

import { isArchiveKey } from "@/lib/wr-archive"

// Server-side transcoding means the browser no longer has to hand us an
// H.264 MP4; anything ffmpeg reads is fine. The container enforces the same
// size cap again while downloading, and the duration cap after probing.
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024
export const MAX_VIDEO_DURATION_SECONDS = 10 * 60

// A presigned PUT URL only has to be *started* before it expires (R2 checks
// the signature when the request begins), so this can stay short even for
// a large upload on a slow connection.
export const UPLOAD_URL_TTL_SECONDS = 15 * 60

// How long after getting an upload URL the finished upload can still be
// turned into a submission. Unconsumed uploads in incoming/ are deleted by
// the bucket's 1-day lifecycle rule regardless.
export const UPLOAD_CONSUME_WINDOW_SECONDS = 6 * 60 * 60

// A submission still "processing" after this long lost its job somewhere
// (queue message dead-lettered, result callback never delivered); the daily
// maintenance sweep re-queues it. Comfortably past the worst case of three
// attempts with retry delays.
export const STUCK_PROCESSING_SECONDS = 3 * 60 * 60

// Backfill jobs in flight at once, so a backfill of every legacy video
// never starves new uploads of container instances.
export const BACKFILL_CONCURRENCY = 3
// A claimed backfill item with no result after this long is reclaimed.
export const BACKFILL_CLAIM_TIMEOUT_SECONDS = 2 * 60 * 60

const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "mov", "webm", "mkv", "avi", "wmv", "flv", "mpg", "mpeg", "ts", "3gp"])

// Browsers report "" for formats they don't recognise (mkv often), so the
// extension is the fallback. The signed Content-Type is whatever we return
// here, and the client must send exactly that.
export function resolveUploadContentType(contentType: unknown, filename: unknown): string | null {
  const type = typeof contentType === "string" ? contentType.trim().toLowerCase() : ""
  if (/^video\/[a-z0-9.+-]+$/.test(type)) {
    return type
  }

  const name = typeof filename === "string" ? filename.toLowerCase() : ""
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : ""
  if ((type === "" || type === "application/octet-stream") && VIDEO_EXTENSIONS.has(extension)) {
    return "application/octet-stream"
  }

  return null
}

export function isValidUploadSize(size: unknown): size is number {
  return typeof size === "number" && Number.isInteger(size) && size > 0 && size <= MAX_UPLOAD_BYTES
}

export function isUploadConsumable(
  upload: { player_uuid: string; created_at: number; consumed_at: number | null },
  playerUuid: string,
  nowSeconds: number
) {
  return (
    upload.player_uuid === playerUuid &&
    upload.consumed_at == null &&
    nowSeconds - upload.created_at <= UPLOAD_CONSUME_WINDOW_SECONDS
  )
}

// "import": a world record from the old WR Drive, whose file is already at
// originals/{uuid} (see wr-import-service.ts), or in the archive at
// originalKey when one that failed is reprocessed. "drive": that file while
// it waits in the import queue.
export type VideoJobMessage =
  | { submissionUuid: string; reason: "upload"; incomingKey: string; attempt: 1 }
  | { submissionUuid: string; reason: "medal"; medalUrl: string; attempt: 1 }
  | { submissionUuid: string; reason: "backfill"; attempt: 1 }
  | { submissionUuid: string; reason: "import"; originalKey?: string; attempt: 1 }
  // A file waiting in the WR import queue, re-encoded in place at
  // imports/{driveFileId}.
  | { driveFileId: string; reason: "drive"; attempt: 1 }

// Rebuilds the queue message for a submission from what's stored on it,
// for the stuck-job sweep. Null when there's nothing to rebuild from.
export function videoJobFromStoredSource(
  submissionUuid: string,
  sourceType: string | null,
  sourceRef: string | null,
  originalKey: string | null = null
): VideoJobMessage | null {
  if (sourceType === "upload" && sourceRef?.startsWith("incoming/")) {
    return { submissionUuid, reason: "upload", incomingKey: sourceRef, attempt: 1 }
  }
  if (sourceType === "medal" && sourceRef) {
    return { submissionUuid, reason: "medal", medalUrl: sourceRef, attempt: 1 }
  }
  if (sourceType === "import") {
    return isArchiveKey(originalKey)
      ? { submissionUuid, reason: "import", originalKey, attempt: 1 }
      : { submissionUuid, reason: "import", attempt: 1 }
  }
  return null
}
