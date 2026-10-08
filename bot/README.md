# wasans-bot

A Discord bot that exposes an HTTP API for managing submission threads, member
roles/nicknames, and direct messages, plus a set of slash commands for browsing
leaderboards, submissions, personal bests, world records, and player stats.

The HTTP API is versioned. **`/v2/*` is frozen** and behaves exactly as it always
has — nothing about it changed in this rewrite except where it lives in the
codebase. **`/v3/*`** is the current version and is where new functionality
lands, starting with `average_score_change` on world record submissions. Both
versions run side by side on the same server and port; pick whichever your
integration targets, and migrate to v3 whenever convenient using the guide at
the bottom of this document.

## Project layout

```
index.js                    bot entrypoint (Discord client + HTTP server wiring)
src/
  config.js                 env vars, static IDs, and per-guild config
  logger.js                 embeds sent to the logging channel
  discordClient.js          discord.js Client instance
  resolvers.js               URL builders, state-tag/role resolution
  wasansApi.js              site API client (short-lived response cache)
  players.js                player option: name / @mention / "me" / autocomplete
  trials.js, comboCategories.js   trial and combo category lists from the site
  scoring.js                trial score formula and tiers, ported from the site
  discord/api.js            thin wrappers around discord.js calls
  submissions/
    formatter.js            builds submission thread titles/messages
    store.js                 in-memory submission_id -> thread_id cache
  commands/
    adminCommands.js        "!status" / "!say" / "!delete" text commands
    slashCommands.js        registration and dispatch for the commands below
    leaderboard.js, submissions.js, stats.js, wrs.js   one module per command
    runCard.js              the single-submission card
    session.js              tabs, paging and "Open a run" menus
  render/
    theme.js, card.js       the site's look, and shared card layout pieces
    metrics.js              glyph widths read from the bundled fonts
    png.js, avatar.js       SVG -> PNG rendering, avatar and preview fetches
    cache.js                LRU cache of rendered pages
    templates/*.js          one SVG template per card type
    submissionModeration.js  Approve/Deny/Pending/Change Time/Note buttons
  api/
    server.js                HTTP server: auth, logging, dispatch
    errors.js / http.js / assertions.js   shared low-level helpers
    executors.js             route business logic, shared by v2 and v3
    routerFactory.js          builds a versioned router (dispatch + /batch)
    v2/validators.js, v2/router.js
    v3/validators.js, v3/router.js
```

`v2` and `v3` each own their own validator and router modules, but both call
into the same `executors.js`. The only place their behavior actually diverges
is the submission sync executor, which is told whether to render the v3-only
`average_score_change` line.

## Authentication

Every request (v2 and v3 alike) requires:

- `Authorization: Bearer <SITE_TO_BOT_KEY>`
- `Content-Type: application/json`
- `POST` method — anything else gets `405 Method Not Allowed`

Missing/incorrect auth returns `401 Unauthorized`. If `SITE_TO_BOT_KEY` isn't
configured on the server at all, every request returns `500` with code
`discord_error`. The key is compared in constant time, and only requests that
carry it are posted to the Discord logging channel; everything else is logged
to the container's console only.

## Network access

The HTTP API has no public address. The site's Worker reaches it through a
[Workers VPC Service](https://developers.cloudflare.com/workers-vpc/) bound as
`BOT_SERVICE` in the site's `wrangler.jsonc`. The VPC Service points at the
host `bot` on port `4500` behind the Pi's Cloudflare Tunnel; `bot` is this
service's name in `docker-compose.yml`, so the `tunnel` container resolves it
on the Compose network. The tunnel must connect over QUIC (outbound UDP 7844)
for Workers VPC to work.

The tunnel needs no public hostname: don't add one for the bot in the
Cloudflare dashboard.

## Error shape

All error responses share one shape:

```json
{
  "ok": false,
  "error": { "code": "bad_request", "message": "submission_id must be a non-empty string" }
}
```

`code` is one of `bad_request` (400), `unauthorized` (401), `not_found` (404),
or `discord_error` (500).

## Environment variables

- `DISCORD_TOKEN` / `BOT_TOKEN` — bot token for Discord login.
- `SITE_TO_BOT_KEY` — bearer token the site must send on every HTTP request.
  Must match the site's `SITE_TO_BOT_KEY` secret.
- `BOT_TO_SITE_KEY` — bearer token the bot sends to the site's bot-only routes
  (moderation buttons, giveaways, Discord-id lookups). Must match the site's
  `BOT_TO_SITE_KEY` secret. Keep it different from `SITE_TO_BOT_KEY`.
- `API_SECRET` — the old shared key. Only used for whichever of the two keys
  above is unset.
- `PORT` — HTTP port (default `4500`).
- `SUBMISSIONS_FORUM_CHANNEL_ID`, `RANK_MILESTONES_CHANNEL_ID`, `WR_PING_ROLE_ID`,
  `MODERATOR_ROLE_ID`, `WASANS_MEMBER_ROLE_ID` — channel/role overrides.
- `SUBMISSION_BASE_URL`, `SUBMISSION_ASSETS_BASE_URL`, `PLAYER_BASE_URL`,
  `SUBMISSION_API_BASE_URL` — external URL overrides.
- `TAG_PENDING_ID`, `TAG_APPROVED_ID`, `TAG_DENIED_ID`, `TAG_WR_ID` — forum tag overrides.
- `SCOPE_RANKING_ROLE_IDS`, `SCOPE_MEMBER_ROLE_IDS` — comma-separated role ID
  allowlists for `members/sync`. If unset, ranking defaults to the configured
  rank roles + member role, and member defaults to just the member role.

All of these have hardcoded fallbacks matching the current production guild, so
none are strictly required to boot.

---

## Deploying on the Pi

The Pi checks out only `bot/` from the monorepo (a sparse, blobless clone), and
`scripts/pi-update.sh`, run every minute from cron, rebuilds and restarts the
bot only when a new commit on `main` changes something under `bot/`. Site-only
commits are fast-forwarded past without a restart. See the comment at the top
of that script for the one-time setup.

---

# v3 API (current)

Base path: `/v3/`. Every route below also has a `/v3/batch` equivalent — see
[Batch requests](#batch-requests-v2-and-v3).

## `POST /v3/submissions/sync`

Creates or updates a submission's forum thread: sets the thread title, applies
state/WR tags, and rewrites the starter message content.

### Request body

```json
{
  "submission_id": "abc123",
  "state": "approved",
  "trial_name": "Crystal",
  "player_name": "Tully",
  "player_discord_id": "111222333444555666",
  "discord_avatar": null,
  "discord_avatar_discriminator": null,
  "time_new": 11.111,
  "time_old": 12.345,
  "score_new": 0.520,
  "score_old": 0.500,
  "is_wr": true,
  "average_score_change": 0.0157,
  "moderator_note": "",
  "thread_id": null,
  "previous_wr": { "player_name": "OldChamp", "time": 12.5, "thread_id": null },
  "options": { "send_wr_ping": true, "create_if_missing": true }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `submission_id` | string | yes | Used to look up an existing thread if `thread_id` is omitted. |
| `state` | `"pending" \| "approved" \| "denied"` | yes | Drives which forum tag is applied and which lines appear. |
| `trial_name` | string | yes | |
| `player_name` | string | yes | Used in the title, and as the message mention fallback. |
| `player_discord_id` | string | no | If set, the message mentions `<@id>` instead of the player name. |
| `discord_avatar`, `discord_avatar_discriminator` | string | no | Unused by message rendering today, accepted for forward compatibility. |
| `time_new` | number > 0 | yes | |
| `time_old` | number | no | |
| `score_new`, `score_old` | number | no | Only rendered when `state` is `approved`. |
| `is_wr` | boolean | yes | Gates the WR tag, the "Previous WR" line, and `average_score_change`. |
| **`average_score_change`** | number | no | **New in v3.** See below. |
| `moderator_note` | string | no | Rendered as `Moderator note: <note>` (or `N/A`). |
| `thread_id` | string | no | Existing thread to update. If omitted, the bot looks up a thread it previously created for this `submission_id`; if none is known and `options.create_if_missing` is true, a new thread is created. |
| `previous_wr.player_name`, `.time`, `.thread_id` | — | no | Only used when `is_wr && state === 'approved'`. If `thread_id` is set, a `<#thread_id>` link is shown instead of the plain text line. |
| `options.send_wr_ping` | boolean | no | If true and the submission is an approved WR, pings `wr_ping_role_id` in the thread. |
| `options.create_if_missing` | boolean | no | If true, creates a new thread when no existing one is found. Otherwise returns `404`. |

### The new `average_score_change` argument

`average_score_change` is a plain number representing the average change in
score across all users caused by this submission (e.g. everyone's rank score
shifting slightly because a new WR changed the scoring curve). It's supplied
by the caller — the bot does not compute it.

**It is only ever shown in the message content when `is_wr` is `true`.** It is
never part of the thread title. If the field is omitted, or `is_wr` is false,
the line is silently skipped — this field is always optional.

When shown, it's rendered as a signed, 3-decimal line directly after the
`Previous WR` line:

```
Average score change: +0.016
```

or, for a negative change:

```
Average score change: -0.003
```

### Response

```json
{
  "ok": true,
  "submission_id": "abc123",
  "thread": { "id": "999...", "created": false, "updated": true, "tags_applied": ["..."] },
  "wr_ping_sent": true
}
```

### Errors

- `404 not_found` — no thread known for this submission and `create_if_missing` was not set.
- `400 bad_request` — validation failure (see the table above).

---

## `POST /v3/submissions/delete`

Deletes or archives a submission's forum thread.

```json
{ "submission_id": "abc123", "thread_id": "999...", "mode": "delete" }
```

- `mode` — `"delete"` permanently removes the thread; `"archive"` archives and
  locks it instead.
- `thread_id` — optional. If omitted or blank, the call is a no-op success
  (`skipped: true`) rather than an error, so callers don't need to track
  whether a thread was ever created.

Response:

```json
{ "ok": true, "submission_id": "abc123", "thread_deleted": true, "thread_archived": false, "skipped": false }
```

---

## `POST /v3/members/sync`

Reconciles a guild member's roles (within a scope) and, optionally, their
nickname. Roles outside the given scope are never touched.

```json
{
  "discord_user_id": "111222333444555666",
  "scope": "ranking",
  "score": 0.62,
  "nickname": "Tully (0.620)",
  "options": { "update_nickname": true, "remove_unlisted_in_scope": true }
}
```

- `scope` — `"ranking"` or `"member"` (configurable via `SCOPE_*_ROLE_IDS`).
- Either `score` **or** `desired_role_ids_in_scope` must be provided:
  - For `scope: "ranking"`, pass `score` and the bot resolves the correct rank
    role (and the base member role once `score >= 0.3`) itself.
  - Otherwise, pass `desired_role_ids_in_scope` explicitly — every ID must
    belong to the target scope or the request is rejected with `400`.
- `options.remove_unlisted_in_scope` (default `true`) — remove any role in
  scope that isn't in the desired set.
- `options.update_nickname` — if true, sets `nickname` (only if non-empty).
  `nickname_updated` in the response is true only when the nickname actually
  changed.
- Role and nickname changes are applied in one member edit, and no Discord call
  is made when nothing changed. For members the bot can't manage (the owner, or
  anyone above the bot's top role), roles are still synced and the nickname is
  attempted separately.
- When `scope: "ranking"` causes an actual rank change, the bot also posts a
  promotion/demotion announcement to `rank_milestones_channel_id` (best-effort
  — failure to post doesn't fail the request).

Response:

```json
{
  "ok": true,
  "member_found": true,
  "roles_added": ["..."],
  "roles_removed": ["..."],
  "roles_unchanged_in_scope": ["..."],
  "out_of_scope_roles_preserved_count": 2,
  "nickname_updated": true,
  "rank_milestone_message_sent": false
}
```

If the member isn't in the guild, this still returns `200` with
`member_found: false` rather than an error.

---

## `POST /v3/messages/dm`

Sends a direct message to a user by Discord ID.

```json
{
  "discord_user_id": "111222333444555666",
  "content": "Your submission was approved!",
  "options": { "suppress_embeds": false, "fail_if_cannot_dm": true }
}
```

- `content` — max 2000 characters.
- `options.fail_if_cannot_dm` (default `true`) — if false, an undeliverable DM
  (e.g. the user has DMs closed) returns `200` with `delivered: false` instead
  of a `500` error.

Response:

```json
{ "ok": true, "delivered": true, "message_id": "..." }
```

---

## Batch requests (v2 and v3)

`POST /v3/batch` (and `POST /v2/batch`) runs multiple requests against routes
of **that same version** in one call:

```json
{
  "requests": [
    { "id": "1", "route": "/v3/submissions/sync", "body": { "...": "..." } },
    { "id": "2", "route": "/v3/messages/dm", "body": { "...": "..." } }
  ],
  "options": { "continue_on_error": true }
}
```

- `options.continue_on_error` (default `true`) — if false, batch execution
  stops at the first failed request.
- Each `route` must be a full path under the same version prefix as the batch
  call itself (e.g. a `/v3/batch` call cannot invoke a `/v2/...` route).
- `/v3/members/sync` requests inside a `/v3/batch` don't post per-member log
  embeds; the batch posts one "Member sync batch completed" summary instead
  (counts, plus each failure listed).

Response — one result per request, in order, whether or not earlier ones
failed:

```json
{
  "ok": true,
  "results": [
    { "id": "1", "ok": true, "status": 200, "body": { "...": "..." } },
    { "id": "2", "ok": true, "status": 200, "body": { "...": "..." } }
  ],
  "failed_count": 0
}
```

---

# v2 API (frozen)

`/v2/submissions/sync`, `/v2/submissions/delete`, `/v2/members/sync`,
`/v2/messages/dm`, and `/v2/batch` all behave exactly as before this rewrite —
same request/response shapes, same validation, same error codes. The one
difference from v3 is that **v2 has no `average_score_change` field**; if you
send it anyway, it's silently ignored and never rendered, since the WR message
formatting for v2 never looks at it.

For the full field-by-field spec of each route, see the v3 sections above —
every field except `average_score_change` is identical between the two
versions.

---

# Migrating from v2 to v3

v3 is a drop-in replacement for v2: same auth, same paths minus the version
prefix, same request/response shapes, same error format. To migrate:

1. Change your request paths from `/v2/...` to `/v3/...` (and `/v2/batch` to
   `/v3/batch`, including the `route` values inside batch requests).
2. Optionally start sending `average_score_change` on
   `submissions/sync` calls where `is_wr` is `true`, if you want the average
   score change line to appear in the thread message. It's the only new
   field in v3 — everything else is unchanged.
3. That's it. No other field was renamed, removed, or changed in meaning.

## What was removed in this rewrite (applies to both versions)

The **honeypot channel feature** — the bot no longer posts a warning message
in a dedicated channel, watches for messages posted there, or auto-bans users
who post in it. This was never part of the HTTP API (it only ran off
Discord's own `messageCreate` event), so it has no effect on either `/v2/*` or
`/v3/*` callers — it's mentioned here only because it's gone from the bot's
runtime behavior entirely.

---

# Slash commands

Four commands, each answering with a rendered card in the site's style.
Command replies are public.

| Command | What it shows |
| --- | --- |
| `/leaderboard [board] [player]` | `board`: Overall (the default), any trial, any combo category, or "Combos · every category" for the top 3 of each. `player` opens the page that player is on with their row highlighted. |
| `/submissions [player] [on] [status] [run]` | Runs, newest first. `on` takes a trial or a combo category, and that choice also picks trial runs or combos. With no `on`, the card has **Trial runs / Combos** tabs. `run` opens one submission: its autocomplete lists the runs that match the other filters, and a pasted site link or id works too. When the filters match exactly one run, that run's card is shown instead of a list. |
| `/stats [player]` | A profile card (score, tier and progress, rank, WRs, PBs, runs, best combo, latest runs), with **PBs / Combos / Runs / Combo runs** tabs. Defaults to whoever ran it. |
| `/wrs [trial]` | Every trial's world record, or with `trial`, that trial's WR history: each record, its improvement, and how long it stood. |

Every `player` option takes a wasans name, an `@mention`, or `me`. It also
autocompletes: typing a name searches wasans players, and typing `@` searches
the server's members, so mentions still work from inside the autocomplete box.
Mentions are resolved through the account's linked Discord login, never by
guessing a name.

The `board` and `on` options list trials and combo categories together. The
lists come from the site (`/v2/trials`, `/v2/combo-categories`), so new or
retired ones show up without a redeploy.

The buttons and menus under a reply respond only to whoever clicked:

- Paging and tab buttons only work for the person who ran the command.
- **Open a run…** menus show the picked run's card to the person who picked it.
- **Play video here** posts the run's video link, which Discord embeds as a
  player, again only for the clicker.
- **Open on wasans** / **Profile on wasans** link to the site.

## Card rendering

Cards are built as SVG and rasterised with [`@resvg/resvg-js`][resvg]. They
follow the site's "Timing board" design (`src/app/globals.css`): the same
palette, Saira Condensed for labels and titles, and IBM Plex Sans/Mono for
names and numbers. The fonts are bundled under `assets/fonts` (OFL), so
rendering looks the same everywhere, including the slim Docker image. Text is
measured from the fonts' real glyph widths (`src/render/metrics.js`), so long
names are cut off with an ellipsis instead of running into other columns.

To change how a card looks, edit its template in `src/render/templates/`. Each
template takes plain data and returns `{ svg, width }`.

## Speed

Commands defer straight away, then make as few round trips as they can:

- `src/wasansApi.js` keeps site responses for 30 seconds and shares in-flight
  requests. The site already caches these routes for about 60 seconds, so this
  doesn't make anything staler, and it makes paging, tab switches and
  autocomplete mostly free.
- Long lists load one page at a time, so a command answers as soon as its
  first ten rows are ready. Paging goes all the way down a board instead of
  stopping at 100 rows.
- Avatars, run previews, Discord account links, and the trial and category
  lists are cached for a few minutes.
- Rendered pages are cached too (`src/render/cache.js`, 64 entries, LRU).

There is no per-user rate limit on cards any more. The
`CARD_RATE_LIMIT_USER*` variables are no longer read.

The trial score formula and its thresholds (`src/scoring.js`) are copied from
the site, because the Pi only checks out `bot/`. When a trial is added or
rebalanced in `src/lib/trials.ts`, update them here too. A trial missing from
the table shows no score rather than a wrong one.

[resvg]: https://github.com/yisibl/resvg-js

# Admin text commands

Only usable by the configured `ALLOWED_USER_ID`, as plain messages prefixed
with `!`:

- `!status` — replies "Online".
- `!say <text>` — sends `<text>` in the channel (replying to the referenced
  message if the command itself was a reply), then deletes the command message.
- `!delete` — deletes the referenced message, then deletes the command message.
