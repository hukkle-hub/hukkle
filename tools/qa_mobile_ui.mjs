import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.mp4':'video/mp4' };
const server = createServer(async (req, res) => {
  try {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = normalize(join(root, clean === '/' ? 'index.html' : clean));
    if (!(await stat(file)).isFile()) throw new Error('not file');
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 2340, height: 1080 } });
await page.route('https://ybflkszmymalhafzzdbs.supabase.co/functions/v1/hy/system/status**', route =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, maintenance: false, force_update: false }),
  })
);
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await mkdir(join(root, 'qa-screenshots'), { recursive: true });
await page.screenshot({ path: join(root, 'qa-screenshots', '01-title.png') });

const manifest = JSON.parse(await readFile(join(root, 'card_manifest_v47.json'), 'utf8'));
const cards = Array.isArray(manifest) ? manifest : (manifest.cards || []);
const ids = cards.map(card => card.id);
const skillRule = cards.every(card =>
  Array.isArray(card.skills) &&
  card.skills.length === 6 &&
  card.skills.every((skill, index) => skill.star === index + 1)
);
const result = { cards: cards.length, duplicateIds: ids.length - new Set(ids).size, skillRule };
const screens = ['home','map','inventory','cards','codex','party','shop','missions'];
let cinematicCount = 0;
for (let i = 0; i < 50; i++) {
  const screen = screens[i % screens.length];
  await page.evaluate(name => window.hyRoute(name, { direct: true }), screen);
  cinematicCount += await page.locator('.cinematic.active,.inventory-cinematic.active,.card-cinematic.active,.codex-cinematic.active').count();
}
for (let i = 0; i < screens.length; i++) {
  await page.evaluate(name => window.hyRoute(name, { direct: true }), screens[i]);
  await page.waitForTimeout(120);
  await page.screenshot({ path: join(root, 'qa-screenshots', `${String(i + 2).padStart(2, '0')}-${screens[i]}.png`) });
}
const report = { ...result, cinematicCount, consoleErrorCount: errors.length, errors };
await writeFile(join(root, 'qa-screenshots', 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
server.close();
console.log(JSON.stringify(report));
if (result.cards !== 125 || result.duplicateIds !== 0 || !result.skillRule || cinematicCount !== 0 || errors.length !== 0) process.exit(1);
