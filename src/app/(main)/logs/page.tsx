"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"

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

type AuthResponse = {
  user: AuthUser | null
  error?: string
}

type AuditLogResponse = {
  results?: AuditLogRow[]
  error?: string
}

function parseDetails(details: string | null) {
  if (!details) {
    return ""
  }

  try {
    const parsed = JSON.parse(details)
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)
  } catch {
    return details
  }
}

export default function LogsPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" })
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

  useEffect(() => {
    if (!user) return
    if (user.permission < 1) {
      setLoading(false)
      return
    }

    const loadLogs = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch("/api/audit-logs?limit=200", { cache: "no-store" })
        const json = (await response.json()) as AuditLogResponse
        if (!response.ok) {
          throw new Error(json.error || "Unable to load audit logs")
        }
        setLogs(json.results || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load audit logs")
      } finally {
        setLoading(false)
      }
    }

    loadLogs()
  }, [user])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-3xl font-bold">Audit Logs</h1>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  if (!user || user.permission < 1) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-3xl font-bold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">Latest moderation and submission actions.</p>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
                <TableCell>{log.actor_name || "Unknown"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {log.action.replaceAll("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div>{log.entity_type}</div>
                  <div className="text-sm text-muted-foreground">{log.entity_uuid || "—"}</div>
                </TableCell>
                <TableCell>
                  <div>{log.target_type || "—"}</div>
                  <div className="text-sm text-muted-foreground">{log.target_uuid || "—"}</div>
                </TableCell>
                <TableCell>
                  <pre className="whitespace-pre-wrap wrap-break-word text-xs text-muted-foreground">
                    {parseDetails(log.details)}
                  </pre>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
