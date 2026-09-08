from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
CARD_DIR = ROOT / "assets" / "cards-v63"
CELL_W, CELL_H = 116, 214
COLS, ROWS = 10, 13

canvas = Image.new("RGB", (COLS * CELL_W, ROWS * CELL_H), "#07090b")
draw = ImageDraw.Draw(canvas)
for number in range(1, 126):
    card_id = f"C{number:03d}"
    image = Image.open(CARD_DIR / f"{card_id}.webp").convert("RGB")
    image.thumbnail((104, 180), Image.Resampling.LANCZOS)
    col, row = (number - 1) % COLS, (number - 1) // COLS
    x, y = col * CELL_W + 6, row * CELL_H + 6
    canvas.paste(image, (x + (104 - image.width) // 2, y))
    draw.text((x, y + 184), card_id, fill="#e6c879")
canvas.save(ROOT / "CARD_ART_CONTACT_v63.jpg", quality=90, optimize=True)
print(ROOT / "CARD_ART_CONTACT_v63.jpg")
