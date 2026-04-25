import { AppSidebar } from "@/components/ui/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SidebarProvider>
        <AppSidebar />
        <SidebarTrigger className="hover:cursor-pointer" />
        <main className="h-screen w-full p-8">
            {children}
        </main>
    </SidebarProvider>
  );
}
