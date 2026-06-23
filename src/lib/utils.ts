import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generate an 8-character base64 ID (replaces UUID)
 * Uses 6 random bytes encoded as base64, trimmed to 8 characters
 */
export function generateShortId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return btoa(String.fromCharCode(...bytes)).slice(0, 8)
}
