export async function GET() {
  return Response.json(
    {
      error: "Discord OAuth is not configured yet",
      next: "Add DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, and a callback route that creates auth_sessions rows.",
    },
    { status: 501 }
  )
}
