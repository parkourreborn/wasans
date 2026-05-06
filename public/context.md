# Wasans Project Context

## Overview

Wasans is a Cloudflare D1-backed Next.js application for tracking speedrun-style submissions, approvals, world records, player personal bests, and leaderboard scoring.

It is built as a single-page/site using Next.js 16 with the `@opennextjs/cloudflare` runtime. The UI is React-based with shadcn-style components and Tailwind CSS support.

## Primary Purpose

The core purpose of Wasans is to let players:

- register and sign in through session or Discord OAuth
- submit trial runs with proof video or Medal links
- have submissions reviewed by moderators
- automatically update approved personal bests and world records
- compute player scores from approved times compared to world record times
- view player profiles, leaderboard standings, and compare players side by side

## Technology Stack

- `next` v16.2.4
- `react` v19.2.4
- `@opennextjs/cloudflare` for Cloudflare runtime bindings
- `wrangler` for build and deployment
- `tailwindcss` and `shadcn-ui` for styling
- `Cloudflare D1` as the SQLite-compatible database
- optional `R2` bucket for uploaded submission videos

## Database Schema

The SQL schema is defined in `schema.sql`. Key tables are:

- `players`
  - stores players with `uuid`, `player_id`, `player_name`, `date_joined`, permission level, and computed `score`
- `auth_sessions`
  - tracks active session tokens and expires times
- `oauth_accounts`
  - stores Discord OAuth account links to players
- `trials`
  - defines a fixed set of trial names used in submissions
- `submissions`
  - records runs with `uuid`, `player_uuid`, `trial_name`, `player_name`, `time`, `date`, `moderator_note`, and approval `state`
- `wrs`
  - caches current world record submission per trial for fast lookup
- `pbs`
  - caches each player’s approved personal best per trial

The schema uses foreign keys and constraints to enforce relationships between players, submissions, trials, WRs, and PBs.

## Core Domain Concepts

### Trials
Trials are the game categories or levels that users submit times for. The `trials` table contains the canonical list of valid trial names.

### Submissions
A submission can be in one of three states:

- `pending`
- `approved`
- `denied`

Approved submissions are eligible for world record and personal best calculations.

### World Records (WRs)
The `wrs` cache table stores the current best approved submission for each trial. WR calculations are based on the fastest approved time, with tie-breaking by date and UUID.

### Personal Bests (PBs)
The `pbs` table stores the best approved submission for each player/trial combination. This cache is used for efficient player score computation.

### Player Score
Player score is computed from approved PBs against current WRs. The algorithm is implemented in `src/lib/calc-score.ts`, then applied inside `src/lib/server/player-scores.ts`.

## Application Architecture

### Frontend Pages
The main frontend pages live under `src/app/(main)/`:

- `page.tsx` — home or dashboard entry page
- `calculator/page.tsx` — player score calculator and approved times view
- `compare/page.tsx` — compare two players side by side using their approved times
- `leaderboard/page.tsx` — leaderboard ranking of players by score
- `players/[uuid]/page.tsx` — individual player profile and approved times
- `submissions/page.tsx` — submission browser with filters and infinite scroll
- `submissions/new/page.tsx` — new submission creation flow
- `submissions/[uuid]/page.tsx` — moderation and submission detail page
- `wrs/page.tsx` — world records page
- `information/page.tsx` — informational content
- `rules/page.tsx` — rules and guidance

### API Routes
API routes are under `src/app/api/` and include:

- `api/submissions/route.ts`
  - GET lists submissions with pagination and optional state filtering
  - POST creates new submissions (with file uploads or Medal links)
- `api/submissions/[uuid]/route.ts`
  - GET loads a single submission
  - PATCH updates submission state and triggers approval workflows
  - DELETE removes a submission and refreshes related caches
- `api/submissions/player/[uuid]/route.ts`
  - GET returns submissions for a specific player, with optional `approvedOnly=true`
- `api/players/route.ts`
  - GET returns all players sorted by score and name
- `api/players/[uuid]/route.ts`
  - GET returns a single player by UUID
- `api/wrs/route.ts` and other supporting routes may exist for WR or leaderboard data
- `api/auth/*` — Discord OAuth and authenticated user endpoints

### Server Helpers
Shared server-side logic is located under `src/lib/server/`:

- `auth.ts`
  - resolves the requesting user from cookies, headers, Discord OAuth link, and session state
  - determines moderation privileges
- `player-scores.ts`
  - computes and refreshes player score based on PBs and WRs
  - supports full recomputation and per-player refreshes
- `pbs.ts`
  - keeps the `pbs` cache table consistent when approval state changes
  - refreshes either one player/trial PB or all player PBs
- `wrs.ts`
  - keeps the `wrs` cache table current after approvals or deletions
- `notifications.ts`
  - queues webhook-style notifications for approved high scores or world records

## Important Behavior

### Approval Workflow
When a moderator marks a submission as `approved`:

1. `submissions` row state is updated
2. the player’s PB for that trial is refreshed in `pbs`
3. world record caches are refreshed in `wrs`
4. the player score is refreshed using `refreshPlayerScore`
5. Discord/user notifications may be queued
6. if a WR changed, all player scores are recomputed to keep ranking consistent

### Score Computation
Scores are derived from comparing a player’s best approved time to the WR time for each trial.

- If a player has no approved PB for a trial, that trial is ignored in the score total.
- The final score is averaged across the total number of trial rows defined in `trials`.
- The result is stored in the `players.score` field.

### Media and Proof Handling
Submissions may use either:

- an uploaded video file stored in Cloudflare R2 under `scores/<uuid>.mp4`
- a Medal link that is fetched and proxied into the R2 bucket

The backend validates allowed proof hosts and rejects unsupported formats.

### Caching and Performance
The app includes simple cache headers for API responses such as player lists and submissions. WR and PB caches are stored in dedicated database tables rather than recomputing from all approved submissions on every request.

## UI Conventions

- The top-level layout uses `AppSidebar` and `SidebarProvider`.
- Pages under `(main)` are rendered inside a shared navigation layout.
- Many routes use client-side fetches to display approved-only data, handle moderation actions, and update lists without full page reloads.

## Key Files and Paths

- `public/` — static assets and the new context document
- `src/app/` — application routes and pages
- `src/lib/` — shared helpers and app logic
- `src/components/` — reusable UI components and custom widgets
- `schema.sql` — database schema and initial trial definitions
- `package.json` — dependencies, scripts, and Cloudflare deployment commands

## Useful Notes for AI Assistants

- The system is heavily centered on submission approval state. If you modify approval logic, ensure PBs and WRs are refreshed in the correct order.
- `players.score` depends on both `pbs` and `wrs`; if either cache is stale, leaderboard and profile values can become inconsistent.
- The `auth` helper supports a fallback header `x-wasans-player-uuid` for temporary local auth during API testing.
- The project integrates Cloudflare-specific runtime features, so pay attention to `getCloudflareContext({ async: true })` in API route handlers.
- When editing page-level routing, the file paths under `src/app/(main)/...` are route segments in Next.js.

## Recommended Entry Points

- `src/app/(main)/submissions/new/page.tsx` — submission creation flow
- `src/app/(main)/submissions/[uuid]/page.tsx` — moderation and state updates
- `src/app/(main)/players/[uuid]/page.tsx` — player profile and approved times
- `src/lib/server/player-scores.ts` — score recomputation logic
- `src/lib/server/wrs.ts` and `src/lib/server/pbs.ts` — cache refresh logic

## Deployment

Standard commands are defined in `package.json`:

- `npm run dev` — run locally
- `npm run build` — build Next.js app
- `npm run preview` — build and preview with Cloudflare tooling
- `npm run deploy` — build and deploy via Cloudflare

This document should serve as a quick reference for the entire Wasans system, its major data flows, and the places where request handling and score logic live.