"use client"

import { apiV2 } from "@/lib/api"
import { useApi } from "@/hooks/use-api"

export type ComboCategory = { slug: string; label: string; status?: "active" | "disabled"; sort_order?: number }
type ComboCategoriesResponse = { data?: ComboCategory[] }

// Active combo categories in their display order.
export function useComboCategories() {
  const { data, loading, error } = useApi<ComboCategoriesResponse>(apiV2("/combo-categories"))
  const categories = [...(data?.data ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  return { categories, loading, error }
}

// A category's display name. Disabled categories aren't listed publicly, so
// their slug stands in.
export function useComboCategoryLabel(slug: string | undefined) {
  const { categories } = useComboCategories()
  const label = categories.find((category) => category.slug === slug)?.label
  return label ?? (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "")
}
