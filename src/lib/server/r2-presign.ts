import "server-only"
import { AwsV4Signer } from "aws4fetch"

// Presigned URLs for the private wasans-uploads bucket, signed with an R2
// API token scoped to that bucket only (R2_UPLOAD_ACCESS_KEY_ID /
// R2_UPLOAD_SECRET_ACCESS_KEY). Presigning is pure computation: nothing is
// sent to R2 until the browser uses the URL.

type PresignEnv = Pick<
  CloudflareEnv,
  "R2_ACCOUNT_ID" | "R2_UPLOADS_BUCKET" | "R2_UPLOAD_ACCESS_KEY_ID" | "R2_UPLOAD_SECRET_ACCESS_KEY"
>

function presignConfig(env: PresignEnv) {
  const accountId = String(env.R2_ACCOUNT_ID || "")
  const bucket = String(env.R2_UPLOADS_BUCKET || "")
  const accessKeyId = String(env.R2_UPLOAD_ACCESS_KEY_ID || "")
  const secretAccessKey = String(env.R2_UPLOAD_SECRET_ACCESS_KEY || "")
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Direct video upload isn't configured")
  }
  return { accountId, bucket, accessKeyId, secretAccessKey }
}

function objectUrl(accountId: string, bucket: string, key: string) {
  const path = key.split("/").map(encodeURIComponent).join("/")
  return new URL(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${path}`)
}

// PUT URL for exactly one object, valid for `ttlSeconds`. Content-Type and
// Content-Length are part of the signature, so the browser has to send this
// file type and this many bytes; anything else is rejected by R2 with
// SignatureDoesNotMatch.
export async function presignUploadPut(
  env: PresignEnv,
  options: { key: string; contentType: string; sizeBytes: number; ttlSeconds: number }
) {
  const { accountId, bucket, accessKeyId, secretAccessKey } = presignConfig(env)
  const url = objectUrl(accountId, bucket, options.key)
  url.searchParams.set("X-Amz-Expires", String(options.ttlSeconds))

  const signer = new AwsV4Signer({
    method: "PUT",
    url: url.toString(),
    headers: {
      "content-type": options.contentType,
      "content-length": String(options.sizeBytes),
    },
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
    signQuery: true,
    allHeaders: true,
  })
  const signed = await signer.sign()

  return {
    url: signed.url.toString(),
    // Content-Length is set by the browser from the file itself.
    headers: { "content-type": options.contentType },
  }
}

// Short-lived download link for a private original (moderators only, see
// /v2/submissions/[uuid]/original).
export async function presignOriginalGet(env: PresignEnv, options: { key: string; filename: string; ttlSeconds: number }) {
  const { accountId, bucket, accessKeyId, secretAccessKey } = presignConfig(env)
  const url = objectUrl(accountId, bucket, options.key)
  url.searchParams.set("X-Amz-Expires", String(options.ttlSeconds))
  url.searchParams.set(
    "response-content-disposition",
    `attachment; filename="${options.filename.replace(/[^A-Za-z0-9._ -]/g, "_")}"`
  )

  const signer = new AwsV4Signer({
    method: "GET",
    url: url.toString(),
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
    signQuery: true,
  })
  return (await signer.sign()).url.toString()
}
