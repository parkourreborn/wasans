// Shared by the server (error messages) and the client (notices, the
// settings modal). Free of `server-only` on purpose.

export const robloxLinkRequiredMessage =
  "Link a Roblox account before submitting, so moderators can check the account in your video is yours. You can link one in Settings."

// Dispatched on window to open the settings modal from anywhere, e.g. the
// "link a Roblox account" notice on the submit pages.
export const OPEN_SETTINGS_EVENT = "wasans:open-settings"

export function openSettings() {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))
}
