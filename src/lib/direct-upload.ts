"use client"

import { apiV2 } from "@/lib/api"
import { getSubmissionErrorMessage } from "@/lib/submission-errors"

// Browser side of video uploads. The file never goes through our Worker:
//   1. POST /v2/uploads gets a one-off presigned PUT URL for this file
//   2. the file is PUT straight to the private R2 bucket (XHR, for progress)
//   3. the caller sends the returned upload_id with the submission
// The server transcodes and thumbnails it afterwards, so any common video
// format is fine here; only size and "is it a video" are checked up front.

export const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024
export const VIDEO_FILE_ACCEPT = "video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi,.wmv,.flv,.mpg,.mpeg,.ts,.3gp"

const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|mkv|avi|wmv|flv|mpe?g|ts|3gp)$/i

// Browsers leave file.type empty for some containers (often .mkv), so the
// extension counts too.
export function isVideoFile(file: File) {
  return file.type.startsWith("video/") || VIDEO_EXTENSIONS.test(file.name)
}

// Null when the file is acceptable, otherwise the message to show.
export function validateVideoFile(file: File): string | null {
  if (!isVideoFile(file)) {
    return "That file isn't a video."
  }
  if (file.size === 0) {
    return "That file is empty."
  }
  if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
    return "Videos must be under 500 MB."
  }
  return null
}

type UploadTicket = {
  upload_id: string
  method: "PUT"
  url: string
  headers: Record<string, string>
}

async function requestUploadTicket(file: File): Promise<UploadTicket> {
  const response = await fetch(apiV2("/uploads"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    // A non-video type on a file we accepted by extension (e.g. some
    // browsers' .mkv) is sent as unknown, so the server falls back to the
    // extension too.
    body: JSON.stringify({
      size: file.size,
      content_type: file.type.startsWith("video/") ? file.type : "",
      filename: file.name,
    }),
  })
  const json = (await response.json().catch(() => null)) as { data?: UploadTicket; error?: { message?: string } } | null
  if (!response.ok || !json?.data) {
    throw new Error(getSubmissionErrorMessage(json?.error, "Couldn't start the upload"))
  }
  return json.data
}

function putFile(file: File, ticket: UploadTicket, onProgress: (loaded: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open(ticket.method, ticket.url)
    for (const [name, value] of Object.entries(ticket.headers)) {
      request.setRequestHeader(name, value)
    }

    request.upload.onprogress = (event) => onProgress(event.loaded)
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(file.size)
        resolve()
      } else {
        reject(new Error(`Upload failed (${request.status}). Please try again.`))
      }
    }
    request.onerror = () => reject(new Error("Upload failed. Check your connection and try again."))
    request.onabort = () => reject(new Error("Upload was cancelled"))
    signal?.addEventListener("abort", () => request.abort(), { once: true })

    request.send(file)
  })
}

// Uploads one file and returns its upload_id. onProgress gets bytes sent.
export async function uploadVideoFile(
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<string> {
  const ticket = await requestUploadTicket(file)
  await putFile(file, ticket, (loaded) => onProgress(Math.min(loaded, file.size), file.size), signal)
  return ticket.upload_id
}
