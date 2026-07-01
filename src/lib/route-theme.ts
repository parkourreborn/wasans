type RouteTheme = {
  label: string
  accent: string
  accentSoft: string
  gradient: string
}

const routeThemes: Array<{ href: string; theme: RouteTheme }> = [
  {
    href: "/",
    theme: {
      label: "Overview",
      accent: "#f59e0b",
      accentSoft: "#fb7185",
      gradient:
        "linear-gradient(180deg, color-mix(in oklab, #f59e0b 30%, transparent) 0%, color-mix(in oklab, #fb7185 24%, transparent) 38%, transparent 78%)",
    },
  },
  {
    href: "/rules",
    theme: {
      label: "Rules",
      accent: "#fb923c",
      accentSoft: "#f43f5e",
      gradient:
        "linear-gradient(180deg, color-mix(in oklab, #fb923c 28%, transparent) 0%, color-mix(in oklab, #f43f5e 22%, transparent) 42%, transparent 80%)",
    },
  },
  {
    href: "/information",
    theme: {
      label: "Information",
      accent: "#38bdf8",
      accentSoft: "#14b8a6",
      gradient:
        "linear-gradient(180deg, color-mix(in oklab, #38bdf8 28%, transparent) 0%, color-mix(in oklab, #14b8a6 22%, transparent) 42%, transparent 80%)",
    },
  },
  {
    href: "/calculator",
    theme: {
      label: "Calculator",
      accent: "#84cc16",
      accentSoft: "#10b981",
      gradient:
        "linear-gradient(180deg, color-mix(in oklab, #84cc16 28%, transparent) 0%, color-mix(in oklab, #10b981 22%, transparent) 42%, transparent 80%)",
    },
  },
  {
    href: "/compare",
    theme: {
      label: "Compare",
      accent: "#14b8a6",
      accentSoft: "#06b6d4",
      gradient:
        "linear-gradient(180deg, color-mix(in oklab, #14b8a6 28%, transparent) 0%, color-mix(in oklab, #06b6d4 22%, transparent) 42%, transparent 80%)",
    },
  },
  {
    href: "/wrs",
    theme: {
      label: "World Records",
      accent: "#f97316",
      accentSoft: "#ef4444",
      gradient:
        "linear-gradient(180deg, color-mix(in oklab, #f97316 28%, transparent) 0%, color-mix(in oklab, #ef4444 22%, transparent) 42%, transparent 80%)",
    },
  },
  {
    href: "/submissions",
    theme: {
      label: "Submissions",
      accent: "#f472b6",
      accentSoft: "#fb7185",
      gradient:
        "linear-gradient(180deg, color-mix(in oklab, #f472b6 28%, transparent) 0%, color-mix(in oklab, #fb7185 22%, transparent) 42%, transparent 80%)",
    },
  },
  {
    href: "/players",
    theme: {
      label: "Players",
      accent: "#3b82f6",
      accentSoft: "#eab308",
      gradient:
        "linear-gradient(180deg, color-mix(in oklab, #3b82f6 28%, transparent) 0%, color-mix(in oklab, #eab308 22%, transparent) 42%, transparent 80%)",
    },
  },
  {
    href: "/logs",
    theme: {
      label: "Logs",
      accent: "#f43f5e",
      accentSoft: "#f59e0b",
      gradient:
        "linear-gradient(180deg, color-mix(in oklab, #f43f5e 28%, transparent) 0%, color-mix(in oklab, #f59e0b 22%, transparent) 42%, transparent 80%)",
    },
  },
]

const defaultTheme = routeThemes[0].theme

export function getRouteTheme(pathname: string): RouteTheme {
  const exactMatch = routeThemes.find((item) => item.href === pathname)
  if (exactMatch) {
    return exactMatch.theme
  }

  const nestedMatch = routeThemes.find((item) => item.href !== "/" && pathname.startsWith(`${item.href}/`))

  return nestedMatch?.theme ?? defaultTheme
}

export function isRouteActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/"
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}
