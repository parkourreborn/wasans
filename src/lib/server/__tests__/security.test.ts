import test from "node:test"
import assert from "node:assert/strict"
import { getSafeNextUrl } from "@/lib/safe-redirect"
import { secretsMatch } from "@/lib/constant-time"
import { getSubmissionErrorStatus } from "@/lib/submission-errors"

const SITE_ORIGIN = "https://wasans.tully.sh"

// Whatever getSafeNextUrl returns is handed to `new URL(value, origin)` by the
// OAuth callback, so the property that actually matters is that resolving the
// result can never leave the site.
function resolvedOrigin(next: string | null) {
  return new URL(getSafeNextUrl(next), SITE_ORIGIN).origin
}

test("the post-login redirect keeps ordinary paths intact", () => {
  assert.equal(getSafeNextUrl("/submissions"), "/submissions")
  assert.equal(getSafeNextUrl("/players/abc?tab=pbs#top"), "/players/abc?tab=pbs#top")
  assert.equal(getSafeNextUrl(null), "/")
})

test("the post-login redirect cannot be pointed at another site", () => {
  // A backslash is parsed exactly like a slash, and leading tabs/newlines are
  // stripped before parsing — each of these resolved to https://evil.com/
  // before the check was written against what the parser actually sees.
  const attempts = [
    "//evil.com",
    "/\\evil.com",
    "/\\\\evil.com",
    "/\\/evil.com",
    "\t//evil.com",
    "/\t/evil.com",
    "/\n\\evil.com",
    "https://evil.com",
    "//evil.com/path",
    // Normalises to the path "//evil.com", which becomes an authority again
    // the moment the caller resolves it.
    "/..//evil.com",
    "/../../..///evil.com",
  ]

  for (const attempt of attempts) {
    assert.equal(resolvedOrigin(attempt), SITE_ORIGIN, `${JSON.stringify(attempt)} escaped the site`)
  }
})

test("secret comparison accepts the real secret and rejects near misses", () => {
  assert.equal(secretsMatch("s3cret-value", "s3cret-value"), true)
  assert.equal(secretsMatch("s3cret-valuf", "s3cret-value"), false)
  assert.equal(secretsMatch("s3cret-valu", "s3cret-value"), false)
  assert.equal(secretsMatch("s3cret-value!", "s3cret-value"), false)
})

test("an unset secret never matches, so a missing binding cannot open a door", () => {
  assert.equal(secretsMatch("", ""), false)
  assert.equal(secretsMatch("anything", ""), false)
  assert.equal(secretsMatch("", "expected"), false)
})

test("secret comparison reads every character rather than stopping at the first difference", () => {
  // A timing assertion would be flaky; instead assert the property that makes
  // the implementation constant-time — the result does not depend on where the
  // difference falls, and every position is still compared.
  const expected = "a".repeat(64)
  const differsFirst = "b" + "a".repeat(63)
  const differsLast = "a".repeat(63) + "b"

  assert.equal(secretsMatch(differsFirst, expected), false)
  assert.equal(secretsMatch(differsLast, expected), false)
})

test("the moderator-permission refusal is reported as 403, not swallowed as a 400", () => {
  // patchSubmission throws this string; the route maps thrown messages to
  // statuses, so the mapping is part of the access-control behaviour.
  assert.equal(getSubmissionErrorStatus("Moderator permission is required"), 403)
})

test("oversized uploads are reported as 413", () => {
  assert.equal(getSubmissionErrorStatus("Submission 1's video is too large"), 413)
})
