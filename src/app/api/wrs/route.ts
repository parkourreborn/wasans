import { GET as getWorldRecords } from "@/app/api/v1/records/world/route"
import { withDeprecationHeaders } from "@/lib/server/deprecation"

export async function GET(request: Request) {
  return withDeprecationHeaders(await getWorldRecords(request))
}