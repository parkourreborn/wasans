import { PERMISSION_COMBO_MODERATOR, PERMISSION_MODERATOR, PERMISSION_OWNER } from "@/components/site/admin/admin-kit"

// The admin panel's pages and who sees each. These mirror what the API
// admits: combo moderators manage combo categories, moderators read the
// logs, owners get the rest.
export const ADMIN_PAGES = [
  { href: "/admin", label: "Overview", min: PERMISSION_OWNER },
  { href: "/admin/players", label: "Players", min: PERMISSION_OWNER },
  { href: "/admin/trials", label: "Trials", min: PERMISSION_OWNER },
  { href: "/admin/combos", label: "Combos", min: PERMISSION_COMBO_MODERATOR },
  { href: "/admin/content", label: "Content", min: PERMISSION_OWNER },
  { href: "/admin/site", label: "Site", min: PERMISSION_OWNER },
  { href: "/admin/logs", label: "Logs", min: PERMISSION_MODERATOR },
] as const

export type AdminPageHref = (typeof ADMIN_PAGES)[number]["href"]

export function adminPagesFor(permission: number) {
  return ADMIN_PAGES.filter((page) => permission >= page.min)
}

export function adminPageFor(pathname: string) {
  return [...ADMIN_PAGES].sort((a, b) => b.href.length - a.href.length).find((page) => pathname === page.href || pathname.startsWith(`${page.href}/`)) ?? null
}
