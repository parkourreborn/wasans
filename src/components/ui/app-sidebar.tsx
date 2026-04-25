import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { BookIcon, HomeIcon, Plus } from "lucide-react"
import Link from "next/link"

export function AppSidebar() {
  return (
    <Sidebar>
        <SidebarHeader >
            <h2 className="text-2xl font-semibold italic">hi i wasans</h2>
        </ SidebarHeader>
        <SidebarContent>
            <SidebarGroup>

                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/"><HomeIcon /> Home</Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/rules"><BookIcon /> Rules</Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                </SidebarMenu>

            </SidebarGroup>

            <SidebarGroup>
                group 2
            </SidebarGroup>

        </SidebarContent>
        <SidebarFooter>
            footer
        </SidebarFooter>
    </Sidebar>
  )
}