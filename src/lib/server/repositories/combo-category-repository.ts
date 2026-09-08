import "server-only"

export type ComboCategoryStatus = "active" | "disabled"

export type ComboCategoryRow = {
  slug: string
  label: string
  status: ComboCategoryStatus
  sort_order: number
  added_at: number
}

export class ComboCategoryError extends Error {
  code: "invalid_slug" | "already_exists" | "not_found"

  constructor(message: string, code: ComboCategoryError["code"]) {
    super(message)
    this.code = code
  }
}

export async function listComboCategories(db: D1Database): Promise<ComboCategoryRow[]> {
  const { results } = await db.prepare(
    `SELECT slug, label, status, sort_order, added_at
     FROM combo_categories
     ORDER BY sort_order ASC, slug ASC`
  ).all<ComboCategoryRow>()

  return results || []
}

export async function listActiveComboCategories(db: D1Database): Promise<ComboCategoryRow[]> {
  const { results } = await db.prepare(
    `SELECT slug, label, status, sort_order, added_at
     FROM combo_categories
     WHERE status = 'active'
     ORDER BY sort_order ASC, slug ASC`
  ).all<ComboCategoryRow>()

  return results || []
}

export async function getComboCategory(db: D1Database, slug: string): Promise<ComboCategoryRow | null> {
  return db.prepare(
    `SELECT slug, label, status, sort_order, added_at
     FROM combo_categories
     WHERE slug = ?`
  )
    .bind(slug)
    .first<ComboCategoryRow>()
}

export async function isValidComboCategorySlug(db: D1Database, slug: string): Promise<boolean> {
  const category = await getComboCategory(db, slug)
  return Boolean(category && category.status === "active")
}

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export async function createComboCategory(
  db: D1Database,
  input: { slug: string; label: string; sortOrder?: number },
  nowSeconds: number
) {
  const slug = input.slug.trim().toLowerCase()
  const label = input.label.trim()

  if (!slugPattern.test(slug)) {
    throw new ComboCategoryError(`"${input.slug}" is not a valid category slug (lowercase letters, numbers, hyphens)`, "invalid_slug")
  }

  if (!label) {
    throw new ComboCategoryError("label is required", "invalid_slug")
  }

  const existing = await getComboCategory(db, slug)
  if (existing) {
    throw new ComboCategoryError(`Combo category "${slug}" already exists`, "already_exists")
  }

  await db.prepare(
    `INSERT INTO combo_categories (slug, label, status, sort_order, added_at)
     VALUES (?, ?, 'active', ?, ?)`
  )
    .bind(slug, label, input.sortOrder ?? 0, nowSeconds)
    .run()

  return getComboCategory(db, slug)
}

export async function renameComboCategory(db: D1Database, slug: string, label: string) {
  const existing = await getComboCategory(db, slug)
  if (!existing) {
    throw new ComboCategoryError(`Combo category "${slug}" was not found`, "not_found")
  }

  const trimmedLabel = label.trim()
  if (!trimmedLabel) {
    throw new ComboCategoryError("label is required", "invalid_slug")
  }

  await db.prepare(`UPDATE combo_categories SET label = ? WHERE slug = ?`)
    .bind(trimmedLabel, slug)
    .run()

  return getComboCategory(db, slug)
}

export async function setComboCategoryStatus(db: D1Database, slug: string, status: ComboCategoryStatus) {
  const existing = await getComboCategory(db, slug)
  if (!existing) {
    throw new ComboCategoryError(`Combo category "${slug}" was not found`, "not_found")
  }

  await db.prepare(`UPDATE combo_categories SET status = ? WHERE slug = ?`)
    .bind(status, slug)
    .run()

  return getComboCategory(db, slug)
}
