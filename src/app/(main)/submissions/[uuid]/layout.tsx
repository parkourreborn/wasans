import type { Metadata } from "next"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getYoutubeEmbedId } from "@/lib/youtube"

type TrialSubmissionMetadataRow = {
  trial_name: string
  player_name: string
  time: number | string
}

type ComboSubmissionMetadataRow = {
  category_slug: string
  player_name: string
  combo_count: number
  youtube_url: string
  category_label: string | null
}

type SubmissionLayoutProps = Readonly<{
  children: React.ReactNode
  params: Promise<{ uuid: string }>
}>

const siteUrl = "https://wasans.tully.sh"
const videoBaseUrl = "https://assets.wasans.tully.sh"

function formatTime(rawTime: string) {
  const match = rawTime.match(/^0*([0-9]+)\.(\d{1,3})$/)
  if (!match) {
    return rawTime
  }

  const [, seconds, ms] = match
  const formattedMs = ms.padEnd(3, "0")
  return `${String(Number(seconds))}.${formattedMs}`
}

async function getTrialSubmissionMetadata(db: D1Database, uuid: string) {
  return db.prepare(
    `SELECT trial_name, player_name, time
     FROM submissions
     WHERE uuid = ?`
  )
    .bind(uuid)
    .first<TrialSubmissionMetadataRow>()
}

async function getComboSubmissionMetadata(db: D1Database, uuid: string) {
  return db.prepare(
    `SELECT combo_submissions.category_slug, combo_submissions.player_name,
            combo_submissions.combo_count, combo_submissions.youtube_url,
            combo_categories.label AS category_label
     FROM combo_submissions
     LEFT JOIN combo_categories ON combo_categories.slug = combo_submissions.category_slug
     WHERE combo_submissions.uuid = ?`
  )
    .bind(uuid)
    .first<ComboSubmissionMetadataRow>()
}

export async function generateMetadata({ params }: SubmissionLayoutProps): Promise<Metadata> {
  const { uuid } = await params
  const pageUrl = `${siteUrl}/submissions/${uuid}`

  const { env } = await getCloudflareContext({ async: true })
  if (!env?.wasans) {
    return { title: "Submission | wasans" }
  }

  const trialSubmission = await getTrialSubmissionMetadata(env.wasans, uuid).catch((err) => {
    console.error(err)
    return null
  })

  if (trialSubmission) {
    const time = formatTime(String(trialSubmission.time))
    const title = `${trialSubmission.trial_name} ${time} | ${trialSubmission.player_name}`
    const description = `${trialSubmission.player_name}'s ${trialSubmission.trial_name} submission in ${time}.`
    const videoUrl = `${videoBaseUrl}/scores/${uuid}.mp4`

    return {
      title,
      description,
      alternates: {
        canonical: pageUrl,
      },
      openGraph: {
        type: "video.other",
        title,
        description,
        siteName: "wasans",
        url: pageUrl,
        videos: [
          {
            url: videoUrl,
            secureUrl: videoUrl,
            type: "video/mp4",
            width: 1280,
            height: 720,
          },
        ],
      },
      twitter: {
        card: "player",
        title,
        description,
        players: [
          {
            playerUrl: pageUrl,
            streamUrl: videoUrl,
            width: 1280,
            height: 720,
          },
        ],
      },
    }
  }

  const comboSubmission = await getComboSubmissionMetadata(env.wasans, uuid).catch((err) => {
    console.error(err)
    return null
  })

  if (comboSubmission) {
    const categoryLabel = comboSubmission.category_label || comboSubmission.category_slug
    const title = `${categoryLabel} ${comboSubmission.combo_count} | ${comboSubmission.player_name}`
    const description = `${comboSubmission.player_name}'s ${categoryLabel} combo submission: ${comboSubmission.combo_count}.`
    const embedId = getYoutubeEmbedId(comboSubmission.youtube_url)
    const imageUrl = embedId ? `https://img.youtube.com/vi/${embedId}/hqdefault.jpg` : undefined

    return {
      title,
      description,
      alternates: {
        canonical: pageUrl,
      },
      openGraph: {
        type: "website",
        title,
        description,
        siteName: "wasans",
        url: pageUrl,
        images: imageUrl ? [{ url: imageUrl, width: 480, height: 360 }] : undefined,
      },
      twitter: {
        card: imageUrl ? "summary_large_image" : "summary",
        title,
        description,
        images: imageUrl ? [imageUrl] : undefined,
      },
    }
  }

  return { title: "Submission | wasans" }
}

export default function SubmissionLayout({ children }: SubmissionLayoutProps) {
  return children
}
