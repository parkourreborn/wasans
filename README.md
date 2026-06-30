# wasans API

This repository now runs as an API-first backend with a consolidated, production-oriented route surface.

## Canonical API surface

All new clients should use `/api/v1`:

- `GET /api/v1/health`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/discord/start`
- `GET /api/v1/auth/discord/callback`
- `GET /api/v1/players?page=&limit=&search=`
- `GET /api/v1/players/:uuid?include=pbs,recent_submissions&submissions_limit=`
- `GET /api/v1/submissions?page=&limit=&state=&player_uuid=&search=`
- `POST /api/v1/submissions`
- `GET /api/v1/submissions/:uuid`
- `PATCH /api/v1/submissions/:uuid`
- `DELETE /api/v1/submissions/:uuid`
- `GET /api/v1/leaderboards/overall?page=&limit=`
- `GET /api/v1/leaderboards/trials/:trial?page=&limit=`
- `GET /api/v1/records/world`
- `GET /api/v1/records/world/:trial`
- `GET /api/v1/admin/audit-logs`
- `POST /api/v1/admin/maintenance/deduplicate`

## Removed routes

The legacy non-v1 route surface has been removed.

Previously available split routes:

- `/api/pbs/player/:uuid`
- `/api/submissions/player/:uuid`
- `/bot/:uuid`

Use consolidated routes instead:

- `/api/v1/players/:uuid?include=pbs`
- `/api/v1/submissions?player_uuid=:uuid`
- `/api/v1/submissions/:uuid` with bot API auth headers

## Development

Install dependencies:

```bash
npm install
```

Run dev server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Deploy:

```bash
npm run deploy
```

## Database notes

`schema.sql` includes additional indexes for production read/write patterns on `submissions`, `pbs`, `auth_sessions`, and `oauth_accounts`.