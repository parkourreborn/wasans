# WR compilation renderer

Renders the WR compilation video: every active trial's world record, in the
admin trial order. The video is built like this:

1. An intro card ("World Records — October 2026").
2. For each trial, a 2s black card with "{trial} {time}" fading in and out.
3. Then that trial's WR clip:
   - letterboxed to 1080p60
   - fades in and out from black
   - "player (score)" in the bottom left

The finished MP4 goes to R2 at
`assets.wasans.tully.sh/compilations/…`. It can also go to YouTube.

The main app starts a render in two ways:
- **Monthly:** `cron-worker` runs at 00:00 UTC on the 1st and calls
  `POST /v2/admin/compilations/scheduled`.
- **On demand:** owners use the "WR compilations" section in /admin.

Either way, the main app builds the job and sends it here through its
`COMPILATION_RENDERER` service binding. This Worker has no public URL.

```
main app ──service binding──> this Worker ──> Container (ffmpeg, container/render.mjs)
                                   ^                  │
                                   └──outbound handlers┘  (R2 read/write, D1 progress, YouTube token)
```

## One-time setup

1. **Workers Paid plan.** Containers aren't available on the free plan.
2. **Run the D1 migration** from the repo root:
   ```sh
   npx wrangler d1 execute wasans --remote --file=migrations/0018_wr_compilations.sql
   ```
3. **Deploy this Worker first.** Docker must be running locally, because
   wrangler builds the image:
   ```sh
   cd video-worker
   npm install
   npx wrangler deploy
   ```
   The first deploy takes a few minutes while the image is pushed.
4. **Deploy the main app** (`npm run deploy` at the repo root). It now has a
   service binding to `wasans-wr-compilations`, so step 3 must come first.
5. **Deploy the cron worker** (`cd cron-worker && npx wrangler deploy`) to
   pick up the monthly `0 0 1 * *` trigger.

No R2 API keys are needed. The container reaches R2 and D1 only through
this Worker's bindings.

## YouTube (optional, can be done later)

Uploading is turned on automatically once all three secrets are set. Until
then, renders just go to R2.

1. In Google Cloud Console:
   - Create a project.
   - Enable **YouTube Data API v3**.
   - Configure the OAuth consent screen and add the
     `https://www.googleapis.com/auth/youtube.upload` scope.
   - Set the publishing status to **In production**. While it's left in
     "Testing", refresh tokens expire after 7 days.
2. Create an OAuth client of type **Web application**. Add
   `https://developers.google.com/oauthplayground` as a redirect URI.
3. Get a refresh token from the
   [OAuth Playground](https://developers.google.com/oauthplayground):
   - In ⚙️, tick "Use your own OAuth credentials" and enter the client
     ID and secret.
   - Authorize the `youtube.upload` scope, signed in as the channel
     owner.
   - Exchange the code for tokens, and copy the refresh token.
4. Store the three secrets:
   ```sh
   cd video-worker
   npx wrangler secret put YOUTUBE_CLIENT_ID
   npx wrangler secret put YOUTUBE_CLIENT_SECRET
   npx wrangler secret put YOUTUBE_REFRESH_TOKEN
   ```

Videos upload as `YOUTUBE_PRIVACY` (in `wrangler.jsonc`, default
`unlisted`). Set `YOUTUBE_UPLOAD` to `"off"` to pause uploads without
deleting the secrets.

The description gets a timestamp per trial, which YouTube turns into
chapters.

**Note:** Google restricts videos uploaded through the API from an
*unverified* project to **private**. This applies whatever
`YOUTUBE_PRIVACY` says, until the project passes Google's
[YouTube API audit](https://support.google.com/youtube/contact/yt_api_form).
Until then, the upload still works, and you change the visibility by hand
in YouTube Studio.

A failed YouTube upload doesn't fail the render. The R2 copy is still
there, and the error shows in /admin.
