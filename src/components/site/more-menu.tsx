"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { isNavItemActive, moreNav } from "@/components/site/nav-items"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function MoreMenu({ newPrizes }: { newPrizes: boolean }) {
  const pathname = usePathname()
  const active = moreNav.some((item) => isNavItemActive(item, pathname))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "label-caps flex cursor-pointer items-center gap-1 px-2.5 text-[16px] outline-none lg:px-3 transition-colors hover:text-foreground focus-visible:text-foreground data-[state=open]:text-foreground",
          active ? "text-foreground shadow-[inset_0_-3px_0_var(--primary)]" : "text-muted-foreground"
        )}
        aria-label={newPrizes ? "More, new prize" : "More"}
      >
        More
        <ChevronDownIcon className="size-3.5" aria-hidden />
        {newPrizes ? <span className="size-1.5 rounded-full bg-primary" aria-hidden /> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-72 rounded-lg border border-line-strong bg-surface-2 p-1.5 ring-0">
        {moreNav.map((item) => (
          <DropdownMenuItem key={item.href} asChild className="cursor-pointer rounded-md px-3 py-2.5">
            <Link href={item.href} className="flex flex-col items-start gap-0.5">
              <span className="flex items-center gap-2 text-[15px] font-medium text-foreground">
                {item.label}
                {item.href === "/prizes" && newPrizes ? (
                  <span className="label-caps text-[12px] text-primary">New</span>
                ) : null}
              </span>
              {item.description ? <span className="text-[13px] text-muted-foreground">{item.description}</span> : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
