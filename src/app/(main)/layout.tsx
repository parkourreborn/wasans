"use client"

import { usePathname, useRouter } from "next/navigation"
import { AppSidebar } from "@/components/custom/app-sidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"

const pageTitles: Record<string, string> = {
  "/": "Home",
  "/calculator": "Calculator",
  "/compare": "Compare",
  "/information": "Information",
  "/logs": "Logs",
  "/players": "Players",
  "/rules": "Rules",
  "/submissions": "Submissions",
  "/wrs": "World Records",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter()
  const pathname = usePathname()
  const currentTitle = pageTitles[pathname] || "Wasans"

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="min-h-svh min-w-0 flex-1 bg-transparent">
        <div className="sticky top-0 z-40 border-b border-border/70 bg-background/95 md:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger className="p-2" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{currentTitle}</p>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => router.back()}>
              Back
            </Button>
          </div>
        </div>
        {children}
      </main>
    </SidebarProvider>
  )
}
