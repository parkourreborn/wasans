import "server-only"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getRequestId, jsonError, type ApiErrorCode } from "@/lib/server/http"
import { signJwt, verifyJwt } from "./jwt"

export { getRequestId } from "@/lib/server/http"

const ACCESS_COOKIE = "wasans_v2_access"
const REFRESH_COOKIE = "wasans_v2_refresh"
const ACCESS_TOKEN_TTL_SECONDS = 60 * 15

export type V2Auth = { uuid: string; permission: number }

export type V2Context = {
  request: Request
  env: CloudflareEnv
  db: D1Database
  cache: KVNamespace
  requestId: string
  auth: V2Auth | null
}

// Thrown by route handlers to short-circuit withV2Context into a standard
// error envelope, instead of every route repeating try/catch + jsonError.
export class ApiError extends Error {
  status: number
  code: ApiErrorCode
  details?: Record<string, unknown>

  constructor(message: string, status: number, code: ApiErrorCode, details?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie")
  if (!cookie) {
    return null
  }

  const match = cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))

  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

export function getJwtSecret(env: CloudflareEnv) {
  const secret =
    (env as CloudflareEnv & { JWT_SECRET?: string }).JWT_SECRET ||
    process.env.JWT_SECRET

  if (!secret) {
    throw new Error("JWT_SECRET is not configured")
  }

  return secret
}

export async function issueAccessToken(playerUuid: string, permission: number, secret: string) {
  return signJwt({ sub: playerUuid, perm: permission }, secret, ACCESS_TOKEN_TTL_SECONDS)
}

export async function resolveV2Auth(request: Request, secret: string): Promise<V2Auth | null> {
  const token = getCookie(request, ACCESS_COOKIE)
  if (!token) {
    return null
  }

  const claims = await verifyJwt(token, secret)
  if (!claims) {
    return null
  }

  return { uuid: claims.sub, permission: claims.perm }
}

export function getRefreshCookieValue(request: Request) {
  return getCookie(request, REFRESH_COOKIE)
}

function cookieSuffix(request: Request) {
  const isSecure = new URL(request.url).protocol === "https:"
  return isSecure ? "; Secure" : ""
}

export function buildAccessCookie(request: Request, token: string) {
  return `${ACCESS_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ACCESS_TOKEN_TTL_SECONDS}${cookieSuffix(request)}`
}

export function buildRefreshCookie(request: Request, token: string, expiresAt: number) {
  const maxAge = Math.max(0, expiresAt - Math.floor(Date.now() / 1000))
  return `${REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=/v2/auth; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cookieSuffix(request)}`
}

export function expiredV2AuthCookies(request: Request) {
  const suffix = cookieSuffix(request)
  return [
    `${ACCESS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${suffix}`,
    `${REFRESH_COOKIE}=; Path=/v2/auth; HttpOnly; SameSite=Lax; Max-Age=0${suffix}`,
  ]
}

export function jsonOk(
  data: unknown,
  options?: { status?: number; meta?: Record<string, unknown>; headers?: HeadersInit; requestId?: string }
) {
  const body: Record<string, unknown> = { data }
  if (options?.meta) {
    body.meta = options.meta
  }

  const headers = new Headers({ "content-type": "application/json" })
  if (options?.headers) {
    new Headers(options.headers).forEach((value, key) => headers.set(key, value))
  }
  if (options?.requestId) {
    headers.set("x-request-id", options.requestId)
  }

  return new Response(JSON.stringify(body), { status: options?.status ?? 200, headers })
}

// Wraps a v2 route handler with the boilerplate every v1 route repeats by
// hand: request id, D1 binding presence check, JWT auth resolution, and
// converting thrown ApiErrors (or unexpected errors) into the standard
// error envelope. TParams covers dynamic segments (e.g. [trial], [uuid]).
export function withV2Context<TParams = Record<string, never>>(
  handler: (ctx: V2Context, params: TParams) => Promise<Response>
) {
  return async (request: Request, routeContext?: { params: Promise<TParams> }) => {
    const requestId = getRequestId(request)

    try {
      const { env } = await getCloudflareContext({ async: true })

      if (!env?.wasans) {
        return jsonError("DB binding not available", 500, { code: "internal_error", requestId })
      }

      if (!env?.CACHE) {
        return jsonError("Cache binding not available", 500, { code: "internal_error", requestId })
      }

      const secret = getJwtSecret(env)
      const auth = await resolveV2Auth(request, secret)
      const params = routeContext ? await routeContext.params : ({} as TParams)

      return await handler({ request, env, db: env.wasans, cache: env.CACHE, requestId, auth }, params)
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonError(error.message, error.status, { code: error.code, requestId, details: error.details })
      }

      console.error(error)
      return jsonError("Internal error", 500, { code: "internal_error", requestId })
    }
  }
}
