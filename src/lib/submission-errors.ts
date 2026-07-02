export function getSubmissionErrorMessage(
  error: string | { message?: string } | null | undefined,
  fallback: string
) {
  if (typeof error === "string") {
    return error
  }

  if (error && typeof error === "object" && typeof error.message === "string") {
    return error.message
  }

  return fallback
}

export function getSubmissionErrorStatus(message: string | null | undefined) {
  if (!message) {
    return 400
  }

  if (message.includes("Authentication")) {
    return 401
  }

  if (message.includes("permission") || message.includes("Moderator")) {
    return 403
  }

  if (message.includes("not found") || message.includes("missing")) {
    return 404
  }

  if (message.includes("idempotency")) {
    return 409
  }

  if (message.includes("too large") || message.includes("invalid") || message.includes("payload")) {
    return 413
  }

  if (message.includes("Rate limit")) {
    return 429
  }

  if (message.includes("DB binding") || message.includes("internal")) {
    return 500
  }

  return 400
}
