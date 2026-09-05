#!/usr/bin/env python3
"""흥양기 v37 안전 설치·롤백 도구.

기본 사용:
    python apply_v37_patch.py <repository_path>
    python apply_v37_patch.py --rollback <repository_path>
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

VERSION = "37.0.0"
MARKER = ".hy_v37_install.json"
PAYLOAD_DIR = Path(__file__).resolve().parent / "payload"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def atomic_copy(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.name + ".hy37.tmp")
    shutil.copy2(src, tmp)
    os.replace(tmp, dst)


def payload_files() -> list[Path]:
    if not PAYLOAD_DIR.is_dir():
        raise FileNotFoundError(f"payload 폴더를 찾을 수 없습니다: {PAYLOAD_DIR}")
    return sorted(p for p in PAYLOAD_DIR.rglob("*") if p.is_file())


def validate_repo(repo: Path) -> None:
    if not repo.exists() or not repo.is_dir():
        raise ValueError(f"대상 폴더가 존재하지 않습니다: {repo}")
    # Git 체크아웃이 아니어도 로컬 배포 폴더에는 설치할 수 있게 허용한다.
    if repo.resolve() in {Path("/").resolve(), Path.home().resolve()}:
        raise ValueError("루트 또는 사용자 홈 전체에는 설치할 수 없습니다.")


def validate_install(repo: Path) -> dict[str, Any]:
    required = [
        repo / "index.html",
        repo / "heungyanggi_v37_standalone.html",
        repo / "manifest.webmanifest",
        repo / "sw.js",
        repo / "icon.svg",
        repo / "assets/c075_base.webp",
        repo / "assets/c075_final.webp",
    ]
    missing = [str(p.relative_to(repo)) for p in required if not p.is_file()]
    if missing:
        raise RuntimeError("설치 파일 누락: " + ", ".join(missing))

    index = (repo / "index.html").read_text(encoding="utf-8")
    signatures = ["heungyanggi_v37_vertical_slice", "window.HY37", "낯금이", "금기 응시"]
    absent = [s for s in signatures if s not in index]
    if absent:
        raise RuntimeError("index.html 필수 시스템 누락: " + ", ".join(absent))

    manifest = json.loads((repo / "manifest.webmanifest").read_text(encoding="utf-8"))
    if manifest.get("start_url") != "./index.html" or manifest.get("display") != "standalone":
        raise RuntimeError("PWA manifest 설정이 올바르지 않습니다.")

    if (repo / "assets/c075_base.webp").stat().st_size < 10_000:
        raise RuntimeError("기본 카드 이미지가 비정상적으로 작습니다.")
    if (repo / "assets/c075_final.webp").stat().st_size < 10_000:
        raise RuntimeError("최종 카드 이미지가 비정상적으로 작습니다.")

    return {
        "version": VERSION,
        "index_sha256": sha256(repo / "index.html"),
        "standalone_sha256": sha256(repo / "heungyanggi_v37_standalone.html"),
        "base_art_sha256": sha256(repo / "assets/c075_base.webp"),
        "final_art_sha256": sha256(repo / "assets/c075_final.webp"),
    }


def restore_from_record(repo: Path, record: dict[str, Any], remove_marker: bool = True) -> None:
    backup_dir = Path(record["backup_dir"])
    for item in reversed(record["files"]):
        rel = Path(item["path"])
        dest = repo / rel
        backup = backup_dir / rel
        if item["existed"]:
            if not backup.is_file():
                raise RuntimeError(f"백업 파일을 찾을 수 없습니다: {backup}")
            atomic_copy(backup, dest)
        else:
            if dest.is_file() or dest.is_symlink():
                dest.unlink()
    # 비어 있는 설치 전용 폴더만 정리한다.
    for rel_dir in [Path("docs/hy_v37"), Path("assets")]:
        d = repo / rel_dir
        try:
            d.rmdir()
        except OSError:
            pass
    if remove_marker:
        marker = repo / MARKER
        if marker.exists():
            marker.unlink()


def install(repo: Path) -> None:
    validate_repo(repo)
    files = payload_files()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = repo / "_hy_backups" / f"v37_{stamp}"
    backup_dir.mkdir(parents=True, exist_ok=False)

    record: dict[str, Any] = {
        "version": VERSION,
        "installed_at": datetime.now().isoformat(timespec="seconds"),
        "repository": str(repo),
        "backup_dir": str(backup_dir),
        "files": [],
    }

    previous_marker = repo / MARKER
    if previous_marker.is_file():
        atomic_copy(previous_marker, backup_dir / MARKER)
        record["previous_marker_existed"] = True
    else:
        record["previous_marker_existed"] = False

    try:
        for src in files:
            rel = src.relative_to(PAYLOAD_DIR)
            dest = repo / rel
            existed = dest.is_file()
            record["files"].append({"path": rel.as_posix(), "existed": existed})
            if existed:
                atomic_copy(dest, backup_dir / rel)
            atomic_copy(src, dest)

        validation = validate_install(repo)
        record["validation"] = validation
        (repo / MARKER).write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        (backup_dir / "install_record.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        restore_from_record(repo, record, remove_marker=False)
        if record.get("previous_marker_existed") and (backup_dir / MARKER).is_file():
            atomic_copy(backup_dir / MARKER, repo / MARKER)
        raise

    print("\n[완료] 흥양기 v37을 설치했습니다.")
    print(f"대상: {repo}")
    print(f"백업: {backup_dir}")
    print(f"index SHA-256: {record['validation']['index_sha256']}")
    print("브라우저에서 index.html 또는 로컬 서버 주소를 여세요.")


def rollback(repo: Path) -> None:
    validate_repo(repo)
    marker = repo / MARKER
    if not marker.is_file():
        raise FileNotFoundError(f"설치 기록이 없습니다: {marker}")
    record = json.loads(marker.read_text(encoding="utf-8"))
    if record.get("version") != VERSION:
        raise RuntimeError(f"v37 설치 기록이 아닙니다: {record.get('version')}")
    restore_from_record(repo, record, remove_marker=True)
    backup_marker = Path(record["backup_dir"]) / MARKER
    if record.get("previous_marker_existed") and backup_marker.is_file():
        atomic_copy(backup_marker, repo / MARKER)
    print("\n[완료] v37 설치 전 상태로 복구했습니다.")
    print(f"복구 원본: {record['backup_dir']}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="흥양기 v37 설치·롤백")
    parser.add_argument("repository", type=Path, help="기존 hukkle 저장소 또는 배포 폴더")
    parser.add_argument("--rollback", action="store_true", help="설치 전 상태로 복구")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo = args.repository.expanduser().resolve()
    try:
        rollback(repo) if args.rollback else install(repo)
        return 0
    except Exception as exc:
        print(f"\n[실패] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
