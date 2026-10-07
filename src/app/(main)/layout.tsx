import { AnnouncementBanner } from "@/components/custom/announcement-banner"
import { AuthResultToast } from "@/components/custom/auth-result-toast"
import { SettingsDialog, SettingsProvider } from "@/components/custom/settings-provider"
import { LoginDialogProvider } from "@/components/site/login-dialog"
import { MobileTabBar } from "@/components/site/mobile-tab-bar"
import { NavBadgesProvider } from "@/components/site/nav-badges"
import { SiteFooter } from "@/components/site/site-footer"
import { TopBar } from "@/components/site/top-bar"
import { Toaster } from "@/components/ui/sonner"

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <SettingsProvider>
      <LoginDialogProvider>
        <NavBadgesProvider>
          <div className="flex min-h-svh flex-col">
            <a
              href="#main"
              className="sr-only z-50 rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
            >
              Skip to content
            </a>
            <TopBar />
            <AnnouncementBanner />
            {/* overflow-x-clip rather than -hidden: hidden would make this a
                scroll container and sticky elements inside it would stop
                pinning. */}
            <main id="main" className="relative min-w-0 flex-1 overflow-x-clip">
              {children}
            </main>
            {/* The footer is last on every page, so its padding is what keeps
                content clear of the fixed phone tab bar. */}
            <div className="pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
              <SiteFooter />
            </div>
            <MobileTabBar />
          </div>
          <SettingsDialog />
          <Toaster />
          {/* After the Toaster, so its effect runs once the Toaster is listening. */}
          <AuthResultToast />
        </NavBadgesProvider>
      </LoginDialogProvider>
    </SettingsProvider>
  )
}
