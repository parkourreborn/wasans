declare global {
  interface Window {
    __WASANS_API_BASE_URL__?: string
  }
}

export function getApiBaseUrl() {
  return "" // "https://wasans.tully.sh"
}

export function apiV2(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${getApiBaseUrl()}/v2${normalizedPath}`
}
