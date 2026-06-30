import { GET as v1Get, POST as v1Post } from "@/app/api/v1/submissions/route"
import { withDeprecationHeaders } from "@/lib/server/deprecation"

export async function GET(request: Request) {
  return withDeprecationHeaders(await v1Get(request))
}

export async function POST(request: Request) {
  return withDeprecationHeaders(await v1Post(request))
}
