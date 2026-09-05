#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, shutil, sys
from pathlib import Path

def copy(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        if dst.exists(): shutil.rmtree(dst)
        shutil.copytree(src, dst)
    else: shutil.copy2(src, dst)

def main():
    p=argparse.ArgumentParser();p.add_argument('repo',type=Path);a=p.parse_args();repo=a.repo.resolve()
    marker=repo/'.hy-live-update-installed'
    if not marker.is_file(): print('ERROR: install marker not found',file=sys.stderr);return 2
    backup=repo/marker.read_text('utf-8').strip();mp=backup/'install-manifest.json'
    if not mp.is_file(): print('ERROR: rollback manifest missing',file=sys.stderr);return 3
    m=json.loads(mp.read_text('utf-8'))
    for rel in m.get('created',[]):
        p=repo/rel
        if p.is_dir(): shutil.rmtree(p)
        elif p.exists(): p.unlink()
    for rel in m.get('overwritten_dirs',[]):
        src=backup/rel
        if src.exists(): copy(src,repo/rel)
    for rel in m.get('overwritten',[]):
        src=backup/rel
        if src.exists(): copy(src,repo/rel)
    marker.unlink(missing_ok=True)
    print(f'복구 완료: {backup.name}')
    return 0
if __name__=='__main__': raise SystemExit(main())
