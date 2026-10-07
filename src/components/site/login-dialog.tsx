"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { apiV2 } from "@/lib/api"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type LoginDialogContextValue = {
  openLogin: (reason?: string) => void
}

const LoginDialogContext = createContext<LoginDialogContextValue | null>(null)

const providers = [
  { id: "discord", label: "Discord" },
  { id: "google", label: "Google" },
  { id: "roblox", label: "Roblox" },
] as const

// Login is a full-page navigation in the same tab, and `next` brings the
// player back to the page they were on.
function loginHref(provider: string, pathname: string | null) {
  const next = pathname && pathname.startsWith("/") ? pathname : "/"
  return `${apiV2(`/auth/${provider}/start`)}?next=${encodeURIComponent(next)}`
}

export function LoginDialogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string | null>(null)

  const openLogin = useCallback((nextReason?: string) => {
    setReason(nextReason ?? null)
    setOpen(true)
  }, [])

  const value = useMemo(() => ({ openLogin }), [openLogin])

  return (
    <LoginDialogContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-5 p-6 sm:max-w-md">
          <DialogHeader className="gap-1.5">
            <DialogTitle className="label-caps text-2xl tracking-[0.04em]">Log in</DialogTitle>
            <DialogDescription className="text-[15px] leading-relaxed text-muted-foreground">
              {reason ?? "Log in to submit runs and see where you stand on every leaderboard."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            {providers.map((provider) => (
              <a
                key={provider.id}
                href={loginHref(provider.id, pathname)}
                className="flex h-11 items-center justify-center rounded-lg border border-line-strong bg-surface font-display text-[16px] font-semibold uppercase tracking-[0.06em] transition-colors hover:border-[#5a5a5a] hover:bg-surface-2"
              >
                Continue with {provider.label}
              </a>
            ))}
          </div>

          <div className="rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Already have an account?</span> Log in the way you
            signed up. A different method creates a separate account; you can link the others in Settings
            once you&apos;re in.
          </div>

          <p className="text-xs leading-relaxed text-subtle-foreground">
            By logging in you agree to the{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        </DialogContent>
      </Dialog>
    </LoginDialogContext.Provider>
  )
}

export function useLoginDialog() {
  const context = useContext(LoginDialogContext)
  if (!context) {
    throw new Error("useLoginDialog must be used inside LoginDialogProvider")
  }
  return context
}
