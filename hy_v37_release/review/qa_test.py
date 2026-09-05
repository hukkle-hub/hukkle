import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
HTML = (ROOT / "heungyanggi_v37_standalone.html").read_text(encoding="utf-8")

async def check(condition, name, results, detail=""):
    results.append({"name": name, "passed": bool(condition), "detail": detail})
    if not condition:
        raise AssertionError(f"{name}: {detail}")

async def run_mobile(browser):
    results = []
    errors = []
    page = await browser.new_page(viewport={"width": 412, "height": 915}, device_scale_factor=1)
    page.set_default_timeout(8000)
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
    page.on("console", lambda msg: errors.append(f"console {msg.type}: {msg.text}") if msg.type == "error" else None)
    await page.set_content(HTML, wait_until="load")
    await page.wait_for_timeout(150)

    await check(await page.locator("#newGameBtn").is_visible(), "M01 title start button", results)
    await page.click("#newGameBtn")
    await page.wait_for_timeout(850)
    await check(await page.locator("#scene-bus").evaluate("el => el.classList.contains('active')"), "M02 bus scene transition", results)

    for _ in range(6):
        await page.click("#busNextBtn")
        await page.wait_for_timeout(90)
    await check((await page.locator("#scene-bus").get_attribute("data-step")) == "6", "M03 all bus anomalies", results)
    await page.screenshot(path=str(ROOT / "qa_mobile_bus_final.png"))

    await page.click("#busNextBtn")
    await page.wait_for_timeout(850)
    await check(await page.locator("#scene-field").evaluate("el => el.classList.contains('active')"), "M04 field investigation transition", results)
    for selector in [".clue-water", ".clue-rope", ".clue-ticket"]:
        await page.click(selector)
    await page.wait_for_timeout(120)
    await check((await page.locator("#clueCount").inner_text()) == "3", "M05 three clues recorded", results)
    await check(await page.locator("#pathCta").is_visible(), "M06 ritual path unlocked", results)
    await page.screenshot(path=str(ROOT / "qa_mobile_field_final.png"))

    await page.click("#pathCta")
    await page.wait_for_timeout(1250)
    await check(await page.locator("#scene-ritual").evaluate("el => el.classList.contains('active')"), "M07 ritual battle entered", results)
    await check((await page.locator(".ritual-card").count()) == 6, "M08 six ritual actions rendered", results)
    await check(await page.locator('.ritual-card[data-card="mirror"]').is_disabled(), "M09 mirror locked before first death", results)
    score_before = await page.locator("#scoreText").inner_text()
    await page.click('.ritual-card[data-card="water"]')
    await page.wait_for_timeout(150)
    score_after = await page.locator("#scoreText").inner_text()
    await check(score_before != score_after, "M10 card action changes ritual score", results, f"{score_before} -> {score_after}")
    await page.screenshot(path=str(ROOT / "qa_mobile_ritual_final.png"))

    await page.evaluate("window.HY37.debugDeath()")
    await page.wait_for_timeout(900)
    await check(await page.locator("#scene-codex").evaluate("el => el.classList.contains('active')"), "M11 death opens bestiary", results)
    await check("명두" in await page.locator(".unlock-copy").inner_text(), "M12 death unlocks mirror clue", results)
    await page.screenshot(path=str(ROOT / "qa_mobile_codex_final.png"))

    await page.click("#retryBtn")
    await page.wait_for_timeout(1100)
    await check(not await page.locator('.ritual-card[data-card="mirror"]').is_disabled(), "M13 mirror usable on retry", results)

    await page.evaluate("window.HY37.jump('sealing')")
    await page.wait_for_timeout(850)
    for card_id in ["rope", "water", "mirror", "blade", "shaman"]:
        await page.click(f'[data-seal-card="{card_id}"]')
        await page.wait_for_timeout(120)
    await page.wait_for_timeout(1100)
    await check(await page.locator("#scene-emergence").evaluate("el => el.classList.contains('active')"), "M14 correct sealing order", results)
    await page.wait_for_timeout(4650)
    await check(await page.locator("#finishSealBtn").is_visible(), "M15 final emergence completion control", results)
    await page.screenshot(path=str(ROOT / "qa_mobile_emergence_final.png"))

    await page.click("#finishSealBtn")
    await page.wait_for_timeout(900)
    await check(await page.locator("#scene-victory").evaluate("el => el.classList.contains('active')"), "M16 victory and route screen", results)

    await page.click('#scene-victory [data-action="archive"]')
    await page.wait_for_timeout(250)
    src1 = await page.locator("#archiveArt").get_attribute("src")
    await page.click('[data-stage="6"]')
    src6 = await page.locator("#archiveArt").get_attribute("src")
    await page.click('[data-stage="7"]')
    src7 = await page.locator("#archiveArt").get_attribute("src")
    await check(src1 == src6, "M17 1-star through 6-star share base art", results)
    await check(src6 != src7, "M18 final evolution uses different art", results)
    await page.screenshot(path=str(ROOT / "qa_mobile_archive_final.png"))

    await check(not errors, "M19 no mobile page or console errors", results, " | ".join(errors))
    await page.close()
    return results, errors

async def run_desktop(browser):
    results = []
    errors = []
    page = await browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page.set_default_timeout(8000)
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
    page.on("console", lambda msg: errors.append(f"console {msg.type}: {msg.text}") if msg.type == "error" else None)
    await page.set_content(HTML, wait_until="load")
    await page.evaluate("window.HY37.unlockMirror(); window.HY37.jump('ritual')")
    await page.wait_for_timeout(1250)
    await check(await page.locator("#scene-ritual").evaluate("el => el.classList.contains('active')"), "D01 desktop ritual scene", results)
    dimensions = await page.evaluate("({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,sh:document.documentElement.scrollHeight,ch:document.documentElement.clientHeight})")
    await check(dimensions["sw"] <= dimensions["cw"] + 2, "D02 no horizontal document overflow", results, str(dimensions))
    await page.screenshot(path=str(ROOT / "qa_desktop_ritual_final.png"))
    await page.evaluate("window.HY37.debugVictory()")
    await page.wait_for_timeout(900)
    await check((await page.locator(".route").count()) == 6, "D03 six Goheung route concepts", results)
    await page.screenshot(path=str(ROOT / "qa_desktop_victory_final.png"), full_page=True)
    await check(not errors, "D04 no desktop page or console errors", results, " | ".join(errors))
    await page.close()
    return results, errors

async def main():
    report = {"mobile": [], "desktop": [], "errors": []}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        try:
            report["mobile"], mobile_errors = await run_mobile(browser)
            report["desktop"], desktop_errors = await run_desktop(browser)
            report["errors"] = mobile_errors + desktop_errors
        finally:
            await browser.close()
    all_checks = report["mobile"] + report["desktop"]
    report["summary"] = {
        "passed": sum(1 for item in all_checks if item["passed"]),
        "total": len(all_checks),
        "all_passed": all(item["passed"] for item in all_checks),
    }
    (ROOT / "qa_results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False))

if __name__ == "__main__":
    asyncio.run(main())
