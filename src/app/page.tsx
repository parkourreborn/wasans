export default function HomePage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h1>wasans api</h1>
      <p>Use /api/v1 for production endpoints.</p>
      <ul>
        <li>/api/v1/health</li>
        <li>/api/v1/players</li>
        <li>/api/v1/submissions</li>
        <li>/api/v1/leaderboards/overall</li>
        <li>/api/v1/records/world</li>
      </ul>
    </main>
  )
}
