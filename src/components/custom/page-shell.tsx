import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type PageShellProps = {
  children: React.ReactNode
  className?: string
}

export function PageShell({ children, className }: PageShellProps) {
  return (
    <div className={cn("stagger-in mx-auto flex w-full max-w-[95vw] flex-col gap-4 px-3 pb-6 pt-3 md:gap-5 md:px-4 lg:px-5", className)}>
      {children}
    </div>
  )
}

type PageHeaderProps = {
  title: string
  description?: string
  eyebrow?: string
  actions?: React.ReactNode
  aside?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return actions ? (
    <section className={cn("animate-subtle-in flex flex-wrap items-center gap-3", className)}>
      {actions}
    </section>
  ) : null
}

type SectionCardProps = {
  title?: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
}

export function SectionCard({ title, description, action, children, className, contentClassName }: SectionCardProps) {
  return (
    <Card className={cn("animate-subtle-in overflow-hidden border-border/70 bg-background/55", className)}>
      {title || description || action ? (
        <CardHeader className="flex flex-col gap-4 border-b border-border/60 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            {title ? <CardTitle className="text-lg font-semibold tracking-tight">{title}</CardTitle> : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {action ? <div className="flex items-center gap-2">{action}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn("p-4 md:p-5", contentClassName)}>{children}</CardContent>
    </Card>
  )
}

type StatCardProps = {
  label: string
  value: React.ReactNode
  meta?: React.ReactNode
  className?: string
}

export function StatCard({ label, value, meta, className }: StatCardProps) {
  return (
    <Card className={cn("border-border/70 bg-background/55", className)}>
      <CardContent className="space-y-2 p-4 md:p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
        <div className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{value}</div>
        {meta ? <div className="text-xs text-muted-foreground md:text-sm">{meta}</div> : null}
      </CardContent>
    </Card>
  )
}

type ErrorStateProps = {
  title?: string
  message: string
  actions?: React.ReactNode
  className?: string
}

type SubmissionListProps = {
  children: React.ReactNode
  className?: string
}

export function SubmissionList({ children, className }: SubmissionListProps) {
  return <div className={cn("min-w-0", className)}>{children}</div>
}

export function ErrorState({ title = "Something went wrong", message, actions, className }: ErrorStateProps) {
  return (
    <Card className={cn("border-border/70 bg-background/55", className)}>
      <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="max-w-lg text-sm text-muted-foreground">{message}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center justify-center gap-3">{actions}</div> : null}
      </CardContent>
    </Card>
  )
}
