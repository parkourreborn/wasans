"use client"

import { useEffect, useMemo, useState, createContext, useContext } from "react"
import { Settings2Icon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { Switch } from "@/components/ui/switch"

type SettingsContextValue = {
  disableSubmissionThumbnails: boolean
  setDisableSubmissionThumbnails: (value: boolean) => void
}

const STORAGE_KEY = "wasans:ui-settings:v1"

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [disableSubmissionThumbnails, setDisableSubmissionThumbnails] = useState(() => {
    if (typeof window === "undefined") {
      return false
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return false
      }
      const parsed = JSON.parse(raw) as { disableSubmissionThumbnails?: boolean }
      return Boolean(parsed.disableSubmissionThumbnails)
    } catch {
      // Ignore invalid local settings and keep defaults.
      return false
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          disableSubmissionThumbnails,
        })
      )
    } catch {
      // Ignore storage failures (private mode / browser limits).
    }
  }, [disableSubmissionThumbnails])

  const value = useMemo(
    () => ({ disableSubmissionThumbnails, setDisableSubmissionThumbnails }),
    [disableSubmissionThumbnails]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  return useContext(SettingsContext)
}

export function FloatingSettingsModal() {
  const settings = useSettings()

  if (!settings) {
    return null
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <SidebarMenuButton type="button" className="cursor-pointer" aria-label="Open settings">
          <Settings2Icon className="size-4" />
          <span className="truncate">Settings</span>
        </SidebarMenuButton>
      </DialogTrigger>

      <DialogContent
        className="w-[calc(100%-2rem)] max-w-sm"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Control lightweight client-side preferences.</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Disable submission thumbnails</p>
              <p className="text-xs text-muted-foreground">Prevents preview videos from loading in submission cards.</p>
            </div>
            <Switch
              className="cursor-pointer"
              checked={settings.disableSubmissionThumbnails}
              onCheckedChange={settings.setDisableSubmissionThumbnails}
              aria-label="Disable submission thumbnails"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
