from __future__ import annotations

import base64
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "index.html"
OUT = ROOT / "assets" / "ui-v63"


def main() -> None:
    text = HTML.read_text(encoding="utf-8")
    pattern = re.compile(
        r"url\((?P<quote>['\"]?)data:image/(?P<kind>png|jpeg|jpg|webp);base64,"
        r"(?P<data>[A-Za-z0-9+/=\r\n]+)(?P=quote)\)",
        re.IGNORECASE,
    )
    matches = list(pattern.finditer(text))
    if not matches:
        print(json.dumps({"extracted": 0, "html_bytes": len(text.encode('utf-8'))}, ensure_ascii=False))
        return

    OUT.mkdir(parents=True, exist_ok=True)
    replacements: list[tuple[int, int, str]] = []
    report = []
    for index, match in enumerate(matches, start=1):
        raw = base64.b64decode(re.sub(r"\s+", "", match.group("data")))
        ext = "jpg" if match.group("kind").lower() in {"jpeg", "jpg"} else match.group("kind").lower()
        digest = hashlib.sha256(raw).hexdigest()[:12]
        filename = f"scene-{index:02d}-{digest}.{ext}"
        target = OUT / filename
        target.write_bytes(raw)
        css_context = text[max(0, match.start() - 180):match.start()]
        selector = css_context.rsplit("}", 1)[-1].split("{", 1)[0].strip()[-80:]
        replacement = f"url('./assets/ui-v63/{filename}')"
        replacements.append((match.start(), match.end(), replacement))
        report.append({
            "file": f"assets/ui-v63/{filename}",
            "bytes": len(raw),
            "selector": selector,
            "sha256": hashlib.sha256(raw).hexdigest(),
        })

    for start, end, replacement in reversed(replacements):
        text = text[:start] + replacement + text[end:]
    HTML.write_text(text, encoding="utf-8", newline="\n")
    result = {
        "extracted": len(report),
        "html_bytes": len(text.encode("utf-8")),
        "assets": report,
    }
    (ROOT / "INLINE_ART_QA_v63.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
