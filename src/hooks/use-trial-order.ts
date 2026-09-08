"use client"

import { useMemo } from "react"
import { apiV2 } from "@/lib/api"
import { trials as fallbackTrialNames, type TrialName } from "@/lib/trials"
import { useApiGet } from "@/hooks/use-api"

type TrialOrderRow = { name: string; sort_order: number }
type TrialOrderResponse = { data?: TrialOrderRow[] }

const knownTrialNames = new Set<string>(fallbackTrialNames)

// Site-wide trial display order — driven by the admin-configurable
// sort_order in the DB (see /admin's "Trials" reorder UI), falling back to
// src/lib/trials.ts's literal array order while loading or if the request
// fails, so the calculator/compare/WRs/submissions pages never render empty.
export function useTrialOrder() {
  const { data, loading, error } = useApiGet<TrialOrderResponse>(apiV2("/trials"))

  const orderedTrialNames = useMemo<TrialName[]>(() => {
    const rows = data?.data
    if (!rows || rows.length === 0) {
      return [...fallbackTrialNames]
    }

    const ordered = [...rows]
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((row) => row.name)
      .filter((name): name is TrialName => knownTrialNames.has(name))

    // Any trial in src/lib/trials.ts the API didn't return (e.g. it isn't
    // registered in the DB yet) still needs to render somewhere — append it
    // rather than silently dropping it.
    for (const name of fallbackTrialNames) {
      if (!ordered.includes(name)) {
        ordered.push(name)
      }
    }

    return ordered
  }, [data])

  const orderIndex = useMemo(() => {
    const map = new Map<string, number>()
    orderedTrialNames.forEach((name, index) => map.set(name.toUpperCase(), index))
    return map
  }, [orderedTrialNames])

  const compareByTrialOrder = useMemo(() => {
    return (aTrialName: string, bTrialName: string) => {
      const aOrder = orderIndex.get(String(aTrialName).toUpperCase())
      const bOrder = orderIndex.get(String(bTrialName).toUpperCase())
      if (aOrder == null && bOrder == null) return aTrialName.localeCompare(bTrialName)
      if (aOrder == null) return 1
      if (bOrder == null) return -1
      return aOrder - bOrder
    }
  }, [orderIndex])

  return { orderedTrialNames, compareByTrialOrder, loading, error }
}
