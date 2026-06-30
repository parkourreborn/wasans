declare global {
  interface Window {
    __WASANS_API_BASE_URL__?: string
  }
}

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "")
}

export function getApiBaseUrl() {
  const runtimeBase =
    typeof window !== "undefined" ? window.__WASANS_API_BASE_URL__ : undefined
  const configuredBase = runtimeBase ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? ""
  return trimTrailingSlashes(configuredBase.trim())
}

export function apiV1(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${getApiBaseUrl()}/v1${normalizedPath}`
}
