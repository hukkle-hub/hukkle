from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps, ImageStat


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:\Users\MIN\.codex\generated_images\01a06a62-5b80-7eb1-af72-d754aa2cdfe0")
OUT = ROOT / "assets" / "cards-v63"

# One five-panel source sheet per five cards. C061-C065 deliberately uses the
# second, cleaner pass (17d6...) and excludes the discarded earlier sheet.
SHEETS = [
    "exec-b2d024e6-594d-41d5-8c9c-63d89285d0f2.png",
    "exec-62d95c83-6ce9-429b-bd97-e6c8ad1d5039.png",
    "exec-ae102fa5-0e57-4de8-a272-ab5c03bb9a6c.png",
    "exec-b9344f1b-9726-4e96-986e-52182addfe43.png",
    "exec-03067ce4-e581-400c-95a5-8ee52a2b0ce5.png",
    "exec-a7711e1d-225f-4fd5-903c-18be9b35b298.png",
    "exec-01f30461-918a-4896-8506-443a260715d1.png",
    "exec-8133fc14-ff33-4ef9-bab7-e12285171c4b.png",
    "exec-1bbb865b-b215-4d26-9763-b1d35de35293.png",
    "exec-5a41c201-8f4e-4d32-bf90-da3fb90a5164.png",
    "exec-215f6613-28e7-4b0a-816b-04d20224e618.png",
    "exec-bdedb55a-548e-474b-9110-5a95efcddee3.png",
    "exec-17d6bc2e-128d-46a6-afc2-9ee070862ccc.png",
    "exec-eabe5c16-be0d-4ca3-8381-f05c914ad6fd.png",
    "exec-a3c9f688-7f7d-4a37-a010-361e64c886c9.png",
    "exec-af9698a5-e523-44bd-ab35-3aa166b052be.png",
    "exec-ff7c8b80-b5bb-463b-9691-9e823dda7c5c.png",
    "exec-0820ba7a-6664-4ce0-ae0b-80111a925af0.png",
    "exec-3202ce71-39fe-4dd8-9dd5-9591c037c63e.png",
    "exec-8c36c925-e7d2-46b2-ac09-0a29e3cc25e7.png",
    "exec-5bff96a7-5413-42b5-994b-6e588dbf628c.png",
    "exec-dac6c11e-07fd-4520-aebf-bd5681439a76.png",
    "exec-f1c785a5-2235-4947-bbb8-4ef67773097b.png",
    "exec-7ebd3cd9-e4a8-4cf6-8cd3-e6dbaa472ef8.png",
    "exec-e373e4c7-8cc1-4908-a0fc-14d9ee23a08e.png",
]

FACTION_TINTS = {
    "당": (222, 174, 82),
    "물": (72, 174, 205),
    "저승": (157, 86, 116),
}


def cover(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    return ImageOps.fit(im, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.45))


def contain(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = im.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    return copy


def card_canvas(panel: Image.Image) -> Image.Image:
    size = (580, 1000)
    bg = cover(panel, size).filter(ImageFilter.GaussianBlur(26))
    bg = ImageEnhance.Brightness(bg).enhance(0.42)
    bg = ImageEnhance.Color(bg).enhance(0.72)
    sharp = contain(panel, (530, 950))
    canvas = bg.convert("RGBA")
    x = (size[0] - sharp.width) // 2
    y = (size[1] - sharp.height) // 2
    mask = Image.new("L", sharp.size, 255)
    feather = max(2, min(sharp.width, sharp.height) // 45)
    mask = mask.filter(ImageFilter.GaussianBlur(feather))
    canvas.alpha_composite(Image.composite(sharp.convert("RGBA"), Image.new("RGBA", sharp.size), mask), (x, y))
    vignette = Image.new("L", size, 0)
    vd = ImageDraw.Draw(vignette)
    vd.ellipse((-160, -80, 740, 1120), fill=235)
    vignette = ImageOps.invert(vignette.filter(ImageFilter.GaussianBlur(110)))
    shade = Image.new("RGBA", size, (0, 0, 0, 0))
    shade.putalpha(vignette.point(lambda p: int(p * 0.58)))
    canvas = Image.alpha_composite(canvas, shade)
    return canvas.convert("RGB")


def final_variant(base: Image.Image, faction: str, seed: int) -> Image.Image:
    tint = FACTION_TINTS[faction]
    im = ImageEnhance.Contrast(base).enhance(1.13)
    im = ImageEnhance.Color(im).enhance(1.16)
    im = ImageEnhance.Sharpness(im).enhance(1.35).convert("RGBA")
    aura = Image.new("RGBA", im.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(aura)
    cx, cy = im.width // 2, int(im.height * 0.44)
    for radius, alpha in ((280, 18), (220, 24), (155, 32)):
        draw.ellipse((cx-radius, cy-radius, cx+radius, cy+radius), outline=(*tint, alpha), width=9)
    # Deterministic motes give every final evolution a distinct constellation.
    x = (seed * 97) % 541
    for i in range(34):
        x = (x * 73 + 41) % 563
        y = (seed * 53 + i * 137) % 947 + 22
        r = 1 + ((seed + i * 11) % 4)
        a = 70 + ((seed * 7 + i * 19) % 120)
        draw.ellipse((x-r, y-r, x+r, y+r), fill=(*tint, a))
    aura = aura.filter(ImageFilter.GaussianBlur(1.2))
    im = Image.alpha_composite(im, aura)
    # A restrained bottom bloom differentiates final art without changing identity.
    bloom = Image.new("RGBA", im.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(bloom)
    bd.ellipse((-90, 690, 670, 1130), fill=(*tint, 44))
    bloom = bloom.filter(ImageFilter.GaussianBlur(72))
    return Image.alpha_composite(im, bloom).convert("RGB")


def dhash(im: Image.Image, size: int = 16) -> int:
    gray = im.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    px = list(gray.getdata())
    value = 0
    for y in range(size):
        row = y * (size + 1)
        for x in range(size):
            value = (value << 1) | int(px[row + x] > px[row + x + 1])
    return value


def distance(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def main() -> None:
    manifest = json.loads((ROOT / "card_manifest_v47.json").read_text(encoding="utf-8"))
    factions = {c["id"]: c["faction"] for c in manifest["cards"]}
    OUT.mkdir(parents=True, exist_ok=True)
    generated = []
    hashes: dict[str, int] = {}
    for sheet_index, sheet_name in enumerate(SHEETS):
        src = Image.open(SOURCE / sheet_name).convert("RGB")
        w, h = src.size
        for panel_index in range(5):
            card_number = sheet_index * 5 + panel_index + 1
            card_id = f"C{card_number:03d}"
            x0 = round(w * panel_index / 5)
            x1 = round(w * (panel_index + 1) / 5)
            gutter = max(2, round((x1 - x0) * 0.012))
            panel = src.crop((x0 + gutter, 0, x1 - gutter, h))
            base = card_canvas(panel)
            final = final_variant(base, factions[card_id], card_number)
            base_path = OUT / f"{card_id}.webp"
            final_path = OUT / f"{card_id}-final.webp"
            base.save(base_path, "WEBP", quality=78, method=6)
            final.save(final_path, "WEBP", quality=82, method=6)
            hashes[card_id] = dhash(base)
            generated.append({
                "id": card_id,
                "base": str(base_path.relative_to(ROOT)).replace("\\", "/"),
                "final": str(final_path.relative_to(ROOT)).replace("\\", "/"),
                "base_bytes": base_path.stat().st_size,
                "final_bytes": final_path.stat().st_size,
                "sha256": hashlib.sha256(base_path.read_bytes()).hexdigest(),
            })

    exact = len({x["sha256"] for x in generated})
    nearest = []
    ids = list(hashes)
    for i, left in enumerate(ids):
        for right in ids[i + 1:]:
            d = distance(hashes[left], hashes[right])
            if d < 38:
                nearest.append({"left": left, "right": right, "dhash_distance": d})
    report = {
        "version": "63.0.1",
        "generated_base": len(generated),
        "generated_final": len(generated),
        "unique_exact_hashes": exact,
        "possible_visual_duplicates_threshold_lt_38": sorted(nearest, key=lambda x: x["dhash_distance"]),
        "total_bytes": sum(x["base_bytes"] + x["final_bytes"] for x in generated),
        "cards": generated,
    }
    (ROOT / "CARD_ART_QA_v63.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: report[k] for k in report if k != "cards"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
