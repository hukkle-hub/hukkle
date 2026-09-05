#!/usr/bin/env python3
"""Bump release metadata before pushing a new client build."""
from __future__ import annotations
import argparse, json, re
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("version")
    p.add_argument("--content", default=None)
    p.add_argument("--note", action="append", default=[])
    p.add_argument("--force", action="store_true")
    p.add_argument("--maintenance", action="store_true")
    p.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    a = p.parse_args()
    if not re.fullmatch(r"\d+\.\d+\.\d+", a.version):
        raise SystemExit("version must be MAJOR.MINOR.PATCH")
    root = a.root.resolve()
    vp = root / "version.json"
    data = json.loads(vp.read_text("utf-8"))
    data["version"] = a.version
    data["content_version"] = a.content or datetime.now().strftime("%Y.%m.%d.1")
    data["published_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    data["force_update"] = bool(a.force)
    data["maintenance"] = bool(a.maintenance)
    if a.note:
        data["release_notes"] = a.note
    vp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", "utf-8")

    index = root / "index.html"
    text = index.read_text("utf-8")
    text, count = re.subn(r'(<meta name="hy-version" content=")[^"]+("\s*/?>)', rf'\g<1>{a.version}\2', text, count=1)
    if count != 1:
        raise SystemExit("hy-version meta not found")
    index.write_text(text, "utf-8")

    sw = root / "sw.js"
    st = sw.read_text("utf-8")
    st, count = re.subn(r"const APP_VERSION = '[^']+';", f"const APP_VERSION = '{a.version}';", st, count=1)
    if count != 1:
        raise SystemExit("APP_VERSION not found in sw.js")
    sw.write_text(st, "utf-8")
    print(f"release metadata updated to {a.version}")
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
