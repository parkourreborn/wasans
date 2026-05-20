# wasans-bot

A lightweight Discord bot that exposes a simple HTTP API for managing user nicknames, roles, channel messages, threads, and direct messages.

## Routes

The bot exposes six POST routes. All requests must include an Authorization header and a JSON body.

### 1. `POST /set-nick`

Update the nickname of a guild member.

Request headers:
- `Authorization: Bearer <API_SECRET>`
- `Content-Type: application/json`

Request body:
```json
{
  "user_id": "123456789012345678",
  "nick": "New Nick",
  "guild_id": "987654321098765432"
}
```

Behavior:
- If `user_id` is missing, returns `400`.
- If `nick` is missing, returns `400`.
- Uses `guild_id` from the body, or the default `GUILD_ID` environment variable if not provided.
- Fetches the member in the guild and sets the nickname.
- Returns `200` on success with the updated `user_id` and `nick`.

### 2. `POST /manage-role`

Add or remove a role from a guild member.

Request headers:
- `Authorization: Bearer <API_SECRET>`
- `Content-Type: application/json`

Request body:
```json
{
  "user_id": "123456789012345678",
  "role_id": "234567890123456789",
  "action": "add",
  "guild_id": "987654321098765432"
}
```

Behavior:
- If `user_id` is missing, returns `400`.
- If `role_id` is missing, returns `400`.
- If `action` is missing or not `add` / `remove`, returns `400`.
- Uses `guild_id` from the body, or the default `GUILD_ID` environment variable if not provided.
- Fetches the member and the role, then adds or removes the role.
- Returns `200` on success with the action and affected IDs.

### 3. `POST /send-message`

Send a message to a text channel in the given guild.

Request headers:
- `Authorization: Bearer <API_SECRET>`
- `Content-Type: application/json`

Request body:
```json
{
  "channel_id": "345678901234567890",
  "content": "Hello, world!",
  "guild_id": "987654321098765432"
}
```

Behavior:
- If `channel_id` is missing, returns `400`.
- If `content` is missing, returns `400`.
- Uses `guild_id` from the body, or the default `GUILD_ID` environment variable if not provided.
- Fetches the channel and verifies it belongs to the guild.
- Sends the message and returns `200` with message metadata.

### 4. `POST /create-thread`

Create a new thread in a text channel and post the initial message.

Request headers:
- `Authorization: Bearer <API_SECRET>`
- `Content-Type: application/json`

Request body:
```json
{
  "channel_id": "345678901234567890",
  "title": "Thread title",
  "content": "This is the first message in the thread.",
  "guild_id": "987654321098765432"
}
```

Behavior:
- If `channel_id` is missing, returns `400`.
- If `title` is missing, returns `400`.
- If `content` is missing, returns `400`.
- Uses `guild_id` from the body, or the default `GUILD_ID` environment variable if not provided.
- Fetches the channel and verifies it belongs to the guild.
- Creates the thread and sends the initial message.
- Returns `200` with thread metadata.

### 5. `POST /delete-thread`

Delete an existing thread in a text channel.

Request headers:
- `Authorization: Bearer <API_SECRET>`
- `Content-Type: application/json`

Request body:
```json
{
  "channel_id": "345678901234567890",
  "thread_id": "456789012345678901",
  "guild_id": "987654321098765432"
}
```

Behavior:
- If `channel_id` is missing, returns `400`.
- If `thread_id` is missing, returns `400`.
- Uses `guild_id` from the body, or the default `GUILD_ID` environment variable if not provided.
- Fetches the channel and verifies it belongs to the guild.
- Deletes the thread and returns `200` on success.

### 6. `POST /send-dm`

Send a direct message to a user by Discord ID.

Request headers:
- `Authorization: Bearer <API_SECRET>`
- `Content-Type: application/json`

Request body:
```json
{
  "user_id": "123456789012345678",
  "content": "Hello from the bot!"
}
```

Behavior:
- If `user_id` is missing, returns `400`.
- If `content` is missing, returns `400`.
- Fetches the user by ID and sends a DM.
- Returns `200` on success with message metadata.
- Returns `404` if the user is unknown.

## Authentication

All requests require a bearer token header:
- `Authorization: Bearer <API_SECRET>`

If the header is missing or invalid, the bot returns `401 Unauthorized`.

## Environment Variables

Set these in your environment or in a `.env` file when using Docker:
- `DISCORD_TOKEN` - the bot token for Discord login.
- `API_SECRET` - secret used to authorize HTTP requests.
- `GUILD_ID` - default guild ID for requests that omit `guild_id`.
- `PORT` - optional port to listen on (default `4500`).

## Example cURL calls

Set nickname:
```bash
curl -X POST http://localhost:4500/set-nick \
  -H "Authorization: Bearer $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"1234567890","nick":"NewNick","guild_id":"9876543210"}'
```

Manage role:
```bash
curl -X POST http://localhost:4500/manage-role \
  -H "Authorization: Bearer $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"1234567890","role_id":"2345678901","action":"add","guild_id":"9876543210"}'
```

Send message:
```bash
curl -X POST http://localhost:4500/send-message \
  -H "Authorization: Bearer $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"channel_id":"345678901234567890","content":"Hello, world!","guild_id":"987654321098765432"}'
```

Create thread:
```bash
curl -X POST http://localhost:4500/create-thread \
  -H "Authorization: Bearer $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"channel_id":"345678901234567890","title":"Thread title","content":"This is the first message in the thread.","guild_id":"987654321098765432"}'
```

Delete thread:
```bash
curl -X POST http://localhost:4500/delete-thread \
  -H "Authorization: Bearer $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"channel_id":"345678901234567890","thread_id":"456789012345678901","guild_id":"987654321098765432"}'
```

Send DM:
```bash
curl -X POST http://localhost:4500/send-dm \
  -H "Authorization: Bearer $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"123456789012345678","content":"Hello from the bot!"}'
```

## Notes

- Only POST requests are supported; other methods return `405 Method Not Allowed`.
- The bot starts the HTTP server only after it is fully logged in to Discord.


