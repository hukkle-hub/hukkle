import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const out = join(root, 'qa-yeojaman');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp' };
const server = createServer(async (req, res) => {
  try {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (clean === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const file = normalize(join(root, clean === '/' ? 'index.html' : clean));
    if (!(await stat(file)).isFile()) throw new Error('not file');
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(resolve => server.listen(4174, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const page = await browser.newPage({ viewport: { width: 1279, height: 599 } });
page.setDefaultTimeout(6000);
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
await mkdir(out, { recursive: true });
await page.goto('http://127.0.0.1:4174/admin/dungeon-flow.html?region=yeoja&v=68.0.0', { waitUntil: 'networkidle' });

const snapshot = async (name) => {
  await page.screenshot({ path: join(out, `${name}.png`) });
  return page.evaluate(() => ({
    phase: document.querySelector('#game')?.dataset.phase,
    image: {
      src: document.querySelector('#sceneImg')?.getAttribute('src'),
      width: document.querySelector('#sceneImg')?.naturalWidth,
      height: document.querySelector('#sceneImg')?.naturalHeight,
      visible: getComputedStyle(document.querySelector('#sceneImg')).opacity !== '0',
    },
  }));
};

const phases = { travel: await snapshot('01-travel') };
for (let i = 0; i < 4; i += 1) await page.locator('#nextTravel').click();
await page.waitForSelector('#game[data-phase="explore"]');
phases.explore = await snapshot('02-explore');

const markerChecks = await page.evaluate(() => [...document.querySelectorAll('.hotspot')].map(el => {
  const r = el.getBoundingClientRect();
  return { label: el.textContent.trim(), width: r.width, height: r.height, visible: r.width >= 120 && r.height >= 44 };
}));

for (let clue = 0; clue < 3; clue += 1) {
  if (!(await page.locator('#investSheet').evaluate(el => el.classList.contains('open')))) await page.locator('#nextClue').click();
  await page.locator('#advanceInvest').click();
  await page.locator('#advanceInvest').click();
  await page.locator('#advanceInvest').click();
  await page.locator('#advanceInvest').click();
}
const clueCount = await page.locator('#clueCount').textContent();
const dungeonEnabled = await page.locator('#enterDungeon').isEnabled();
await page.locator('#enterDungeon').click();
await page.waitForSelector('#game[data-phase="dungeon"]');
phases.dungeon = await snapshot('03-dungeon');

for (let zone = 0; zone < 3; zone += 1) await page.locator(`.zone[data-i="${zone}"]`).click();
const zoneCount = await page.locator('.zone.visited').count();
const bossEnabled = await page.locator('#completeRegion').isEnabled();
await page.locator('#completeRegion').click();
await page.waitForSelector('#game[data-phase="boss"]');
await page.waitForFunction(() => document.querySelector('#sceneImg')?.complete && document.querySelector('#sceneImg')?.naturalWidth > 0);
phases.boss = await snapshot('04-boss');

const layout = await page.evaluate(() => {
  const viewport = { left:0, top:0, right:innerWidth, bottom:innerHeight };
  const inside = selector => [...document.querySelectorAll(selector)].filter(el => getComputedStyle(el).display !== 'none').every(el => {
    const r = el.getBoundingClientRect();
    return r.left >= viewport.left - 1 && r.top >= viewport.top - 1 && r.right <= viewport.right + 1 && r.bottom <= viewport.bottom + 1;
  });
  return {
    bossPanelInside: inside('#bossPanel .boss-copy'),
    topbarInside: inside('.topbar > *'),
    sceneVisible: getComputedStyle(document.querySelector('#sceneImg')).opacity !== '0',
    videoHidden: getComputedStyle(document.querySelector('#sceneVideo')).display === 'none',
  };
});

await page.locator('#confirmBoss').click();
await page.waitForSelector('#battleShell.active');
phases.battle = await snapshot('05-battle');
for (const skill of ['break','guard','strike','break']) {
  await page.locator(`[data-skill="${skill}"]`).click();
  await page.waitForTimeout(650);
}
const manifestReady = await page.locator('#manifestSkill').isEnabled();
phases.manifestReady = await snapshot('06-manifest-ready');
const battleLayout = await page.evaluate(() => {
  const shell = document.querySelector('#battleShell').getBoundingClientRect();
  const buttons = [...document.querySelectorAll('#skillGrid button')];
  return {
    shellInside: shell.left >= 0 && shell.top >= 0 && shell.right <= innerWidth + 1 && shell.bottom <= innerHeight + 1,
    touchTargets: buttons.every(el => { const r=el.getBoundingClientRect(); return r.width >= 80 && r.height >= 48; }),
    minFont: [...document.querySelectorAll('#battleShell *')].filter(el => el.offsetParent && el.textContent.trim()).every(el => parseFloat(getComputedStyle(el).fontSize) >= 12),
  };
});
await page.locator('#manifestSkill').click();
await page.waitForSelector('#manifestCine.play');
await page.waitForTimeout(450);
await page.screenshot({ path: join(out, '06b-seven-star-manifest.png') });
await page.waitForSelector('#battleResult.show', { timeout: 6000 });
phases.victory = await snapshot('07-victory');
const completed = await page.evaluate(() => {
  const s=JSON.parse(localStorage.getItem('hy-dungeon-flow-v660') || '{}')?.yeoja;
  return s?.complete === true && s?.battle?.completed === true;
});
const report = { phases, markerChecks, clueCount, dungeonEnabled, zoneCount, bossEnabled, manifestReady, layout, battleLayout, completed, errors };
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
server.close();
console.log(JSON.stringify(report));

const hdScenes = ['travel','explore','dungeon'].every(key => phases[key].image.width >= 1600 && phases[key].image.height >= 900 && phases[key].image.visible);
if (!hdScenes || markerChecks.length !== 3 || !markerChecks.every(x => x.visible) || clueCount?.trim() !== '기록 3 / 3' || !dungeonEnabled || zoneCount !== 3 || !bossEnabled || !manifestReady || !Object.values(layout).every(Boolean) || !Object.values(battleLayout).every(Boolean) || !completed || errors.length) process.exit(1);
