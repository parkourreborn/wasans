"use client"

import { useEffect, useSyncExternalStore } from "react"
import {
  getAuthSession,
  installAuthSessionListeners,
  loadAuthSession,
  subscribeToAuthSession,
  type AuthSession,
} from "@/lib/auth-session"

// Rendered on the server before any check has run.
const serverSnapshot: AuthSession = { status: "loading", user: null }

function getServerSnapshot() {
  return serverSnapshot
}

// Subscribes a component to the shared auth session. Every consumer sees the
// same answer, and a sign-in in another tab reaches all of them.
//
// useSyncExternalStore rather than useState + an effect: the store lives
// outside React and can change between render and subscribe, which is the
// tearing case this hook exists to avoid — and it means no setState in an
// effect body.
export function useAuthSession(): AuthSession {
  const session = useSyncExternalStore(subscribeToAuthSession, getAuthSession, getServerSnapshot)

  useEffect(() => {
    installAuthSessionListeners()
    void loadAuthSession()
  }, [])

  return session
}
