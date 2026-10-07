"use client"

import { useState } from "react"

// The time the component mounted, in unix seconds. Ages like "standing for
// 41 days" are worked out against it, read once rather than on every render
// so a render stays pure.
export function useNow() {
  const [now] = useState(() => Date.now() / 1000)
  return now
}
