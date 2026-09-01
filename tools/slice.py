#!/usr/bin/env python3
"""흥양기 아트 슬라이서.

미드저니가 뱉은 그리드 시트를 카드용 3:4 단일 이미지로 잘라낸다.
- 판 경계는 밝기 미분의 급변으로 찾는다 (그리드 시트는 경계에서 값이 튄다)
- 잘라낸 판은 얼굴이 상단 1/3에 오도록 3:4 로 재단한다
- 최종 출력은 720x960 webp

사용:  python3 slice.py 원본.webp 출력접두사
"""
import sys
import numpy as np
from PIL import Image

CARD_W, CARD_H = 720, 960          # 3:4
MIN_PANEL = 140                    # 이보다 좁은 조각은 판이 아니라 잔여물


def _edges(gray, axis):
    """axis='v' 면 세로 경계(열), 'h' 면 가로 경계(행)."""
    d = np.abs(np.diff(gray, axis=1)).mean(axis=0) if axis == 'v' \
        else np.abs(np.diff(gray, axis=0)).mean(axis=1)
    m, s = d.mean(), d.std()
    hits = [i for i in range(8, len(d) - 8) if d[i] > m + 4 * s]
    out = []
    for i in hits:
        if not out or i - out[-1] > 6:
            out.append(i)
    return out


def panels(im):
    """시트를 판 목록으로 쪼갠다. 경계가 없으면 통이미지 하나."""
    g = np.asarray(im.convert('L')).astype(float)
    w, h = im.size
    xs = [0] + _edges(g, 'v') + [w]
    ys = [0] + _edges(g, 'h') + [h]
    out = []
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            bw, bh = xs[i + 1] - xs[i], ys[j + 1] - ys[j]
            if bw >= MIN_PANEL and bh >= MIN_PANEL:
                out.append((xs[i], ys[j], xs[i + 1], ys[j + 1]))
    return out or [(0, 0, w, h)]


def to_card(im, box, head_bias=0.30):
    """판을 3:4 로 재단한다. 인물화는 머리가 위쪽에 있으므로 위를 남긴다."""
    p = im.crop(box)
    w, h = p.size
    want = CARD_W / CARD_H          # 0.75
    if w / h > want:                # 너무 넓다 → 좌우를 깎는다
        nw = int(h * want)
        x = (w - nw) // 2
        p = p.crop((x, 0, x + nw, h))
    else:                           # 너무 길다 → 아래를 깎는다
        nh = int(w / want)
        y = int((h - nh) * head_bias)
        p = p.crop((0, y, w, y + nh))
    return p.resize((CARD_W, CARD_H), Image.LANCZOS)


def main():
    src, pref = sys.argv[1], sys.argv[2]
    im = Image.open(src).convert('RGB')
    ps = panels(im)
    # 큰 판부터 — 보통 큰 것이 본 그림, 작은 것이 잔여물
    ps.sort(key=lambda b: -( (b[2]-b[0]) * (b[3]-b[1]) ))
    for n, box in enumerate(ps, 1):
        out = f"{pref}_{n}.webp"
        to_card(im, box).save(out, 'WEBP', quality=90, method=6)
        print(f"{out}  판{box}  →  {CARD_W}x{CARD_H}")


if __name__ == '__main__':
    main()
