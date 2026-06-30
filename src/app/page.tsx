export default function HomePage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h1>wasans api</h1>
      <p>Use /v1 for production endpoints.</p>
      <ul>
        <li>/v1/health</li>
        <li>/v1/players</li>
        <li>/v1/submissions</li>
        <li>/v1/leaderboards/overall</li>
        <li>/v1/records/world</li>
      </ul>
    </main>
  )
}
