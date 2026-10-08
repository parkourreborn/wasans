"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, GripVerticalIcon, PencilIcon, XIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { invalidateApi, setApiData, useApi } from "@/hooks/use-api"
import {
  AdminCard,
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPage,
  AdminSection,
  adminRequest,
  errorText,
} from "@/components/site/admin/admin-kit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"

type Category = { slug: string; label: string; status: "active" | "disabled"; sort_order: number; added_at: number }

const CATEGORIES_URL = `${apiV2("/combo-categories")}?include=all`

function refresh() {
  // The public list (active only) feeds the combo leaderboard and submit form.
  invalidateApi(apiV2("/combo-categories"))
}

function slugify(label: string) {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

export function AdminCombosPage() {
  const { data, error, loading, refetch } = useApi<{ data: Category[] }>(CATEGORIES_URL)
  const categories = [...(data?.data ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const [dragging, setDragging] = useState<string | null>(null)

  const reorder = async (slugs: string[]) => {
    const previous = data
    const position = new Map(slugs.map((slug, index) => [slug, index]))
    setApiData(CATEGORIES_URL, { ...data, data: categories.map((category) => ({ ...category, sort_order: position.get(category.slug) ?? category.sort_order })) })
    try {
      await adminRequest("/combo-categories/reorder", { body: { slugs }, fallback: "Couldn’t save the order" })
      refresh()
    } catch (err) {
      if (previous) setApiData(CATEGORIES_URL, previous)
      toast.error(errorText(err, "Couldn’t save the order"))
    }
  }

  const move = (slug: string, to: number) => {
    const slugs = categories.map((category) => category.slug)
    const from = slugs.indexOf(slug)
    if (from === -1 || to < 0 || to >= slugs.length || from === to) return
    slugs.splice(from, 1)
    slugs.splice(to, 0, slug)
    void reorder(slugs)
  }

  return (
    <AdminPage title="Combos" description="The categories on the combo leaderboard and the submit form, in the order shown there.">
      <AddCategory existing={categories} />
      <AdminSection title="Categories" count={data ? categories.length : undefined}>
        {error && !data ? <AdminError message={error} onRetry={refetch} /> : null}
        {loading && !data ? <AdminLoading /> : null}
        {data && categories.length === 0 ? <AdminEmpty>No categories yet. Add the first one above.</AdminEmpty> : null}
        {categories.length > 0 ? (
          <AdminCard>
            <ul className="m-0 list-none p-0">
              {categories.map((category, index) => (
                <li
                  key={category.slug}
                  draggable
                  onDragStart={() => setDragging(category.slug)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragging) move(dragging, index)
                    setDragging(null)
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={cn("border-b border-line last:border-b-0", dragging === category.slug && "opacity-40")}
                >
                  <CategoryRow
                    category={category}
                    first={index === 0}
                    last={index === categories.length - 1}
                    onMove={(delta) => move(category.slug, index + delta)}
                  />
                </li>
              ))}
            </ul>
          </AdminCard>
        ) : null}
      </AdminSection>
    </AdminPage>
  )
}

function AddCategory({ existing }: { existing: Category[] }) {
  const [label, setLabel] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const finalSlug = (slugEdited ? slug : slugify(label)).trim()
  const taken = existing.some((category) => category.slug === finalSlug)

  const add = async () => {
    if (!label.trim() || !finalSlug || taken) return
    setBusy(true)
    try {
      await adminRequest("/combo-categories", {
        body: { slug: finalSlug, label: label.trim(), sort_order: existing.length },
        fallback: "Couldn’t add that category",
      })
      toast.success(`${label.trim()} added to the combo leaderboard`)
      setLabel("")
      setSlug("")
      setSlugEdited(false)
      invalidateApi(CATEGORIES_URL)
      refresh()
    } catch (err) {
      toast.error(errorText(err, "Couldn’t add that category"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void add()
      }}
    >
      <span className="label-caps text-[13px] text-subtle-foreground">Add a category</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-[13px] text-muted-foreground">
          Name
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Gearless" className="h-10" />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground sm:w-56">
          Link name
          <Input
            value={slugEdited ? slug : slugify(label)}
            onChange={(event) => {
              setSlugEdited(true)
              setSlug(event.target.value.toLowerCase())
            }}
            placeholder="gearless"
            className="h-10 font-mono"
            aria-invalid={taken || undefined}
          />
        </label>
        <Button type="submit" className="h-10" disabled={busy || !label.trim() || !finalSlug || taken}>
          {busy ? <Spinner className="size-4" /> : null}
          Add
        </Button>
      </div>
      <p className={cn("m-0 text-[13px]", taken ? "text-destructive" : "text-muted-foreground")}>
        {taken ? `“${finalSlug}” is already used.` : "The link name appears in URLs and can’t be changed later; the name can."}
      </p>
    </form>
  )
}

function CategoryRow({ category, first, last, onMove }: { category: Category; first: boolean; last: boolean; onMove: (delta: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(category.label)
  const [busy, setBusy] = useState(false)
  const active = category.status === "active"

  const save = async (patch: { label?: string; status?: Category["status"] }, done: string) => {
    setBusy(true)
    try {
      await adminRequest(`/combo-categories/${encodeURIComponent(category.slug)}`, { method: "PATCH", body: patch, fallback: "Couldn’t save that" })
      toast.success(done)
      setEditing(false)
      invalidateApi(CATEGORIES_URL)
      refresh()
    } catch (err) {
      toast.error(errorText(err, "Couldn’t save that"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-14 items-center gap-3 px-3 py-2">
      <GripVerticalIcon className="size-4 shrink-0 cursor-grab text-subtle-foreground" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        {editing ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              if (label.trim()) void save({ label: label.trim() }, `Renamed to ${label.trim()}`)
            }}
          >
            <Input value={label} onChange={(event) => setLabel(event.target.value)} className="h-8 max-w-56" autoFocus aria-label="Category name" />
            <Button type="submit" size="icon-sm" variant="outline" aria-label="Save name" disabled={busy || !label.trim()}>
              <CheckIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Cancel"
              onClick={() => {
                setLabel(category.label)
                setEditing(false)
              }}
            >
              <XIcon className="size-3.5" />
            </Button>
          </form>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="group flex w-fit items-center gap-1.5 text-left text-[15px]">
            <span className={cn(!active && "text-muted-foreground")}>{category.label}</span>
            <PencilIcon className="size-3 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
            <span className="sr-only">Rename</span>
          </button>
        )}
        <span className="text-[12px] text-subtle-foreground">
          <span className="font-mono">{category.slug}</span> · added {formatDate(category.added_at)}
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        <Button size="icon-sm" variant="ghost" aria-label={`Move ${category.label} up`} disabled={first} onClick={() => onMove(-1)}>
          <ArrowUpIcon className="size-3.5" />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label={`Move ${category.label} down`} disabled={last} onClick={() => onMove(1)}>
          <ArrowDownIcon className="size-3.5" />
        </Button>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <span className="hidden sm:inline">{active ? "Shown" : "Hidden"}</span>
        <Switch
          checked={active}
          disabled={busy}
          onCheckedChange={(checked) => void save({ status: checked ? "active" : "disabled" }, checked ? `${category.label} is shown again` : `${category.label} is hidden`)}
          aria-label={`Show ${category.label} on the leaderboard`}
        />
      </label>
    </div>
  )
}
