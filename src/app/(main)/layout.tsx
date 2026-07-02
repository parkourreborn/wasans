"use client"

import { usePathname, useRouter } from "next/navigation"
import { AppSidebar } from "@/components/custom/app-sidebar"
import { SettingsProvider } from "@/components/custom/settings-provider"
import { Button } from "@/components/ui/button"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { getRouteTheme } from "@/lib/route-theme"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const router = useRouter()
  const pathname = usePathname()
  const theme = getRouteTheme(pathname)

  return (
    <SidebarProvider>
      <SettingsProvider>
        <AppSidebar />
        <main
          className="relative min-h-svh min-w-0 flex-1 overflow-x-hidden bg-background"
          style={{
            ["--page-accent" as string]: theme.accent,
            ["--page-accent-soft" as string]: theme.accentSoft,
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-72"
            style={{ background: theme.gradient }}
          />
          <div className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur md:hidden">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
              <SidebarTrigger className="p-2" />
              <Button type="button" variant="outline" size="sm" onClick={() => router.back()}>
                Back
              </Button>
            </div>
          </div>
          <div className="relative z-10">{children}</div>
        </main>
      </SettingsProvider>
    </SidebarProvider>
  )
}
