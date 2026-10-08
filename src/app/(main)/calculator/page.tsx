import { Suspense } from "react"
import type { Metadata } from "next"
import { CalculatorPage } from "@/components/site/calculator-page"

export const metadata: Metadata = { title: "Calculator" }

export default function CalculatorRoute() {
  return (
    <Suspense fallback={null}>
      <CalculatorPage />
    </Suspense>
  )
}
