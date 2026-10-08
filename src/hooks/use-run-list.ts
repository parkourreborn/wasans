"use client"

import { useSyncExternalStore } from "react"
import { RUN_LIST_KEY } from "@/lib/moderation"

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener)
  return () => window.removeEventListener("storage", listener)
}

function getSnapshot() {
  try {
    return window.localStorage.getItem(RUN_LIST_KEY) ?? "[]"
  } catch {
    return "[]"
  }
}

// The previous and next runs in whichever list the viewer opened this run
// from (see rememberRunList), or nulls when it wasn't opened from one.
export function useRunNeighbours(uuid: string) {
  const json = useSyncExternalStore(subscribe, getSnapshot, () => "[]")
  let list: string[] = []
  try {
    const parsed = JSON.parse(json)
    list = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    list = []
  }
  const index = list.indexOf(uuid)
  return {
    previous: index > 0 ? list[index - 1] : null,
    next: index >= 0 && index < list.length - 1 ? list[index + 1] : null,
  }
}
