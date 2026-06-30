import { GET as v1Get } from "@/app/api/v1/auth/discord/callback/route"
import { withDeprecationHeaders } from "@/lib/server/deprecation"

export async function GET(request: Request) {
  return withDeprecationHeaders(await v1Get(request))
}
