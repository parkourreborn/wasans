# wasans API

This repository now runs as an API-first backend with a consolidated, production-oriented route surface.

## Canonical API surface

All new clients should use `/v1`:

- `GET /v1/health`
- `GET /v1/auth/me`
- `GET /v1/auth/discord/start`
- `GET /v1/auth/discord/callback`
- `GET /v1/players?page=&limit=&search=`
- `GET /v1/players/:uuid?include=pbs,recent_submissions&submissions_limit=`
- `GET /v1/submissions?page=&limit=&state=&player_uuid=&search=`
- `POST /v1/submissions`
- `GET /v1/submissions/:uuid`
- `PATCH /v1/submissions/:uuid`
- `DELETE /v1/submissions/:uuid`
- `GET /v1/leaderboards/overall?page=&limit=`
- `GET /v1/leaderboards/trials/:trial?page=&limit=`
- `GET /v1/records/world`
- `GET /v1/records/world/:trial`
- `GET /v1/admin/audit-logs`
- `POST /v1/admin/maintenance/deduplicate`

## Removed routes

The legacy non-v1 route surface has been removed.

Previously available split routes:

- `/api/pbs/player/:uuid`
- `/api/submissions/player/:uuid`
- `/bot/:uuid`

Use consolidated routes instead:

- `/v1/players/:uuid?include=pbs`
- `/v1/submissions?player_uuid=:uuid`
- `/v1/submissions/:uuid` with bot API auth headers
