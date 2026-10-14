/* v86 재대면 판 규칙 검수
 * 5지역 모두에서 (1) 답이 화면에 새지 않는지 (2) 쉬는 카드가 눌리지 않는지
 * (3) 처음 보는 수가 기록되어 저장되는지 (4) 강신이 마지막 매듭에서만 내리는지
 * (5) 정석 플레이와 무작위 플레이의 길이·승률을 잰다.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), out = join(root, 'qa-repeat');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const server = createServer(async (req, res) => { try { const p = decodeURIComponent(req.url.split('?')[0]); if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; } const f = join(root, p === '/' ? 'index.html' : p); const body = await readFile(f); res.writeHead(200, { 'content-type': mime[extname(f)] || 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end(); } });
await new Promise(r => server.listen(4187, '127.0.0.1', r)); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [], results = [];
page.on('pageerror', e => errors.push(String(e)));
const origin = process.env.HY_LIVE_URL || 'http://127.0.0.1:4187/';
const regions = (process.env.HY_PAN_REGIONS || 'yeoja,nokdong,palyoung,geogeum,naro').split(',');
const RUNS = Number(process.env.HY_REPEAT_RUNS || 4);
const check = (ok, msg) => { if (!ok) throw Error(msg); };
const LEAK = /맞서세요|지키세요|끊으세요|막으세요|로 꺾|기록으로|수호로|파훼로/;
const settled = () => page.waitForFunction(() => window.hyPan?.state() && !window.hyPan.state().busy, null, { timeout: 20000 });

await page.goto(origin); await page.waitForFunction(() => window.hyCards?.length === 125);
/* 덱 3종 (A4 밸런스 실측)
 * mixed   — 등급이 섞인 덱, 해신 당골 7성 현현
 * low     — 낮은 별(1~3성), 7성 없음
 * nobreak — 끊기 카드가 없는 덱 (실제 카드 분포: 맞서기 48% · 지키기 30% · 끊기 22%) */
const DECK_SPEC = {
  mixed:   { cards: [['c075', 6, true], ['c001', 3], ['c002', 2], ['c121', 5], ['c034', 4]], manifested: true },
  low:     { cards: [['c075', 3], ['c001', 1], ['c002', 2], ['c121', 2], ['c034', 2]], manifested: false },
  nobreak: { cards: [['c075', 6, true], ['c001', 3], ['c002', 2], ['c121', 1], ['c034', 4]], manifested: true }
};
const DECKS = (process.env.HY_REPEAT_DECKS || 'mixed,low,nobreak').split(',');
const parties = {};
for (const d of DECKS) parties[d] = await page.evaluate(list => list.map(([id, stage, m]) => { const c = hyCards.find(c => c.id.toLowerCase() === id); return { ...c, stage, manifested: !!m, img: new URL(c.img, location.href).href, finalImg: new URL(c.finalImg || c.img, location.href).href }; }), DECK_SPEC[d].cards);

async function open(region, keepRecorded, deck = 'mixed') {
  await page.evaluate(([region, keep]) => {
    const prev = JSON.parse(localStorage.getItem('hy-dungeon-flow-v660') || '{}')[region] || {};
    const s = { routeDone: true, investigationComplete: true, routeVersion: 73, zones: [0, 1, 3, 5, 6], bossSeen: true, complete: true, battle: { completed: true, clears: 1 } };
    if (keep && prev.panRecorded) s.panRecorded = prev.panRecorded;
    localStorage.setItem('hy-dungeon-flow-v660', JSON.stringify({ [region]: s }));
  }, [region, keepRecorded]);
  await page.goto(origin + 'admin/dungeon-flow.html?region=' + region);
  await page.evaluate(([party, man]) => window.postMessage({ type: 'hy-journey-context', party, companionCard: 'c075', companionManifested: man, motion: false }, '*'), [parties[deck], DECK_SPEC[deck].manifested]);
  await page.locator('#confirmBoss').click(); await settled();
}

/* policy: good = 기록된 수는 맞는 카드, 처음 보는 수는 후보 둘 중 하나를 찍고, 맞는 카드가 쉬면 버틴다.
 *         random = 깨어 있는 카드 아무거나. */
async function play(region, policy, shots, deck = 'mixed') {
  await open(region, false, deck);
  const st0 = await page.evaluate(() => hyPan.state());
  check(st0.repeat && st0.phase === 1 && st0.knotsRemaining === 7, region + ' repeat start ' + JSON.stringify(st0));
  let maxHeatBeforeFinal = 0, leaks = [], restViolations = 0, sawStrong = false, firstNew = null, descentAtFinal = null, heatTrail = [];
  for (let n = 0; n < 80; n++) {
    const s = await page.evaluate(() => hyPan.state());
    if (s.won || s.lost) break;
    if (s.phase < 3) maxHeatBeforeFinal = Math.max(maxHeatBeforeFinal, s.heat);
    if (s.phase === 3 && descentAtFinal === null) descentAtFinal = s.manifestUsed;
    heatTrail.push(s.heat);
    const hint = await page.locator('#bossIntentHint').textContent();
    if (LEAK.test(hint)) leaks.push(hint);
    if (!s.intent.recorded && !firstNew) firstNew = s.intent.name;
    /* 쉬는 카드는 눌려선 안 된다 */
    for (const [id, left] of Object.entries(s.rest)) if (left > 0 && await page.locator(`#skillGrid [data-card="${id}"]:not(:disabled)`).count()) restViolations++;
    if (policy === 'good' && s.chuimOpen && s.playerHp > 55) { await page.locator('#panChuimsae').click(); await settled(); sawStrong = (await page.evaluate(() => hyPan.state().strong)) || sawStrong; }
    const now = await page.evaluate(() => hyPan.state());
    let target;
    if (policy === 'good') {
      const kinds = now.intent.recorded ? [now.response] : (Math.random() < .5 ? [now.response] : ['strike', 'guard', 'break'].filter(k => k !== now.response).slice(0, 1));
      for (const k of kinds) { const l = page.locator(`#skillGrid [data-skill="${k}"]:not(:disabled)`); if (await l.count()) { target = l.first(); break; } }
    } else {
      const l = page.locator('#skillGrid .deployed-card:not(:disabled)'); const c = await l.count();
      if (c) target = l.nth(Math.floor(Math.random() * c));
    }
    if (!target) target = page.locator('#panBlock');
    if (shots && n === 4) await page.screenshot({ path: join(out, `${region}-mid.png`) });
    if (shots && s.phase === 3 && !shots.final) { shots.final = true; await page.screenshot({ path: join(out, `${region}-final-knot.png`) }); }
    await target.click();
    await page.waitForFunction(t => (hyPan.state().turn > t || hyPan.state().won || hyPan.state().lost) && !hyPan.state().busy, now.turn, { timeout: 20000 });
    const challenge = await page.locator('.cb-challenge p').textContent().catch(() => '');
    if (/맞서기|지키기|끊기/.test(challenge || '')) leaks.push('card:' + challenge);
  }
  const end = await page.evaluate(() => hyPan.state());
  if (shots) await page.screenshot({ path: join(out, `${region}-${end.won ? 'won' : 'lost'}.png`) });
  const saved = await page.evaluate(region => JSON.parse(localStorage.getItem('hy-dungeon-flow-v660'))[region], region);
  return { region, policy, deck, descentAtFinal, heatTrail: heatTrail.join(''), won: end.won, turns: end.turn, hp: Math.round(end.playerHp), wins: end.wins, losses: end.losses, blocks: end.blocks, chuimsae: end.chuimsae, manifest: end.manifestUsed, manifestCard: end.manifestCardId, knots: end.knotsRemaining, maxHeatBeforeFinal, leaks, restViolations, sawStrong, firstNew, recorded: saved.panRecorded?.length || 0, newRecorded: firstNew ? saved.panRecorded?.includes(firstNew) : null };
}

try {
  for (const region of regions) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await play(region, 'good', i === 0 ? {} : null, 'mixed'));
    for (let i = 0; i < Math.max(2, RUNS / 2); i++) runs.push(await play(region, 'random', null, 'mixed'));
    for (const d of DECKS.filter(d => d !== 'mixed')) for (let i = 0; i < RUNS; i++) runs.push(await play(region, 'good', null, d));
    for (const r of runs) {
      check(r.leaks.length === 0, `${region} answer leaked: ${r.leaks[0]}`);
      check(r.restViolations === 0, `${region} resting card was clickable`);
      check(r.maxHeatBeforeFinal <= 3, `${region} heat reached the top before the final knot`);
      const has7 = DECK_SPEC[r.deck].manifested;
      if (r.won) check(r.knots === 0 && (has7 ? r.manifest && r.manifestCard === 'c075' : !r.manifest), `${region}/${r.deck} win must end with the descent only when a 7-star exists`);
      if (has7 && r.descentAtFinal !== null) check(r.descentAtFinal === true, `${region}/${r.deck} 7-star must descend on entering the final knot`);
      if (r.firstNew) check(r.newRecorded, `${region} new move ${r.firstNew} not saved`);
    }
    const good = runs.filter(r => r.policy === 'good' && r.deck === 'mixed'), rnd = runs.filter(r => r.policy === 'random');
    const byDeck = Object.fromEntries(DECKS.map(d => { const g = runs.filter(r => r.policy === 'good' && r.deck === d); return [d, { wins: g.filter(r => r.won).length + '/' + g.length, turns: g.filter(r => r.won).map(r => r.turns), hp: g.map(r => r.hp) }]; }));
    const summary = { region, byDeck, goodWins: good.filter(r => r.won).length + '/' + good.length, goodTurns: good.filter(r => r.won).map(r => r.turns), goodHp: good.map(r => r.hp), randomWins: rnd.filter(r => r.won).length + '/' + rnd.length, chuimsae: good.reduce((a, r) => a + r.chuimsae, 0), strongSeen: good.some(r => r.sawStrong) };
    check(good.filter(r => r.won).length >= Math.ceil(good.length * .5), `${region} good play should usually win ${JSON.stringify(summary)}`);
    check(good.filter(r => r.won).every(r => r.turns >= 8), `${region} repeat battle too short ${JSON.stringify(summary)}`);
    results.push({ summary, runs });
  }
  /* 기록은 다시 열어도 남는다 */
  await open('nokdong', true);
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('hy-dungeon-flow-v660')).nokdong.panRecorded);
  check(Array.isArray(rec) && rec.length >= 3, 'recorded moves persist');
} catch (e) { errors.push(String(e)); }
finally {
  await writeFile(join(out, 'report.json'), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ summaries: results.map(r => r.summary), errors }, null, 1));
  await browser.close(); server.close();
  if (errors.length || results.length !== regions.length) process.exitCode = 1;
}
