"use client"

import { apiV2 } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"

// Shared pieces for the admin panel pages (/admin/*).

export const PERMISSION_OWNER = 4
export const PERMISSION_MODERATOR = 2
export const PERMISSION_COMBO_MODERATOR = 1

type Envelope<T> = { data?: T; error?: { message?: string } | string }

function messageFrom(json: unknown, fallback: string) {
  const error = (json as Envelope<unknown> | null)?.error
  if (typeof error === "string" && error) return error
  if (error && typeof error === "object" && error.message) return error.message
  return fallback
}

// A JSON write to the API. Throws with the server's message so callers can
// toast it as is.
export async function adminRequest<T = unknown>(
  path: string,
  options: { method?: "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown; fallback?: string } = {}
): Promise<T | undefined> {
  const response = await fetch(apiV2(path), {
    method: options.method ?? "POST",
    headers: options.body === undefined ? undefined : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const json = (await response.json().catch(() => null)) as Envelope<T> | null
  if (!response.ok) {
    throw new Error(messageFrom(json, options.fallback ?? "That didn’t save. Try again."))
  }
  return json?.data
}

export function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function AdminPage({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-8 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 max-w-2xl flex-col gap-2">
          <h1 className="font-display text-[44px] font-extrabold uppercase leading-[0.9] md:text-[60px]">{title}</h1>
          {description ? <p className="text-[15px] leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  )
}

export function AdminSection({
  title,
  description,
  count,
  actions,
  children,
  className,
}: {
  title: string
  description?: React.ReactNode
  count?: number
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const id = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={id} className="flex items-baseline gap-2 font-display text-[26px] font-extrabold uppercase leading-none">
            {title}
            {count !== undefined ? <span className="num text-[15px] font-medium text-subtle-foreground">{count}</span> : null}
          </h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function AdminCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-lg border border-line bg-surface", className)}>{children}</div>
}

export function AdminLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
      <Spinner className="size-4" />
      {label}
    </div>
  )
}

export function AdminError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm" role="alert">
      <span className="flex-1">{message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2 hover:no-underline">
          Try again
        </button>
      ) : null}
    </div>
  )
}

export function AdminEmpty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>
}

// "3 minutes ago", "yesterday", "12 Sep": relative for recent, a date after.
const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
const shortDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" })
const shortDateYear = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" })

export function formatAgo(unixSeconds: number | null | undefined, nowSeconds: number) {
  if (!unixSeconds) return "never"
  const diff = unixSeconds - nowSeconds
  const abs = Math.abs(diff)
  if (abs < 60) return "just now"
  if (abs < 3600) return relativeFormatter.format(Math.round(diff / 60), "minute")
  if (abs < 86400) return relativeFormatter.format(Math.round(diff / 3600), "hour")
  if (abs < 7 * 86400) return relativeFormatter.format(Math.round(diff / 86400), "day")
  const date = new Date(unixSeconds * 1000)
  return date.getFullYear() === new Date(nowSeconds * 1000).getFullYear() ? shortDate.format(date) : shortDateYear.format(date)
}

export function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

export function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`
}
