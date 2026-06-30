import { POST as v1Deduplicate } from "@/app/api/v1/admin/maintenance/deduplicate/route"
import { withDeprecationHeaders } from "@/lib/server/deprecation"

export async function GET(request: Request) {
  return withDeprecationHeaders(await v1Deduplicate(request))
}