// A single shared answer to "who is signed in", for every component that
// needs it.
//
// The bug this exists to kill: components each fetched /v2/auth/me once, in
// a mount effect, into their own `useState<AuthUser | null>(null)`. That has
// two failure modes, and the sidebar hit both. It lives in the layout, so it
// never remounts — one client-side navigation, or one failed check, and it
// showed "Login with Discord" for the rest of the visit even though the
// session was fine. And because "not checked yet", "check failed" and
// "definitely signed out" were all just `null`, there was no way to tell
// them apart or to retry.
//
// So: one store, a tri-state status, revalidation when the tab comes back,
// and a cross-tab notification so signing in one tab updates the others.

export type AuthSessionUser = {
  uuid: string
  player_id: string
  player_name: string
  score: number
  permission: number
  discord_avatar?: string | null
  discord_discriminator?: string | null
}

export type AuthStatus =
  // Nothing has come back yet. Render as neither signed in nor signed out.
  | "loading"
  // The server said, with a live session, who this is.
  | "authenticated"
  // The server said there is no session — no refresh cookie at all.
  | "anonymous"
  // We asked and could not find out: offline, a 5xx, a rate limit. Crucially
  // NOT the same as signed out, because rendering a login button here is
  // what made a network blip look like being logged out.
  | "unknown"

export type AuthSession = {
  status: AuthStatus
  user: AuthSessionUser | null
}

const AUTH_ME_PATH = "/v2/auth/me"

// Broadcast on this channel when the session changes so other tabs pick it
// up. localStorage is the fallback for browsers without BroadcastChannel:
// writing a key fires `storage` in every *other* tab, which is exactly the
// signal wanted.
const CHANNEL_NAME = "wasans-auth"
const STORAGE_PING_KEY = "wasans:auth-changed"

// How stale a session may be before the tab becoming visible re-checks it.
// Short enough that coming back to a tab shows the truth, long enough that
// flicking between two tabs doesn't fetch on every switch.
const REVALIDATE_AFTER_MS = 30 * 1000

let session: AuthSession = { status: "loading", user: null }
let checkedAt = 0
let inFlight: Promise<AuthSession> | null = null
let listenersAttached = false

const subscribers = new Set<(next: AuthSession) => void>()

function emit() {
  for (const subscriber of subscribers) {
    subscriber(session)
  }
}

function setSession(next: AuthSession) {
  const changed = next.status !== session.status || next.user?.uuid !== session.user?.uuid
  session = next
  checkedAt = Date.now()

  if (changed) {
    emit()
  }
}

export function getAuthSession() {
  return session
}

export function subscribeToAuthSession(listener: (next: AuthSession) => void) {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

// Tells other tabs (and this one's other subscribers) that the signed-in
// identity changed, so they re-check instead of sitting on a stale answer.
export function announceAuthChange() {
  if (typeof window === "undefined") {
    return
  }

  try {
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(CHANNEL_NAME)
      channel.postMessage("changed")
      channel.close()
      return
    }
  } catch {
    // Fall through to the storage ping.
  }

  try {
    window.localStorage.setItem(STORAGE_PING_KEY, String(Date.now()))
  } catch {
    // Private mode with storage blocked; nothing else to try.
  }
}

async function requestSession(): Promise<AuthSession> {
  // Goes through the patched window.fetch on purpose: a 401 here is what
  // triggers the access-token refresh and the retry behind it, so by the
  // time this resolves the refresh has already had its turn.
  const response = await fetch(AUTH_ME_PATH, { cache: "no-store" })

  if (response.ok) {
    const json = (await response.json().catch(() => null)) as
      | { data?: { user?: AuthSessionUser | null } }
      | null
    const user = json?.data?.user ?? null

    // A 200 with a null user is the server saying there is no refresh cookie
    // at all: genuinely signed out, and the one case where offering a login
    // button is right.
    return user ? { status: "authenticated", user } : { status: "anonymous", user: null }
  }

  // A 401 that survived the refresh and retry means the session really is
  // over. Anything else (429, 5xx, a proxy error) tells us nothing about it.
  if (response.status === 401) {
    return { status: "anonymous", user: null }
  }

  return { status: "unknown", user: null }
}

export function loadAuthSession(options?: { force?: boolean }): Promise<AuthSession> {
  if (typeof window === "undefined") {
    return Promise.resolve(session)
  }

  if (inFlight) {
    return inFlight
  }

  if (!options?.force && session.status === "authenticated" && Date.now() - checkedAt < REVALIDATE_AFTER_MS) {
    return Promise.resolve(session)
  }

  inFlight = requestSession()
    .catch((): AuthSession => ({ status: "unknown", user: null }))
    .then((next) => {
      // Never let a failed check overwrite a known-good identity — that
      // downgrade is what made a momentary network problem look like a
      // logout. Keep who we know and try again next time.
      if (next.status === "unknown" && session.status === "authenticated") {
        checkedAt = Date.now()
        return session
      }

      setSession(next)
      return next
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

// Applies a locally-known identity (e.g. the settings dialog renaming the
// player) without a round trip.
export function setAuthSessionUser(user: AuthSessionUser | null) {
  setSession(user ? { status: "authenticated", user } : { status: "anonymous", user: null })
  announceAuthChange()
}

function revalidateIfStale() {
  if (document.visibilityState !== "visible") {
    return
  }

  if (Date.now() - checkedAt < REVALIDATE_AFTER_MS) {
    return
  }

  void loadAuthSession({ force: true })
}

// Installed once, from the root layout. A tab that has been sitting open —
// or that was in the background while the user signed in somewhere else —
// finds out on the way back in rather than staying wrong until a reload.
export function installAuthSessionListeners() {
  if (listenersAttached || typeof window === "undefined") {
    return
  }

  listenersAttached = true

  document.addEventListener("visibilitychange", revalidateIfStale)
  window.addEventListener("pageshow", revalidateIfStale)
  window.addEventListener("focus", revalidateIfStale)

  const onExternalChange = () => {
    void loadAuthSession({ force: true })
  }

  try {
    if ("BroadcastChannel" in window) {
      new BroadcastChannel(CHANNEL_NAME).addEventListener("message", onExternalChange)
    }
  } catch {
    // No BroadcastChannel; the storage listener below covers it.
  }

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_PING_KEY) {
      onExternalChange()
    }
  })
}
