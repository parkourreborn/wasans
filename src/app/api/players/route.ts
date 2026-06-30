import { GET as v1PlayersGet } from "@/app/api/v1/players/route"
import { withDeprecationHeaders } from "@/lib/server/deprecation"

export async function GET(request: Request) {
  return withDeprecationHeaders(await v1PlayersGet(request))
}