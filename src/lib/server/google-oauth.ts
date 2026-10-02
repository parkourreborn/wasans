import "server-only"

type GoogleOAuthEnv = {
  googleClientId?: string
  googleClientSecret?: string
}

export function getGoogleClientId(env: GoogleOAuthEnv) {
  if (!env.googleClientId) {
    throw new Error("googleClientId binding is not configured")
  }

  return env.googleClientId
}

export function getGoogleClientSecret(env: GoogleOAuthEnv) {
  if (!env.googleClientSecret) {
    throw new Error("googleClientSecret binding is not configured")
  }

  return env.googleClientSecret
}
