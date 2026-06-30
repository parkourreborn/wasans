import { POST as v1Post } from "@/app/api/v1/system/error-logs/route"
import { withDeprecationHeaders } from "@/lib/server/deprecation"

export async function POST(request: Request) {
  return withDeprecationHeaders(await v1Post(request))
}
