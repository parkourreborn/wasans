import Link from "next/link"
import { DISCORD_INVITE_URL } from "@/components/site/nav-items"

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5">
        <Link href="/terms" className="label-caps text-[14px] text-subtle-foreground hover:text-foreground">
          Terms
        </Link>
        <Link href="/privacy" className="label-caps text-[14px] text-subtle-foreground hover:text-foreground">
          Privacy
        </Link>
        <a href={DISCORD_INVITE_URL} rel="noreferrer" target="_blank" className="label-caps text-[14px] text-subtle-foreground hover:text-foreground">
          Discord
        </a>
      </div>
    </footer>
  )
}
