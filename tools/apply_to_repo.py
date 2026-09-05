#!/usr/bin/env python3
"""Install the live-update client/deployment layer into hukkle-hub/hukkle.

Creates a timestamped rollback bundle inside the target repository, copies the
v38 UI/client update files, patches api/index.ts, and validates the result.
"""
from __future__ import annotations
import argparse, hashlib, json, shutil, subprocess, sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    "index.html", "version.json", "build-info.json", "manifest.webmanifest",
    "icon.svg", "update-client.js", "server-api.js", "sw.js", ".nojekyll",
    "admin/update-status.html",
    ".github/workflows/deploy-pages.yml",
    ".github/workflows/deploy-supabase.yml",
    "tools/bump_version.py",
    "tools/patch_api_update.py",
    "README_서버업데이트.md",
    "api_patch/README.md",
]
DIRS = ["assets"]
DOC_FILES = [
    "docs/live-update/SERVER_UPDATE_SYSTEM.md",
    "docs/live-update/README_설치배포.md",
    "docs/live-update/RELEASE_CHECKLIST.md",
]


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def copy_item(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        if dst.exists(): shutil.rmtree(dst)
        shutil.copytree(src, dst)
    else:
        shutil.copy2(src, dst)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("repo", type=Path)
    args = ap.parse_args()
    repo = args.repo.expanduser().resolve()
    if not repo.is_dir() or not (repo / "api/index.ts").is_file():
        print("ERROR: target must be the hukkle repository containing api/index.ts", file=sys.stderr)
        return 2

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = repo / ".hy-backups" / f"server-update-v1-{stamp}"
    backup.mkdir(parents=True)
    manifest = {"created_at": stamp, "overwritten": [], "overwritten_dirs": [], "created": [], "directories": []}

    all_files = FILES + DOC_FILES
    for rel in all_files:
        src, dst = ROOT / rel, repo / rel
        if not src.exists():
            print(f"ERROR: package file missing: {src}", file=sys.stderr); return 3
        if dst.exists():
            copy_item(dst, backup / rel)
            manifest["overwritten"].append(rel)
        else:
            manifest["created"].append(rel)
        copy_item(src, dst)

    for rel in DIRS:
        src, dst = ROOT / rel, repo / rel
        if dst.exists():
            copy_item(dst, backup / rel)
            manifest["overwritten_dirs"].append(rel)
        else:
            manifest["created"].append(rel)
        manifest["directories"].append(rel)
        copy_item(src, dst)

    api = repo / "api/index.ts"
    copy_item(api, backup / "api/index.ts")
    if "api/index.ts" not in manifest["overwritten"]:
        manifest["overwritten"].append("api/index.ts")
    patcher = ROOT / "tools/patch_api_update.py"
    result = subprocess.run([sys.executable, str(patcher), str(api), "--no-backup"])
    if result.returncode:
        print("API patch failed; restoring original", file=sys.stderr)
        copy_item(backup / "api/index.ts", api)
        return result.returncode

    manifest["sha256"] = {rel: sha(repo / rel) for rel in all_files if (repo / rel).is_file()}
    manifest["sha256"]["api/index.ts"] = sha(api)
    (backup / "install-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf-8")
    (repo / ".hy-live-update-installed").write_text(str(backup.relative_to(repo)) + "\n", "utf-8")

    checks = [
        repo / "index.html", repo / "version.json", repo / "update-client.js",
        repo / "sw.js", repo / "admin/update-status.html", repo / "api/index.ts",
    ]
    for p in checks:
        if not p.is_file() or p.stat().st_size == 0:
            print(f"ERROR: validation failed: {p}", file=sys.stderr); return 4
    api_text = api.read_text("utf-8")
    if "HY_UPDATE_ROUTES_BEGIN" not in api_text or "x-client-version" not in api_text:
        print("ERROR: API update patch missing after installation", file=sys.stderr); return 5

    print("흥양기 서버 주도 업데이트 계층 설치 완료")
    print(f"rollback bundle: {backup}")
    print("next: commit and push main; then enable GitHub Pages Actions and Supabase secrets")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
