// Kept free of `server-only` (like src/lib/auth-refresh.ts) so the redirect
// rules can be unit-tested under `node --test`. It touches nothing but the
// URL parser.

// The post-login destination. Anything that is not plainly a path on this
// site becomes "/" — a redirect out of the login flow to an attacker's page
// is a ready-made phishing link that starts on the real domain.
//
// Rejecting a leading "//" is not enough on its own: the URL parser treats a
// backslash in a special scheme exactly like a forward slash, so "/\evil.com"
// resolves to https://evil.com/, and it strips leading tabs and newlines
// before parsing, so "/\t/evil.com" does too. The check therefore works from
// what the parser will actually see.
export function getSafeNextUrl(value: string | null) {
  if (typeof value !== "string") {
    return "/"
  }

  // Tab, LF and CR are removed by the URL parser wherever they appear, so
  // strip them before deciding rather than after.
  const candidate = value.replace(/[\t\n\r]/g, "")

  if (!candidate.startsWith("/")) {
    return "/"
  }

  // Both "//host" and "/\host" (and "/\\host", "//\host", ...) are
  // authority-relative once parsed, i.e. off-site.
  if (/^[/\\]{2}/.test(candidate)) {
    return "/"
  }

  // Belt and braces: resolve it and require the result to have stayed on the
  // origin it was resolved against.
  try {
    const base = "https://wasans.invalid"
    const resolved = new URL(candidate, base)
    if (resolved.origin !== base) {
      return "/"
    }

    // The pathname can still come back authority-relative — "/..//evil.com"
    // normalises to the path "//evil.com", which becomes https://evil.com/
    // the moment the caller resolves it against the site origin. Collapse
    // the leading slashes so what we return can only ever be one path.
    const pathname = resolved.pathname.replace(/^\/+/, "/")

    return pathname + resolved.search + resolved.hash
  } catch {
    return "/"
  }
}
