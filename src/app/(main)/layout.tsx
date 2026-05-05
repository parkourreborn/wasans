"use client"

import { useRouter } from "next/navigation"
import { AppSidebar } from "@/components/custom/app-sidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter()

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="min-h-svh min-w-0 flex-1 p-4 md:p-8">
        <div className="sticky top-0 z-40 mb-4 flex items-center justify-between gap-2 rounded-2xl border border-border bg-background/90 px-4 py-3 backdrop-blur-sm shadow-sm md:hidden">
          <SidebarTrigger className="p-2" />
          <Button type="button" variant="outline" size="sm" onClick={() => router.back()}>
            Back
          </Button>
        </div>
        {children}
      </main>
    </SidebarProvider>
  )
}
