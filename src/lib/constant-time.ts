// Kept free of `server-only` so it can be unit-tested under `node --test`;
// it is pure arithmetic over two strings.

// Compares two secrets without leaking, through how long the comparison
// takes, how many leading characters matched. `===` on strings returns as
// soon as it finds a difference, so repeated guesses against it can recover
// a secret one character at a time. Used for the bot API key and the cron
// secret, which are the two shared secrets a caller can present directly.
//
// The length check is not itself constant-time and does not need to be: the
// length of a secret is not the secret.
export function secretsMatch(provided: string, expected: string) {
  if (!provided || !expected || provided.length !== expected.length) {
    return false
  }

  let difference = 0
  for (let index = 0; index < provided.length; index++) {
    difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index)
  }

  return difference === 0
}
