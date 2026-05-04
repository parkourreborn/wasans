import { AppSidebar } from "@/components/custom/app-sidebar";
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
        <main className="min-h-svh min-w-0 flex-1 p-4 md:p-8">
            {children}
        </main>
    </SidebarProvider>
  );
}
