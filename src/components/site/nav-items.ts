// Where everything lives. The top bar shows `primaryNav` plus a More menu
// holding `moreNav`; on phones the tab bar shows the primary items with
// Submit in the middle, and More opens a sheet with the rest.

export type NavItem = {
  href: string
  label: string
  description?: string
  // Other paths that count as being "in" this section.
  matches?: string[]
}

export const SUBMIT_HREF = "/submit"

export const primaryNav: NavItem[] = [
  // "/" shows the leaderboard until the homepage is designed.
  { href: "/leaderboard", label: "Leaderboard", matches: ["/"] },
  { href: "/trials", label: "Trials" },
  { href: "/combos", label: "Combos" },
  { href: "/submissions/trials", label: "Submissions", matches: ["/submissions"] },
]

export const moreNav: NavItem[] = [
  { href: "/calculator", label: "Calculator", description: "What-if times, and players side by side", matches: ["/compare"] },
  { href: "/prizes", label: "Prizes", description: "Active prizes and giveaways" },
  { href: "/rules", label: "Rules", description: "What makes a run valid" },
  { href: "/information", label: "Scoring & FAQ", description: "How scores and tiers work" },
]

export const DISCORD_INVITE_URL = "https://discord.gg/9pnRYDU6wg"

export function isNavItemActive(item: NavItem, pathname: string) {
  if (pathname === SUBMIT_HREF || pathname.startsWith(`${SUBMIT_HREF}/`)) {
    return false
  }
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
    return true
  }
  return (item.matches ?? []).some((match) =>
    match === "/" ? pathname === "/" : pathname === match || pathname.startsWith(`${match}/`)
  )
}
