import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { BookIcon, CalculatorIcon, HelpCircleIcon, HomeIcon, TimerIcon, TrophyIcon } from "lucide-react"
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
                            <Link href="/">
                                <div className="flex items-center gap-2">
                                    <HomeIcon />
                                    <span>Home</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/rules">
                                <div className="flex items-center gap-2">
                                    <BookIcon />
                                    <span>Rules</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/information">
                                <div className="flex items-center gap-2">
                                    <HelpCircleIcon />
                                    <span>Information</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/wrs">
                                <div className="flex items-center gap-2">
                                    <TrophyIcon />
                                    <span>WRs</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/scores">
                                <div className="flex items-center gap-2">
                                    <TimerIcon />
                                    <span>Scores</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/calculator">
                                <div className="flex items-center gap-2">
                                    <CalculatorIcon />
                                    <span>Calculator</span>
                                </div>
                            </Link>
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