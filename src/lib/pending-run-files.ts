"use client"

// Videos dropped somewhere other than the submit form (the Submissions list,
// the combo tab) are parked here, and the trial runs form picks them up when
// it mounts. Module state survives client-side navigation, which is all the
// hand-off needs; a full page load starts empty.

let pending: File[] = []

export function stashRunFiles(files: File[]) {
  pending = [...pending, ...files]
}

export function takeRunFiles(): File[] {
  const files = pending
  pending = []
  return files
}

// Whether a drag carries files (not text or a link being dragged around).
export function dragHasFiles(event: { dataTransfer: DataTransfer | null }) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files")
}
