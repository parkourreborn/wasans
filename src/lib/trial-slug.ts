import { trials, type TrialName } from "@/lib/trials"

// URL-friendly trial names: "Neon Bold" <-> "neon-bold".
export function trialSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function trialFromSlug(slug: string): TrialName | null {
  const normalized = slug.toLowerCase()
  return trials.find((trial) => trialSlug(trial) === normalized) ?? null
}

export function trialHref(name: string) {
  return `/trials/${trialSlug(name)}`
}
