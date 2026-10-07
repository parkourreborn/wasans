// Score tiers. They are also the community Discord's score roles, so this is
// the one place the thresholds live: the server maps each tier to its
// Discord role (lib/server/notifications.ts) and the site labels players
// with the same table. A player is in the highest tier whose `min` they have
// reached (score >= min), matching how the bot hands out roles.

export type TierKey =
  | "unranked"
  | "platinum"
  | "diamond"
  | "master3"
  | "master2"
  | "master1"
  | "elite"
  | "router"

export type Tier = {
  key: TierKey
  /** Display name, e.g. "Master III". */
  name: string
  /** Short form for tight spaces, e.g. the tier ladder on a phone. */
  short: string
  /** The Discord role's name, as the bot writes it in messages. */
  roleName: string
  /** Lowest score in the tier, inclusive. */
  min: number
  /** CSS color for the tier's label. */
  color: string
}

// Lowest first.
export const TIERS: readonly Tier[] = [
  { key: "unranked", name: "Unranked", short: "Unr", roleName: "unranked", min: 0, color: "var(--tier-unranked)" },
  { key: "platinum", name: "Platinum", short: "Plat", roleName: "platinum", min: 0.3, color: "var(--tier-platinum)" },
  { key: "diamond", name: "Diamond", short: "Dia", roleName: "diamond", min: 0.4, color: "var(--tier-diamond)" },
  { key: "master3", name: "Master III", short: "M III", roleName: "master III", min: 0.5, color: "var(--tier-master)" },
  { key: "master2", name: "Master II", short: "M II", roleName: "master II", min: 0.6, color: "var(--tier-master)" },
  { key: "master1", name: "Master I", short: "M I", roleName: "master I", min: 0.7, color: "var(--tier-master)" },
  { key: "elite", name: "Elite", short: "Elite", roleName: "elite", min: 0.8, color: "var(--tier-elite)" },
  { key: "router", name: "Router", short: "Router", roleName: "router", min: 0.9, color: "var(--tier-router)" },
]

export function tierForScore(score: number): Tier {
  let match = TIERS[0]

  for (const tier of TIERS) {
    if (score >= tier.min) {
      match = tier
    } else {
      break
    }
  }

  return match
}

// The tier above the one `score` is in, and how much score it takes to get
// there. Null at the top tier.
export function nextTier(score: number): { tier: Tier; needed: number } | null {
  const next = TIERS.find((tier) => tier.min > score)
  return next ? { tier: next, needed: Number((next.min - score).toFixed(3)) } : null
}
