import "server-only"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getRequestId, jsonError, type ApiErrorCode } from "@/lib/server/http"
import { canModerate, isOwner, loadAuthUserByUuid, type AuthUser } from "@/lib/server/auth"
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
  ctx: ExecutionContext
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

// Loads the full AuthUser for the current JWT and throws a standard 401/403
// ApiError if they're missing or don't have the required permission tier —
// used by every moderator/owner-gated v2 route instead of repeating the
// load-and-check boilerplate.
export async function requireV2User(ctx: V2Context): Promise<AuthUser> {
  if (!ctx.auth) {
    throw new ApiError("Authentication required", 401, "unauthorized")
  }

  const user = await loadAuthUserByUuid(ctx.db, ctx.auth.uuid, ctx.request)
  if (!user) {
    throw new ApiError("Authentication required", 401, "unauthorized")
  }

  return user
}

export async function requireV2Moderator(ctx: V2Context): Promise<AuthUser> {
  const user = await requireV2User(ctx)
  if (!canModerate(user)) {
    throw new ApiError("Moderator permission is required", 403, "forbidden")
  }

  return user
}

export async function requireV2Owner(ctx: V2Context): Promise<AuthUser> {
  const user = await requireV2User(ctx)
  if (!isOwner(user)) {
    throw new ApiError("Owner permission is required", 403, "forbidden")
  }

  return user
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

async function resolveV2Context(request: Request): Promise<
  { ok: true; ctx: V2Context } | { ok: false; response: Response }
> {
  const requestId = getRequestId(request)
  const { env, ctx } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return { ok: false, response: jsonError("DB binding not available", 500, { code: "internal_error", requestId }) }
  }

  if (!env?.CACHE) {
    return { ok: false, response: jsonError("Cache binding not available", 500, { code: "internal_error", requestId }) }
  }

  const secret = getJwtSecret(env)
  const auth = await resolveV2Auth(request, secret)

  return {
    ok: true,
    ctx: { request, env, db: env.wasans, cache: env.CACHE, ctx, requestId, auth },
  }
}

function toErrorResponse(error: unknown, requestId: string) {
  if (error instanceof ApiError) {
    return jsonError(error.message, error.status, { code: error.code, requestId, details: error.details })
  }

  console.error(error)
  return jsonError("Internal error", 500, { code: "internal_error", requestId })
}

// Wraps a v2 route handler with the boilerplate every v1 route repeats by
// hand: request id, D1 binding presence check, JWT auth resolution, and
// converting thrown ApiErrors (or unexpected errors) into the standard
// error envelope. For routes with no dynamic segments — the handler's
// exported function must take exactly (request), matching what Next's
// route-type validator expects for a static route path.
export function withV2Context(handler: (ctx: V2Context) => Promise<Response>) {
  return async (request: Request) => {
    const requestId = getRequestId(request)

    try {
      const resolved = await resolveV2Context(request)
      if (!resolved.ok) {
        return resolved.response
      }

      return await handler(resolved.ctx)
    } catch (error) {
      return toErrorResponse(error, requestId)
    }
  }
}

// Same as withV2Context, but for routes with dynamic segments (e.g.
// [trial], [uuid]) — Next's route-type validator requires the exported
// function's second parameter to be a required (non-optional) RouteContext,
// so this is a separate wrapper rather than an optional-params overload.
export function withV2Params<TParams>(
  handler: (ctx: V2Context, params: TParams) => Promise<Response>
) {
  return async (request: Request, routeContext: { params: Promise<TParams> }) => {
    const requestId = getRequestId(request)

    try {
      const resolved = await resolveV2Context(request)
      if (!resolved.ok) {
        return resolved.response
      }

      const params = await routeContext.params
      return await handler(resolved.ctx, params)
    } catch (error) {
      return toErrorResponse(error, requestId)
    }
  }
}
