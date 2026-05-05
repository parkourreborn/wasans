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
        <SidebarTrigger className="top-2 p-2 fixed backdrop-blur bg-white/30" />
        {children}
      </main>
    </SidebarProvider>
  )
}
