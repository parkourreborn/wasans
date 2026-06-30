import { GET as getWorldRecords } from "@/app/api/v1/records/world/route"
import { withDeprecationHeaders } from "@/lib/server/deprecation"

export async function GET() {
  return withDeprecationHeaders(await getWorldRecords())
}