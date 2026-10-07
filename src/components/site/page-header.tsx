import { cn } from "@/lib/utils"

// The big condensed title every rebuilt page opens with. `children` sits
// under the title row (the tier ladder, a record summary, tabs).
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("border-b border-line", className)}>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-7 px-4 pb-8 pt-8 md:pb-9 md:pt-11">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="flex min-w-0 flex-col gap-2">
            {eyebrow ? <div className="label-caps text-sm text-subtle-foreground">{eyebrow}</div> : null}
            <h1 className="font-display text-[52px] font-extrabold uppercase leading-[0.9] tracking-[-0.005em] break-words sm:text-[72px] md:text-[88px]">
              {title}
            </h1>
          </div>
          {description || actions ? (
            <div className="flex max-w-md flex-col items-start gap-3 md:pb-1.5">
              {description ? <p className="text-[15px] leading-relaxed text-muted-foreground">{description}</p> : null}
              {actions}
            </div>
          ) : null}
        </div>
        {children}
      </div>
    </section>
  )
}
