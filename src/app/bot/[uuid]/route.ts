import { PATCH as patchSubmission } from "@/app/api/submissions/[uuid]/route"

export async function PATCH(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params

  return patchSubmission(request, {
    params: Promise.resolve({ uuid }),
  })
}
