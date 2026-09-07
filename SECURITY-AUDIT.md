# Security audit — wasans

Scope: every route under `src/app/v2`, every page under `src/app/(main)`, the
middleware, all server services and repositories, the D1 schema, R2 usage, and
the client-side auth handling. Reviewed 2026-09-07 against commit `669c79d`.

Fixes for items 1–10 are in this branch. Items 11–18 are left as-is and need a
decision — several are trade-offs rather than defects, and two would break
integrations if changed blind.

---

## 1. CRITICAL — any logged-in player could act as a moderator

`resolveModeratorUser` (`src/lib/server/services/moderation-service.ts`) had
three exits. For a signed-in player who is *not* a moderator and presents no
bot API key, it returned:

```ts
return { user: sessionUser, error: null, debugInfo: "Not a bot API request" }
```

Its only caller, `PATCH /v2/submissions/[uuid]`, gated on:

```ts
if (moderatorLookup.error || !moderatorLookup.user) { return 403 }
```

A permission-0 member is a non-null `user` with a null `error`, so the gate
passed. `patchSubmission` — the single function every moderation action funnels
through — then checked nothing itself, trusting `context.user`.

**Impact.** Any account that could log in with Discord could:

- approve or deny any submission, including its own;
- rewrite the `time` on any submission to any positive value, which flows
  straight into `refreshWorldRecords` and `refreshPlayerScore` — i.e. fabricate
  world records and rewrite the leaderboard;
- overwrite any submission's moderator note;
- have all of it written into `audit_logs` under their own name, and pushed to
  Discord by the bot notification path.

`DELETE` was not affected — `deleteSubmission` does its own ownership check.
Every route under `/v2/admin` was correctly gated and was not affected.

**Fixed.** The lookup now returns a denial; `patchSubmission` requires
`canModerate(user)`; the route re-checks after the lookup. Session moderators
and the Discord bot (API key + `discordId`) are unaffected.

---

## 2. HIGH — Discord OAuth tokens stored in plaintext, and never used

`oauth_accounts.access_token` and `.refresh_token` were written on every login
and **never read anywhere in the codebase**. The only thing the app needed them
for was the single `/users/@me` call during login, which has already completed
by the time the row is written.

**Impact.** Any disclosure of that one table — a leaked D1 credential, a
backup, a SQL-injection bug in future code, an over-broad admin query — handed
out live Discord access tokens plus long-lived refresh tokens for every player
who had ever signed in. That is a much worse outcome than leaking this app's
own data, because the tokens are usable against a third party.

**Fixed.** The columns are no longer written; `migrations/0006` overwrites the
existing values, drops the three columns, and `VACUUM`s so the old bytes are
not left in freed pages. `schema.sql` no longer creates them.

---

## 3. HIGH — login IP history kept forever, and survived account deletion

`player_ips` stores a raw IP per player per address, with an index on
`ip_address` for reverse lookup (the alt-account check). `trackPlayerIp` is
called on every authenticated request, not just at login.

Two problems: there was no retention limit at all, and `deleteAccount` did not
touch the table — so a player who deleted their account left their full IP
history behind, attached to a `uuid` that still appears in `submissions`,
`pbs`, `wrs` and `audit_logs`.

**Fixed.** Deleted with the account (along with their refresh tokens), swept
after 180 days by the existing daily maintenance job, and the migration purges
what already-deleted accounts left behind.

---

## 4. MEDIUM — open redirect in the login flow

`getSafeNextUrl` rejected a leading `//` but nothing else, and its result is
handed to `new URL(value, origin)` by the OAuth callback. Three bypasses:

| `?next=` | resolved to |
| --- | --- |
| `/\evil.com` | `https://evil.com/` |
| `/⇥/evil.com` (leading tab) | `https://evil.com/` |
| `/..//evil.com` | path `//evil.com` → `https://evil.com/` |

The URL parser treats a backslash in a special scheme exactly like a forward
slash, strips tab/LF/CR before parsing, and normalises `..` segments — so the
check had to be written against what the parser actually sees, not the raw
string.

**Impact.** A phishing link that starts on the real `wasans.tully.sh`, runs a
genuine Discord login, and lands the player on an attacker's page — the most
credible-looking phishing you can build. Also leaks the `Referer`.

**Fixed** in `src/lib/safe-redirect.ts`, with the bypasses as test cases.

---

## 5. MEDIUM — no security headers on any response

There was no CSP, `X-Content-Type-Options`, `X-Frame-Options` /
`frame-ancestors`, `Strict-Transport-Security`, `Referrer-Policy` or
`Permissions-Policy` anywhere. The middleware only ran on `/v2/*` and only did
CORS.

**Fixed.** The middleware now covers all routes and sets `nosniff`,
`X-Frame-Options: DENY`, `frame-ancestors 'none'`,
`Referrer-Policy: strict-origin-when-cross-origin`, HSTS on HTTPS,
`Permissions-Policy`, `Cross-Origin-Opener-Policy`, and a **report-only** CSP.

Report-only is deliberate: the current policy needs `'unsafe-inline'` and
`'unsafe-eval'` for Next's hydration payload and the AdSense script, so
enforcing it as written would add little. Watch the violation reports, move
`script-src` onto nonces, then promote the header to
`Content-Security-Policy`.

---

## 6. MEDIUM — unauthenticated, unlimited writes into `audit_logs`

`POST /v2/system/error-logs` takes no auth (correct — client crashes often
happen while signed out) but had **no rate limit**, and accepts up to ~18KB of
attacker-controlled text per call (`stack` 8000 + `componentStack` 8000 +
`message` 1000 + several 1000-char fields).

**Impact.** Unbounded D1 growth and write cost from anonymous callers, plus the
ability to flood the moderator log view (`/logs`) with enough noise to bury a
real attack. **Fixed:** 20 reports/minute, dropped silently past that.

---

## 7. MEDIUM — timing-unsafe comparison of shared secrets

Both the bot API key (`isBotApiRequest`) and `CRON_SECRET` (two maintenance
routes) used `===`, which returns at the first differing character.

**Impact.** Character-at-a-time recovery of a secret is impractical over the
public internet but entirely practical for anything co-located, and these are
the two secrets a caller presents directly. **Fixed** with a constant-time
compare in `src/lib/constant-time.ts`.

---

## 8. MEDIUM — no server-side ceiling on uploads

`next.config.ts` allows a 200MB request body. The submission writer had no
size check on uploaded videos, no size check on Medal downloads (which are
buffered whole into memory via `arrayBuffer()`), and no cap on how many
submissions one request could contain — each of which triggers its own R2 write
and outbound fetch.

**Impact.** One account, within the 20-submissions/minute limit, could push
arbitrary volume into R2 and arbitrary outbound fetch load through the worker.
**Fixed:** 150MB per video, 2MB per preview, 32 submissions per request.

---

## 9. MEDIUM — `x-forwarded-for` trusted for the client IP

Both `getClientIp` implementations fell back from `cf-connecting-ip` to
`x-forwarded-for`, which is client-settable.

**Impact.** Rate-limit keys are `scope:actor:ip`, so a fresh XFF value per
request gives a fresh bucket — escaping every per-IP limit in the app,
including the login and refresh limits. It also let a caller write chosen
addresses into a player's IP history, poisoning the alt-account signal.
**Fixed:** only `cf-connecting-ip` is trusted (Cloudflare always sets it and a
client cannot forge it).

---

## 10. MEDIUM — information disclosure in the moderation 403

The `PATCH` 403 returned `details.debug` from the lookup, whose strings include
`Discord ID <id> is not linked to any account`, `Account is deactivated
(status: …)` and `permission level: N`. **Fixed:** the response says only
"Moderator permission is required"; the detail stays in the server log under
the request id.

---

# Open items — your call

## 11. The CORS allowlist makes the whole domain one security boundary

`src/middleware.ts` allows **any** subdomain of `tully.sh` or
`parkourreborn.com` (`hostname.endsWith("." + domain)`) with
`Access-Control-Allow-Credentials: true`.

This matters more than a normal CORS wildcard, because the session cookies are
`SameSite=Lax` — and SameSite works on the *registrable domain*. Every
`*.tully.sh` host is same-site as `wasans.tully.sh`, so cookies are sent on its
requests, and CORS then lets it read the responses.

The practical consequence: **an XSS or a subdomain takeover on any
`*.tully.sh` host is a full account takeover on wasans** — read and write the
whole API as the victim. And one of those hosts, `assets.wasans.tully.sh`,
serves user-uploaded files.

Today the content type on uploads is pinned to `video/mp4`, so a stored HTML
payload will not execute — that pin is load-bearing, not a detail.

Recommended: replace the suffix match with an exact-host allowlist, and move
user content to a domain outside `tully.sh` entirely. I did not change this
because narrowing the list could break the bot or another integration I cannot
see from here — tell me which hosts are real and I will pin them.

## 12. No Origin check on state-changing routes

CSRF is currently prevented only by `SameSite=Lax` on the cookies. That holds
for genuinely cross-site requests, and there are no state-changing `GET`s (all
writes are POST/PATCH/DELETE), so there is no live vulnerability. But it means
item 11 has nothing behind it, and a future cookie-attribute change removes the
only defence. Recommended: reject state-changing `/v2` requests whose `Origin`
is present and not allowlisted.

## 13. Submission videos are public, including pending and denied runs

`assets.wasans.tully.sh/scores/<submission uuid>.mp4` is public, and the
submission uuid is returned by the unauthenticated `GET /v2/submissions`. So
every proof video is retrievable by anyone, including runs that are still
pending or were denied. The ids themselves are strong (11 chars from a 62-char
alphabet, ~65 bits, from `crypto.getRandomValues`), so this is about the public
API handing them out, not guessing.

Probably intended for a speedrun leaderboard — flagging so it is a decision.
Related: uploads are not magic-byte validated, only extension/`file.type`
checked (both client-supplied), with the stored content type forced to
`video/mp4`.

## 14. Every player's Discord user ID is public

`player_id` (the Discord snowflake) is returned by `GET /v2/players`,
`/v2/submissions`, `/v2/players/[uuid]` and the leaderboards, alongside avatar
hash and discriminator. Needed for avatar URLs, but it also lets anyone
enumerate the Discord account behind every player name — a harassment vector,
and it is the input the bot API uses to identify moderators. Consider serving
avatars through a proxy and dropping the raw id from public responses.

## 15. Login-created player names skip the charset check

`validatePlayerName` (used for renames) enforces `^[A-Za-z0-9 _-]+$`.
`normalizeLoginPlayerName` (used at signup, from the Discord display name)
enforces only length. So a player name can contain `@everyone`, `<@&roleid>`,
backticks or markdown, and those names are interpolated into Discord message
content by `notifications.ts`.

React escapes them in the web UI, so this is not XSS. Whether it is a mention
injection depends on the bot at `bot.wasans.tully.sh`, which is outside this
repo — confirm it sends `allowed_mentions: { parse: [] }`.

## 16. Renames rewrite history by matching on display name

`changePlayerName` updates `audit_logs.actor_name` and
`submissions.moderator_username` with `WHERE … = <old name>`. Names are unique
among live players, but these columns are historical strings: after an account
is deleted its name is freed, and whoever takes it next will rewrite the
previous holder's audit entries on their first rename. Low impact, but it is
audit-trail integrity. Match on `actor_uuid` / a moderator uuid instead.

## 17. Moderation internals in the public submissions list

`GET /v2/submissions` selects `submissions.*`, which includes `moderator_note`
and `thread_id` (the Discord thread) for every submission, to anyone. Worth
confirming notes are written with a public audience in mind.

## 18. `JWT_SECRET` rotation signs everyone out

Unchanged from the previous session, restated for completeness: rotating or
diverging that secret invalidates every access token at once. The refresh path
recovers, so it is a stampede rather than a lockout — but it should be a
deliberate act.

---

# What was already right

Worth recording, because these are the things that most often go wrong:

- **No SQL injection.** Every query is parameterised. The dynamically built
  fragments (`audit-log-service`, `player-repository`, `submission-repository`,
  `updateSubmissionByUuid`) concatenate only fixed strings or `?` placeholders;
  user input always arrives via `.bind()`.
- **No XSS.** The one `dangerouslySetInnerHTML` is shadcn's chart component,
  fed by static developer config. Player names are charset-validated on rename
  and escaped by React everywhere.
- **Token handling.** Access tokens are HttpOnly + `SameSite=Lax` + `Secure`,
  never in `localStorage`. Refresh tokens are stored only as SHA-256 hashes,
  rotate on use, and have theft detection with family revocation.
- **Authorization reads the database, not the token.** The JWT carries a `perm`
  claim, but nothing anywhere authorizes off it — every gate re-loads the
  player row, so a demotion takes effect immediately rather than at the end of
  the 15-minute token life.
- **Admin surface.** All 14 `/v2/admin` routes call `requireV2Moderator` or
  `requireV2Owner` as their first statement. Permission changes validate the
  target tier and refuse to demote the last owner.
- **SSRF is constrained.** Proof links are restricted to `https:` +
  `medal.tv`/`www.medal.tv`, and the API URL is built from a fixed prefix, so
  the host cannot be redirected. (The second hop, the video URL that Medal
  returns, is only checked for `https:` — worth an allowlist if Medal's
  response is ever attacker-influenced.)
- **No secrets reach the client.** No `NEXT_PUBLIC_*` at all; `localStorage`
  holds only a player uuid and UI preferences.
- **Account deletion** properly anonymises names across every table that
  denormalises them, and now clears IPs, tokens and the OAuth link too.
- **Idempotency** on submission creation is scoped per actor and keyed on a
  request hash, so one player cannot replay or collide with another's.
