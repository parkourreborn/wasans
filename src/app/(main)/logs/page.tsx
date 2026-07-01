"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { apiV1 } from "@/lib/api"
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FilterIcon,
  RefreshCcwIcon,
  SearchIcon,
} from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type AuthUser = {
  uuid: string
  player_id: string
  player_name: string
  score: number
  permission: number
}

type AuditLogRow = {
  id: number
  created_at: string
  actor_uuid: string | null
  actor_name: string | null
  action: string
  entity_type: string
  entity_uuid: string | null
  target_type: string | null
  target_uuid: string | null
  details: string | null
}

type LogDetails = {
  severity?: string
  source?: string
  message?: string
  name?: string
  stack?: string
  path?: string
  method?: string
  routePath?: string
  routeType?: string
  userAgent?: string
  [key: string]: unknown
}

type AuthResponse = {
  user: AuthUser | null
  error?: string
}

type AuditLogResponse = {
  results?: AuditLogRow[]
  total?: number
  summary?: {
    total: number
    errors: number
    errors_24h: number
    latest_error: { id: number; created_at: string } | null
  }
  error?: string
}

const lastSeenErrorStorageKey = "wasans:last-seen-error-at"

function parseDetailsObject(details: string | null): LogDetails {
  if (!details) {
    return {}
  }

  try {
    const parsed = JSON.parse(details)
    return parsed && typeof parsed === "object" ? parsed as LogDetails : { message: String(parsed) }
  } catch {
    return { message: details }
  }
}

function formatDetails(details: string | null) {
  const parsed = parseDetailsObject(details)
  return Object.keys(parsed).length > 0 ? JSON.stringify(parsed, null, 2) : ""
}

function formatAction(action: string) {
  return action.replaceAll("_", " ")
}

function sourceLabel(source: string | undefined) {
  if (!source) {
    return "audit"
  }

  return source.replaceAll("_", " ")
}

function isInTimeRange(log: AuditLogRow, range: string) {
  if (range === "all") {
    return true
  }

  const createdAt = new Date(log.created_at).getTime()
  const hours = range === "24h" ? 24 : range === "7d" ? 168 : 720
  return createdAt >= Date.now() - hours * 60 * 60 * 1000
}

export default function LogsPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [summary, setSummary] = useState<AuditLogResponse["summary"] | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState("all")
  const [source, setSource] = useState("all")
  const [action, setAction] = useState("all")
  const [timeRange, setTimeRange] = useState("all")
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch(apiV1("/auth/me"), { cache: "no-store" })
        const json = (await response.json()) as AuthResponse
        if (!response.ok) {
          throw new Error(json?.error || "Unable to load user")
        }
        setUser(json.user)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load user")
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [])

  const loadLogs = React.useCallback(async () => {
    if (!user || user.permission < 1) {
      return
    }

    setRefreshing(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: "200",
        kind,
        source,
        action,
      })

      if (query.trim()) {
        params.set("q", query.trim())
      }

      const response = await fetch(`${apiV1("/admin/audit-logs")}?${params.toString()}`, { cache: "no-store" })
      const json = (await response.json()) as AuditLogResponse
      if (!response.ok) {
        throw new Error(json.error || "Unable to load audit logs")
      }

      setLogs(json.results || [])
      setSummary(json.summary || null)
      setTotal(json.total || 0)

      if (json.summary?.latest_error?.created_at) {
        window.localStorage.setItem(lastSeenErrorStorageKey, json.summary.latest_error.created_at)
        window.dispatchEvent(new CustomEvent("wasans:last-seen-error-updated"))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load audit logs")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [action, kind, query, source, user])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadLogs()
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [loadLogs])

  const filteredLogs = useMemo(
    () => logs.filter((log) => isInTimeRange(log, timeRange)),
    [logs, timeRange]
  )

  const actions = useMemo(() => {
    const values = new Set(logs.map((log) => log.action))
    return Array.from(values).sort()
  }, [logs])

  const visibleErrorCount = filteredLogs.filter((log) => log.action === "site_error").length
  const latestError = summary?.latest_error?.created_at
    ? new Date(summary.latest_error.created_at).toLocaleString()
    : "None"

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    )
  }

  if (!user || user.permission < 1) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-3xl font-bold">Logs</h1>
        <p className="text-sm text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">Logs</h1>
            {summary?.errors ? (
              <Badge variant="destructive">
                <AlertTriangleIcon />
                {summary.errors} errors
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Moderator dashboard for audit activity, site errors, failed requests, and client crashes.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadLogs()} disabled={refreshing}>
          <RefreshCcwIcon />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-border p-4">
          <p className="text-sm text-muted-foreground">Total Events</p>
          <p className="text-2xl font-semibold">{summary?.total ?? 0}</p>
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="text-sm text-muted-foreground">Total Errors</p>
          <p className="text-2xl font-semibold text-destructive">{summary?.errors ?? 0}</p>
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="text-sm text-muted-foreground">Errors Last 24h</p>
          <p className="text-2xl font-semibold">{summary?.errors_24h ?? 0}</p>
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="text-sm text-muted-foreground">Latest Error</p>
          <p className="truncate text-sm font-medium">{latestError}</p>
        </div>
      </div>

      <div className="sticky top-14 z-30 space-y-3 rounded-md border border-border bg-background/85 p-4 backdrop-blur-xl md:top-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FilterIcon className="size-4" />
          Diagnostics
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full min-w-0 lg:flex-1">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search messages, actors, paths, UUIDs..."
              className="pl-8"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-4 lg:shrink-0">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                <SelectItem value="errors">Errors only</SelectItem>
                <SelectItem value="audit">Audit only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="client_console">Client console</SelectItem>
                <SelectItem value="server">Server</SelectItem>
                <SelectItem value="server_console">Server console</SelectItem>
              </SelectContent>
            </Select>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {formatAction(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any time</SelectItem>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7d</SelectItem>
                <SelectItem value="30d">Last 30d</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Showing {filteredLogs.length} of {total} matching rows. {visibleErrorCount} visible rows are errors.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>When</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Entity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.map((log) => {
              const details = parseDetailsObject(log.details)
              const isError = log.action === "site_error"
              const isExpanded = expanded === log.id
              const message = isError
                ? details.message || details.name || "Site error"
                : formatAction(log.action)
              const pathText = details.path
                ? `${details.method ? `${details.method} ` : ""}${String(details.path)}`
                : null

              return (
                <React.Fragment key={log.id}>
                  <TableRow className={isError ? "bg-destructive/5" : undefined}>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setExpanded(isExpanded ? null : log.id)}
                        aria-label={isExpanded ? "Collapse log details" : "Expand log details"}
                      >
                        {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                      </Button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={isError ? "destructive" : "secondary"} className="capitalize">
                        {isError ? "error" : formatAction(log.action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{sourceLabel(details.source as string | undefined)}</TableCell>
                    <TableCell className="min-w-64 max-w-xl">
                      <div className="truncate font-medium" title={String(message)}>{String(message)}</div>
                      {pathText && (
                        <div className="truncate text-xs text-muted-foreground" title={pathText}>
                          {pathText}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{log.actor_name || "System"}</TableCell>
                    <TableCell>
                      <div>{log.entity_type}</div>
                      <div className="text-xs text-muted-foreground">{log.entity_uuid || "None"}</div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow>
                      <TableCell></TableCell>
                      <TableCell colSpan={6}>
                        <pre className="max-h-96 overflow-auto whitespace-pre-wrap wrap-break-word rounded-md bg-muted p-3 text-xs text-muted-foreground">
                          {formatDetails(log.details) || "No details"}
                        </pre>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              )
            })}
            {filteredLogs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                  No logs match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
