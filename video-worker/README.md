# wasans-video

Everything that needs ffmpeg runs in one Worker with two Container classes.
They share one image (`container/`):

- **Submission video processing** (`src/processing.js`,
  `container/process.mjs`): every trial submission's video.
- **WR compilation** (`src/compilation.js`, `container/render.mjs`): the
  monthly video of every world record.

The Worker has no public URL. The main app reaches it through the
`VIDEO_SERVICE` service binding and the `video-processing` queue.

## Submission videos

```
browser ──POST /v2/uploads──> main app      (presigned PUT URL, 15 min, this file's type + size)
browser ──PUT──> R2 wasans-uploads/incoming/{id}             (never through a Worker)
browser ──POST /v2/submissions {upload_id}──> main app       (upload consumed once; submission "processing")
main app ──video-processing queue──> this Worker ──> SubmissionVideoProcessor container
container: original -> remux or transcode -> thumbnail -> R2 wasans/scores/{uuid}.mp4 + -preview.jpg
this Worker ──POST /v2/internal/submission-videos/{uuid}──> main app   ("ready": Discord post, approvable)
```

How a video is handled:
- **Remux or transcode.** A video that is already H.264 (yuv420p, at most
  1080p, at most 60fps, a sane bitrate, AAC audio) is **remuxed**. That is
  lossless and only adds fast-start. Anything else is **transcoded** to
  H.264/AAC MP4:
  - Fits within 1080p, never upscaled.
  - Keeps the source frame rate, capped at 60.
  - Applies phone rotation.
- **Thumbnail.** Generated server-side (1280px JPEG, same frame the old
  browser capture used).
- **Originals.** The untouched upload, or the Medal clip as downloaded, is
  kept privately at `wasans-uploads/originals/{uuid}`. Moderators can
  download it from the submission page. A lifecycle rule deletes it after
  90 days.
- **Limits.** 500 MB and 10 minutes. Any format ffmpeg reads is accepted.
- **Failures:**
  - A bad file (corrupt, no video, too long, too big) fails right away
    with a message the player sees.
  - Anything else is retried, up to 3 runs.
  - A submission stuck in "processing" is re-queued by the daily
    maintenance sweep.
- **Isolation.** The container holds no credentials. Every R2 read and
  write goes through this Worker's `media.internal` outbound handler, which
  derives every key from that container's own job.
- **Older videos.** "Video processing backfill" in /admin runs videos from
  before this change through the same pipeline, three at a time.

## WR compilation

Renders the WR compilation video: every active trial's world record, in the
admin trial order. The video is built like this:

1. An intro card ("World Records — October 2026").
2. For each trial, a 2s black card with "{trial} {time}" fading in and out.
3. Then that trial's WR clip:
   - letterboxed to 1080p60
   - fades in and out from black
   - "player (score)" in the bottom left

The finished MP4 goes to `assets.wasans.tully.sh/compilations/…`. It can
also go to YouTube.

The main app starts a render in two ways:
- **Monthly:** `cron-worker` runs at 00:00 UTC on the 1st.
- **On demand:** owners use "WR compilations" in /admin.

## One-time setup

Run these from the repo root unless a step says otherwise.

1. **Workers Paid plan.** Containers and Queues need it.
2. **Create the private bucket and the queues:**
   ```sh
   npx wrangler r2 bucket create wasans-uploads
   npx wrangler queues create video-processing
   npx wrangler queues create video-processing-dlq
   ```
   Don't connect a custom domain or public access to `wasans-uploads`.
3. **Lifecycle rules:**
   - Unused uploads expire after 1 day.
   - Originals expire after 90 days.
   - Half-finished multipart uploads are cleaned up in both buckets.
   ```sh
   npx wrangler r2 bucket lifecycle add wasans-uploads incoming-1d incoming/ --expire-days 1 --abort-multipart-days 1
   npx wrangler r2 bucket lifecycle add wasans-uploads originals-90d originals/ --expire-days 90 --abort-multipart-days 1
   npx wrangler r2 bucket lifecycle add wasans abort-multipart --abort-multipart-days 1
   ```
4. **CORS on the private bucket,** so browsers can PUT to it from the site:
   ```sh
   npx wrangler r2 bucket cors set wasans-uploads --file scripts/r2-uploads-cors.json
   ```
5. **An R2 API token** for signing upload URLs.
   - Create it in Dashboard → R2 → Manage API tokens, with **Object Read &
     Write** permission, applied to the **`wasans-uploads` bucket only**.
   - Put its keys on the main app:
     ```sh
     npx wrangler secret put R2_UPLOAD_ACCESS_KEY_ID
     npx wrangler secret put R2_UPLOAD_SECRET_ACCESS_KEY
     ```
   - Set `R2_ACCOUNT_ID` in the root `wrangler.jsonc`. It's the account ID
     shown on the R2 overview page.
6. **A shared callback secret** on both Workers, using the same value for
   each (for example from `openssl rand -hex 32`):
   ```sh
   npx wrangler secret put VIDEO_CALLBACK_SECRET                       # main app
   cd video-worker && npx wrangler secret put VIDEO_CALLBACK_SECRET   # this Worker
   ```
7. **Run the D1 migrations:**
   ```sh
   npx wrangler d1 execute wasans --remote --file=migrations/0018_wr_compilations.sql   # if not already run
   npx wrangler d1 execute wasans --remote --file=migrations/0019_video_processing.sql
   ```
8. **Deploy this Worker first.** Docker must be running locally, because
   wrangler builds the image:
   ```sh
   cd video-worker && npm install && npx wrangler deploy
   ```
   If you deployed the earlier `wasans-wr-compilations` Worker, delete it.
   It has been replaced by this one:
   ```sh
   npx wrangler delete wasans-wr-compilations
   ```
9. **Deploy the main app** (`npm run deploy`), then the **cron worker**
   (`cd cron-worker && npx wrangler deploy`).
10. **Optional:** start "Video processing backfill" in /admin.

## YouTube uploads

Once set up, the monthly render uploads itself to YouTube as:

- **Title:** "September WRs Compilation | Parkour Reborn". It always names
  the month that just ended, so the Oct 1 run says September.
- **Description:** the fixed text in `COMPILATION_YOUTUBE_DESCRIPTION`
  (`src/lib/server/compilations.ts`), then one timestamp per trial.
  YouTube turns those timestamps into chapters.
- **Visibility:** `YOUTUBE_PRIVACY` in `wrangler.jsonc`, `public` by
  default.
- **Category:** Gaming.

"Generate now" in /admin only uploads when its "Also upload to YouTube" box
is ticked, so test renders stay off the channel. The video is always saved
to R2 too. If the YouTube upload fails, or isn't configured, the render
still succeeds and /admin shows the reason.

### One-time setup

1. **Create a Google Cloud project.** Go to
   https://console.cloud.google.com, create a project (for example
   "wasans"), then open **APIs & Services → Library** and enable **YouTube
   Data API v3**.
2. **Configure the OAuth consent screen.** In **APIs & Services → OAuth
   consent screen** (called "Google Auth Platform" in newer consoles):
   - User type **External**, app name "wasans", your email as the support
     and developer contact.
   - Add the scope `https://www.googleapis.com/auth/youtube.upload`.
   - Set the publishing status to **In production**. While it's left in
     "Testing", the refresh token expires after 7 days and the monthly
     upload breaks. You don't need Google's app verification for this,
     because you're the only one signing in. When you authorize in step 4,
     click through the "Google hasn't verified this app" warning
     (Advanced → continue).
3. **Create an OAuth client.** In **APIs & Services → Credentials → Create
   credentials → OAuth client ID**:
   - Choose type **Web application**.
   - Add the authorized redirect URI
     `https://developers.google.com/oauthplayground`.
   - Copy the **client ID** and **client secret**.
4. **Get a refresh token** at https://developers.google.com/oauthplayground:
   1. Open ⚙️ (top right), tick **Use your own OAuth credentials**, and
      paste the client ID and secret.
   2. Under "Input your own scopes", enter
      `https://www.googleapis.com/auth/youtube.upload` and click
      **Authorize APIs**.
   3. Sign in as the Google account that owns the Parkour Reborn channel.
      If the channel is a Brand Account, pick **the channel itself** on the
      account chooser, not your personal profile. The upload goes to
      whichever channel you pick here.
   4. Click **Exchange authorization code for tokens** and copy the
      **refresh token**.
5. **Store the three secrets** on this Worker:
   ```sh
   cd video-worker
   npx wrangler secret put YOUTUBE_CLIENT_ID
   npx wrangler secret put YOUTUBE_CLIENT_SECRET
   npx wrangler secret put YOUTUBE_REFRESH_TOKEN
   ```
   Uploading turns on as soon as all three exist. Secrets take effect
   immediately, with no redeploy needed. Run `npx wrangler deploy` once if
   you changed `wrangler.jsonc`.
6. **Test it.** In /admin, use "Generate now" with **Also upload to
   YouTube** ticked. The compilation's row gets a YouTube button, or shows
   why the upload failed.
7. **Apply for the YouTube API audit.** Until Google audits the Cloud
   project, every video uploaded through the API is **locked to private**,
   whatever `YOUTUBE_PRIVACY` says. Until then, flip each video to public
   by hand in YouTube Studio. Apply with the
   [YouTube API Services audit form](https://support.google.com/youtube/contact/yt_api_form).
   Describe it as a once-a-month upload of your own channel's compilation
   video. After approval, uploads go public automatically.

### Day to day

- **Turn uploads off without deleting the secrets:** set `YOUTUBE_UPLOAD`
  to `"off"` in `wrangler.jsonc` and deploy.
- **Quota:** one upload costs about 1,600 of the default 10,000 daily API
  units, so a monthly upload (plus the odd manual re-run) is well inside it.
- **"invalid_grant" errors** mean the refresh token was revoked or expired
  (for example, the consent screen went back to "Testing", or the
  account's password changed). Repeat step 4 and update
  `YOUTUBE_REFRESH_TOKEN`.
