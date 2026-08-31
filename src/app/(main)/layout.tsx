"use client"

import { useRouter } from "next/navigation"
import { AppSidebar } from "@/components/custom/app-sidebar"
import { SettingsProvider } from "@/components/custom/settings-provider"
import { Button } from "@/components/ui/button"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const router = useRouter()

  return (
    <SidebarProvider>
      <SettingsProvider>
        <AppSidebar />
        {/* overflow-x-clip rather than -hidden: hidden would make this a scroll
            container (overflow-y computes to auto) and the sticky page headers
            inside it would scroll away instead of pinning. */}
        <main className="relative min-h-svh min-w-0 flex-1 overflow-x-clip bg-background">
          <div className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur-sm md:hidden">
            {/* Exactly h-14, matching the top-14 offset every sticky page
                header and search bar uses to clear this bar. */}
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
              <SidebarTrigger className="p-2" />
              <Button type="button" variant="outline" size="sm" onClick={() => router.back()}>
                Back
              </Button>
            </div>
          </div>
          <div className="relative z-10">{children}</div>
        </main>
        <Toaster />
      </SettingsProvider>
    </SidebarProvider>
  )
}
