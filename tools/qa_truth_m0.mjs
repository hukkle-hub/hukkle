/* M0 진실성 검수 (v90.1)
 * (1) 허브 모든 화면에 쓸 곳 없는 화폐(◆·신석)·없는 레벨(Lv.)·국악 용어(추임새·얼쑤·장단)·옛 고정값이 보이지 않는다
 * (2) 홈 기록률 = 기록 화면의 전체 기록률
 * (3) 지역 기록률은 여정 저장값을 따라 변한다
 * (4) 소록도·고흥읍을 골라 출발해도 여자만 여정이 열리지 않는다
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), out = join(root, 'qa-truth');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const server = createServer(async (req, res) => { try { const p = decodeURIComponent(req.url.split('?')[0]); if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; } const f = join(root, p === '/' ? 'index.html' : p); const body = await readFile(f); res.writeHead(200, { 'content-type': mime[extname(f)] || 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end(); } });
await new Promise(r => server.listen(4189, '127.0.0.1', r)); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [], report = {};
page.on('pageerror', e => errors.push(String(e)));
const origin = 'http://127.0.0.1:4189/';
const check = (ok, msg) => { if (!ok) throw Error(msg); };
const FORBIDDEN = /◆|신석|3,860|Lv\.\s?\d|추임새|얼쑤|장단/;

try {
  await page.goto(origin); await page.waitForFunction(() => window.hyCards?.length === 125);
  await page.waitForTimeout(400);
  // (1) 화면마다 보이는 글자 검사
  const screens = await page.evaluate(() => [...document.querySelectorAll('.screen[data-screen]')].map(s => s.dataset.screen).filter(n => n !== 'title' && n !== 'journey'));
  report.screens = {};
  for (const s of screens) {
    await page.evaluate(n => window.hyRoute ? window.hyRoute(n, { direct: true }) : null, s);
    await page.waitForTimeout(250);
    const text = await page.evaluate(n => document.querySelector(`.screen[data-screen="${n}"]`).innerText, s);
    const hit = text.match(FORBIDDEN);
    report.screens[s] = hit ? hit[0] : 'ok';
    check(!hit, `${s} 화면에 정리 대상 문구가 남아 있다: ${hit?.[0]} … ${text.slice(Math.max(0, text.indexOf(hit?.[0]) - 30), text.indexOf(hit?.[0]) + 30)}`);
  }
  // (2) 홈 기록률 = 기록 화면 기록률
  await page.evaluate(() => window.hyRoute('codex', { direct: true })); await page.waitForTimeout(300);
  const codexRate = await page.locator('#codexTotalProgress').textContent();
  await page.evaluate(() => window.hyRoute('home', { direct: true })); await page.waitForTimeout(300);
  const homeRate = await page.locator('#homeRecordRate').textContent();
  report.rates = { codexRate, homeRate };
  check(homeRate === '기록 ' + codexRate, `홈 기록률(${homeRate})이 기록 화면(${codexRate})과 다르다`);
  // (3) 지역 기록률은 여정 저장값을 따른다
  await page.evaluate(() => window.hyRoute('map', { direct: true }));
  const before = await page.evaluate(() => { document.querySelector('.geo-pin[data-region="palyoung"]').click(); return document.getElementById('regionRecord').textContent; });
  await page.evaluate(() => localStorage.setItem('hy-dungeon-flow-v660', JSON.stringify({ palyoung: { zones: [0, 1, 3, 5, 6], investigationComplete: true, battle: { completed: true } } })));
  const after = await page.evaluate(() => { document.querySelector('.geo-pin[data-region="yeojaman"]').click(); document.querySelector('.geo-pin[data-region="palyoung"]').click(); return document.getElementById('regionRecord').textContent; });
  report.regionRecord = { before, after };
  check(before === '0%' && after === Math.round(5 / 7 * 50 + 50) + '%', `팔영산 기록률이 저장값을 따르지 않는다 ${before} → ${after}`);
  // (4) 소록도·고흥읍 출발 → 여정이 열리지 않는다
  // 튜토리얼을 마친 상태로 다시 연다(잠금 조건이 아니라 지역 조건으로 막히는지 보려고)
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('hy-ui-state') || '{}'); s.tutorialComplete = true; localStorage.setItem('hy-ui-state', JSON.stringify(s)); });
  await page.goto(origin); await page.waitForFunction(() => window.hyCards?.length === 125); await page.waitForTimeout(300);
  for (const id of ['sorok', 'goheung']) {
    await page.evaluate(() => window.hyRoute('map', { direct: true }));
    const opened = await page.evaluate(async id => {
      document.querySelector(`.geo-pin[data-region="${id}"]`).click();
      document.getElementById('mapDepart').click();
      await new Promise(r => setTimeout(r, 600));
      const f = document.getElementById('journeyFrame');
      return { active: document.querySelector('.screen.active')?.dataset.screen, src: f?.getAttribute('src') || '' };
    }, id);
    report['depart_' + id] = opened;
    check(opened.active !== 'journey' && !/region=yeoja/.test(opened.src), `${id}를 골라 출발했는데 여정이 열렸다 ${JSON.stringify(opened)}`);
  }
  check(!errors.length, 'page errors: ' + errors.join(' | '));
  report.ok = true;
  console.log(JSON.stringify(report, null, 1));
} catch (e) {
  report.ok = false; report.error = String(e.message || e); report.errors = errors;
  console.error(JSON.stringify(report, null, 1));
  await page.screenshot({ path: join(out, 'failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); server.close();
}
