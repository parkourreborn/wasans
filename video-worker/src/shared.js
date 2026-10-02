export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

export function toBase64(text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

// Server-side multipart upload for a container (see container/lib.mjs's
// uploadMultipart). `key` always comes from the caller's job, never from the
// container's request.
export async function handleMultipart(request, bucket, key, operation, defaultMetadata = {}) {
  const url = new URL(request.url)
  const uploadId = url.searchParams.get("uploadId") || ""
  const expectedMethod = operation === "part" ? "PUT" : "POST"
  if (request.method !== expectedMethod) {
    return new Response("Method not allowed", { status: 405 })
  }

  switch (operation) {
    case "create": {
      const { contentType, contentDisposition } = await request.json().catch(() => ({}))
      const upload = await bucket.createMultipartUpload(key, {
        httpMetadata: {
          contentType: contentType || defaultMetadata.contentType,
          ...(contentDisposition ? { contentDisposition } : {}),
        },
        ...(defaultMetadata.customMetadata ? { customMetadata: defaultMetadata.customMetadata } : {}),
      })
      return json({ uploadId: upload.uploadId })
    }
    case "part": {
      const partNumber = Number(url.searchParams.get("partNumber"))
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
        return new Response("Invalid part number", { status: 400 })
      }
      const part = await bucket.resumeMultipartUpload(key, uploadId).uploadPart(partNumber, await request.arrayBuffer())
      return json(part)
    }
    case "complete": {
      const { parts } = await request.json()
      await bucket.resumeMultipartUpload(key, uploadId).complete(parts)
      return json({ ok: true })
    }
    case "abort": {
      await bucket.resumeMultipartUpload(key, uploadId).abort()
      return json({ ok: true })
    }
    default:
      return new Response("Not found", { status: 404 })
  }
}

// R2-to-R2 copy inside the Worker, streamed (R2 needs a known-length
// stream, which FixedLengthStream provides). Returns false if the source
// doesn't exist.
export async function copyObject(fromBucket, fromKey, toBucket, toKey, customMetadata) {
  const object = await fromBucket.get(fromKey)
  if (!object) {
    return false
  }

  const { readable, writable } = new FixedLengthStream(object.size)
  const piping = object.body.pipeTo(writable)
  await toBucket.put(toKey, readable, {
    httpMetadata: object.httpMetadata,
    ...(customMetadata ? { customMetadata } : {}),
  })
  await piping
  return true
}
