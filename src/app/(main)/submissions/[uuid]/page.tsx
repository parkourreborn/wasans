import { RunPage } from "@/components/site/run-page"

export default async function SubmissionPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params
  return <RunPage uuid={uuid} />
}
