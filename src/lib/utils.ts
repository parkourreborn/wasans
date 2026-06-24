import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generate an 11-character alphanumeric ID similar to YouTube video IDs.
 * Uses only A-Z, a-z, and 0-9 so no special URL characters are produced.
 */
export function generateShortId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  const bytes = crypto.getRandomValues(new Uint8Array(11))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")
}
