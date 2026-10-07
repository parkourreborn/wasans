import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// 1 … 4 5 6 … 26
function pageWindow(page: number, totalPages: number) {
  const wanted = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b)

  const items: Array<number | "gap"> = []
  wanted.forEach((value, index) => {
    if (index > 0 && value - wanted[index - 1] > 1) {
      items.push("gap")
    }
    items.push(value)
  })
  return items
}

const boxClass =
  "flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 transition-colors"

export function Pager({
  page,
  totalPages,
  hrefFor,
  className,
}: {
  page: number
  totalPages: number
  hrefFor: (page: number) => string
  className?: string
}) {
  if (totalPages <= 1) {
    return null
  }

  return (
    <nav aria-label="Pages" className={cn("flex items-center justify-center gap-1.5", className)}>
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className={cn(boxClass, "label-caps gap-1 border-line-strong text-[15px] hover:border-[#5a5a5a]")}>
          <ChevronLeftIcon className="size-4" aria-hidden />
          Prev
        </Link>
      ) : (
        <span aria-disabled="true" className={cn(boxClass, "label-caps gap-1 border-line text-[15px] text-[#5a5a5a]")}>
          <ChevronLeftIcon className="size-4" aria-hidden />
          Prev
        </span>
      )}

      <span className="num px-3 text-sm text-muted-foreground sm:hidden">
        {page} / {totalPages}
      </span>

      <div className="hidden items-center gap-1.5 sm:flex">
        {pageWindow(page, totalPages).map((item, index) =>
          item === "gap" ? (
            <span key={`gap-${index}`} className="px-1.5 text-subtle-foreground" aria-hidden>
              …
            </span>
          ) : item === page ? (
            <span key={item} aria-current="page" className={cn(boxClass, "num border-foreground bg-foreground text-sm font-semibold text-background")}>
              {item}
            </span>
          ) : (
            <Link key={item} href={hrefFor(item)} className={cn(boxClass, "num border-line-strong text-sm text-muted-foreground hover:border-[#5a5a5a] hover:text-foreground")}>
              {item}
            </Link>
          )
        )}
      </div>

      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} rel="next" className={cn(boxClass, "label-caps gap-1 border-line-strong text-[15px] hover:border-[#5a5a5a]")}>
          Next
          <ChevronRightIcon className="size-4" aria-hidden />
        </Link>
      ) : (
        <span aria-disabled="true" className={cn(boxClass, "label-caps gap-1 border-line text-[15px] text-[#5a5a5a]")}>
          Next
          <ChevronRightIcon className="size-4" aria-hidden />
        </span>
      )}
    </nav>
  )
}
