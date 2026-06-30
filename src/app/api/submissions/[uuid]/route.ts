import { DELETE as v1Delete, GET as v1Get, PATCH as v1Patch } from "@/app/api/v1/submissions/[uuid]/route"
import { withDeprecationHeaders } from "@/lib/server/deprecation"

export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  return withDeprecationHeaders(await v1Get(request, { params }))
}

export async function PATCH(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  return withDeprecationHeaders(await v1Patch(request, { params }))
}

export async function DELETE(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  return withDeprecationHeaders(await v1Delete(request, { params }))
}
