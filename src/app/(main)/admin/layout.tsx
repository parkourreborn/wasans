import type { Metadata } from "next"
import { AdminShell } from "@/components/site/admin/admin-shell"

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
