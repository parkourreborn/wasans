import type { Metadata } from "next"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ProfilePage } from "@/components/site/profile/profile-page"
import { getPlayerByUuid } from "@/lib/server/repositories/player-repository"
import { tierForScore } from "@/lib/tiers"

type Props = { params: Promise<{ uuid: string }> }

// The player's name and score in the tab title and link previews. A failed
// lookup only costs the preview, never the page.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { uuid } = await params
  const env = await getCloudflareContext({ async: true })
    .then((context) => context.env)
    .catch(() => null)
  const player = env?.wasans ? await getPlayerByUuid(env.wasans, uuid).catch(() => null) : null
  if (!player) {
    return { title: "Player" }
  }
  const score = Number(player.score || 0)
  const description = `${player.player_name} · ${tierForScore(score).name} · score ${score.toFixed(3)} on wasans.`
  return {
    title: player.player_name,
    description,
    openGraph: { type: "profile", title: player.player_name, description, siteName: "wasans" },
  }
}

export default async function PlayerRoute({ params }: Props) {
  const { uuid } = await params
  return <ProfilePage uuid={uuid} />
}
