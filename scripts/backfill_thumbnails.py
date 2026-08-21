#!/usr/bin/env python3
"""
One-time backfill: generates a JPEG poster frame for every existing
submission video in R2 (scores/{uuid}.mp4 -> scores/{uuid}-preview.jpg),
so score-video-preview.tsx can show an <img> instead of loading the whole
video just to paint one frame. New submissions get their preview generated
client-side at upload time instead (see submissions/new).

Windows-native rewrite of scripts/backfill-thumbnails.sh -- runs directly
under a normal `python` install, no Git Bash / WSL required. This also
fixes the intermittent "wrangler said the download succeeded but ffmpeg
can't find the file" bug the bash version hit on Windows: that script's
temp directory came from `mktemp -d` under Git Bash, which auto-translates
POSIX-looking paths to Windows ones before handing them to wrangler.exe --
a translation that occasionally misfired. tempfile.TemporaryDirectory()
here returns a real Windows path directly, so there's no translation layer
in between wrangler and ffmpeg to go wrong.

Requires: `wrangler` (already a project devDependency, run via `npx`)
authenticated via `wrangler login`, and `ffmpeg` on PATH.

Usage: run from the repo root:
    python scripts/backfill_thumbnails.py
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

BUCKET = "wasans"
IS_WINDOWS = os.name == "nt"


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    # shell=True on Windows is what lets a plain ["npx", ...] resolve to
    # npx.cmd correctly; list2cmdline still quotes each argument properly.
    return subprocess.run(
        cmd,
        shell=IS_WINDOWS,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def fetch_submission_uuids() -> list[str]:
    print("Fetching submission uuids from D1...")
    result = run([
        "npx", "wrangler", "d1", "execute", "wasans", "--remote", "--json",
        "--command=SELECT uuid FROM submissions ORDER BY date DESC",
    ])

    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr, file=sys.stderr)
        sys.exit("Failed to fetch submissions from D1")

    data = json.loads(result.stdout)
    return [row["uuid"] for row in data[0].get("results", [])]


def r2_get(remote_key: str, local_path: Path) -> bool:
    result = run([
        "npx", "wrangler", "r2", "object", "get", f"{BUCKET}/{remote_key}",
        f"--file={local_path}", "--remote",
    ])
    return result.returncode == 0 and local_path.exists() and local_path.stat().st_size > 0


def r2_put(remote_key: str, local_path: Path, content_type: str) -> bool:
    result = run([
        "npx", "wrangler", "r2", "object", "put", f"{BUCKET}/{remote_key}",
        f"--file={local_path}", f"--content-type={content_type}", "--remote",
    ])
    return result.returncode == 0


def extract_frame(video_path: Path, preview_path: Path) -> bool:
    # Try grabbing the frame at the 1s mark first; videos shorter than that
    # fail there, so fall back to grabbing the very first frame instead.
    for seek_args in (["-ss", "00:00:01"], []):
        result = subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", *seek_args, "-i", str(video_path),
             "-frames:v", "1", "-q:v", "3", str(preview_path)],
            shell=IS_WINDOWS,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0 and preview_path.exists() and preview_path.stat().st_size > 0:
            return True

    return False


def main() -> None:
    if shutil.which("ffmpeg") is None:
        sys.exit(
            "ffmpeg is not on PATH -- install it first "
            "(e.g. `winget install ffmpeg` or `choco install ffmpeg`)"
        )

    uuids = fetch_submission_uuids()
    total = len(uuids)
    generated = 0
    skipped = 0

    print(f"Found {total} submissions. Generating missing preview thumbnails...")

    with tempfile.TemporaryDirectory(prefix="wasans-thumbnails-") as tmp_dir:
        tmp_path = Path(tmp_dir)

        for index, uuid in enumerate(uuids, start=1):
            print(f"[{index}/{total}] {uuid}")
            video_path = tmp_path / f"{uuid}.mp4"
            preview_path = tmp_path / f"{uuid}-preview.jpg"

            if r2_get(f"scores/{uuid}-preview.jpg", preview_path):
                print("  already has a preview, skipping")
                skipped += 1
                preview_path.unlink(missing_ok=True)
                continue

            if not r2_get(f"scores/{uuid}.mp4", video_path):
                print("  no video found, skipping")
                skipped += 1
                continue

            if not extract_frame(video_path, preview_path):
                print("  ffmpeg failed, skipping")
                skipped += 1
                video_path.unlink(missing_ok=True)
                continue

            if r2_put(f"scores/{uuid}-preview.jpg", preview_path, "image/jpeg"):
                generated += 1
            else:
                print("  failed to upload preview, skipping")
                skipped += 1

            video_path.unlink(missing_ok=True)
            preview_path.unlink(missing_ok=True)

    print()
    print(f"Done. Generated: {generated}, skipped: {skipped}, total: {total}")


if __name__ == "__main__":
    main()
