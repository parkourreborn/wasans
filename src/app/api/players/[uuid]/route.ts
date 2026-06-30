import { GET as v1PlayerGet } from "@/app/api/v1/players/[uuid]/route"
import { withDeprecationHeaders } from "@/lib/server/deprecation"

export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  return withDeprecationHeaders(await v1PlayerGet(request, { params }))
}