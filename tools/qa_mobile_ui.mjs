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

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
// Matches the real Android landscape capture used for regression review.
const page = await browser.newPage({ viewport: { width: 1279, height: 599 } });
page.setDefaultTimeout(5000);
await page.route('https://ybflkszmymalhafzzdbs.supabase.co/functions/v1/hy/system/status**', route =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, maintenance: false, force_update: false }),
  })
);
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {
  if (message.type() === 'error') {
    const location = message.location();
    errors.push(location.url ? `${message.text()} @ ${location.url}` : message.text());
  }
});
page.on('response', response => {
  if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`);
});
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await mkdir(join(root, 'qa-screenshots'), { recursive: true });
await page.screenshot({ path: join(root, 'qa-screenshots', '01-title.png') });

const layoutChecks = await page.evaluate(() => {
  const game = document.querySelector('#game').getBoundingClientRect();
  const inside = el => {
    const r = el.getBoundingClientRect();
    return r.left >= game.left - 1 && r.top >= game.top - 1 &&
      r.right <= game.right + 1 && r.bottom <= game.bottom + 1;
  };
  const lowerTitleControls = ['titlePrologue', 'titleStart', 'titleNotice']
    .map(id => document.getElementById(id));
  return {
    sixteenNine: Math.abs(game.width / game.height - 16 / 9) < 0.01,
    centered: Math.abs((game.left + game.right) / 2 - innerWidth / 2) < 1,
    gameInsideViewport: game.left >= -1 && game.top >= -1 &&
      game.right <= innerWidth + 1 && game.bottom <= innerHeight + 1,
    titleControlsInside: lowerTitleControls.every(inside),
    titleControlsOnArtwork: lowerTitleControls.every(el => {
      const r = el.getBoundingClientRect();
      return r.top >= game.top + game.height * .74 && r.bottom <= game.bottom;
    }),
  };
});

const utilityChecks = [];
await page.locator('#titlePrologue').click();
utilityChecks.push(await page.evaluate(() => {
  const layer = document.querySelector('#utilityLayer');
  const card = document.querySelector('.prologue-card')?.getBoundingClientRect();
  const actions = document.querySelector('.prologue-actions')?.getBoundingClientRect();
  const game = document.querySelector('#game').getBoundingClientRect();
  return !layer.classList.contains('hidden') && card && actions &&
    card.bottom <= actions.top && actions.bottom <= game.bottom + 1;
}));
await page.locator('#utilityClose').click();
for (const id of ['titleNotice', 'titleSettings', 'titleAccount', 'titleSupport']) {
  console.log(`QA utility: ${id}`);
  await page.locator(`#${id}`).click();
  utilityChecks.push(await page.locator('#utilityLayer').evaluate(el => !el.classList.contains('hidden')));
  await page.locator('#utilityClose').click();
}
await page.locator('#titleStart').click();
await page.waitForSelector('.screen[data-screen="home"].active');
await page.evaluate(() => { window.hyState.motion = false; window.hySave(); });

const homeHitGeometry = await page.evaluate(() => {
  const game = document.querySelector('#game').getBoundingClientRect();
  const expected = {
    map:[.179,.267], inventory:[.27,.358], cards:[.361,.449],
    codex:[.452,.54], party:[.543,.631], shop:[.634,.722], missions:[.725,.815],
  };
  const actual = {};
  let aligned = true;
  let separated = true;
  let previousRight = -Infinity;
  for (const [name, target] of Object.entries(expected)) {
    const r = document.querySelector(`.home-hit[data-screen="${name}"]`).getBoundingClientRect();
    const span = [(r.left-game.left)/game.width,(r.right-game.left)/game.width];
    actual[name] = span.map(value => Number(value.toFixed(4)));
    aligned &&= Math.abs(span[0]-target[0]) < .004 && Math.abs(span[1]-target[1]) < .004;
    separated &&= span[0] >= previousRight;
    previousRight = span[1];
  }
  return { aligned, separated, actual };
});

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
const routeFailures = [];
const internalHeaderChecks = [];
for (let i = 0; i < 50; i++) {
  const screen = screens[i % screens.length];
  console.log(`QA route ${i + 1}/50: ${screen}`);
  if (screen === 'home') {
    const current = await page.locator('.screen.active').getAttribute('data-screen');
    if (current !== 'home') await page.locator('.screen.active .back[data-route="home"]').click();
  } else {
    const current = await page.locator('.screen.active').getAttribute('data-screen');
    const selector = current === 'home'
      ? `.screen.active .home-hit[data-screen="${screen}"]`
      : `.screen.active .nav button[data-route="${screen}"]`;
    await page.locator(selector).click();
  }
  await page.waitForTimeout(40);
  const active = await page.locator('.screen.active').getAttribute('data-screen');
  if (active !== screen) routeFailures.push({ expected: screen, active });
  cinematicCount += await page.locator('.cinematic.active,.inventory-cinematic.active,.card-cinematic.active,.codex-cinematic.active').count();
}
for (let i = 0; i < screens.length; i++) {
  await page.evaluate(name => window.hyRoute(name, { direct: true }), screens[i]);
  await page.waitForTimeout(120);
  if (!['home'].includes(screens[i])) internalHeaderChecks.push(await page.evaluate(() => {
    const game = document.querySelector('#game').getBoundingClientRect();
    const title = document.querySelector('.screen.active .screen-title').getBoundingClientRect();
    const currency = document.querySelector('.screen.active .currency').getBoundingClientRect();
    return currency.left >= game.left + game.width * .72 && title.right + 8 <= currency.left;
  }));
  await page.screenshot({ path: join(root, 'qa-screenshots', `${String(i + 2).padStart(2, '0')}-${screens[i]}.png`) });
}
await page.evaluate(() => window.hyRoute('shop', { direct: true }));
const readabilityChecks = await page.evaluate(() => {
  const px = selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
  const height = selector => parseFloat(getComputedStyle(document.querySelector(selector)).height);
  return {
    navText: px('.screen.active .nav button') >= 12,
    sectionLabel: px('.screen.active .section-label') >= 11,
    shopTitle: px('.screen.active .good b') >= 12,
    shopPrice: px('.screen.active .price') >= 10,
    shopArt: height('.screen.active .good .art') >= 95,
  };
});
await page.evaluate(() => window.hyRoute('inventory', { direct: true }));
await page.locator('#itemGrid [data-id="water"]').click();
const waterBefore = await page.evaluate(() => Number(window.hyState.itemQty.water || 0));
await page.locator('#useItem').click();
const waterAfter = await page.evaluate(() => Number(window.hyState.itemQty.water || 0));

await page.locator('.screen.active .nav button[data-route="shop"]').click();
const goldBefore = await page.evaluate(() => Number(window.hyState.gold || 0));
await page.locator('#buyGood').click();
const goldAfter = await page.evaluate(() => Number(window.hyState.gold || 0));

await page.locator('.screen.active .nav button[data-route="cards"]').click();
const renderedCards = await page.locator('#cardGrid [data-id]').count();
await page.locator('.screen.active .nav button[data-route="party"]').click();
await page.locator('#autoParty').click();
const partySize = await page.evaluate(() => window.hyState.party.length);
const functionalChecks = {
  inventoryConsume: waterAfter === waterBefore - 1,
  shopPurchase: goldAfter < goldBefore,
  renderedCards: renderedCards > 0,
  partySize: partySize === 5,
};
const screenGeometry = await page.evaluate(() => {
  const box = selector => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x:r.x, y:r.y, width:r.width, height:r.height, scrollTop:el.scrollTop };
  };
  return {
    viewport:[innerWidth, innerHeight],
    game:box('#game'),
    active:box('.screen.active'),
    topbar:box('.screen.active .topbar'),
    content:box('.screen.active .content'),
    nav:box('.screen.active .nav'),
  };
});
await page.evaluate(() => {
  window.hyState.firstDestination = 'yeojaman';
  window.hySave();
});
await page.locator('.screen.active .back[data-route="home"]').click();
await page.locator('.home-action').click();
await page.waitForTimeout(800);
const journeyLinked = await page.locator('#journeyFrame').getAttribute('src');
const journeyActive = await page.locator('.screen.active').getAttribute('data-screen');
await page.evaluate(() => {
  window.hyState.screen = 'journey';
  window.hySave();
  sessionStorage.setItem('hy-title-passed', '1');
  document.querySelector('#journeyFrame').src = 'about:blank';
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.screen[data-screen="home"].active');
const startupRecovery = await page.locator('.screen.active').getAttribute('data-screen');
const report = {
  ...result,
  layoutChecks,
  homeHitGeometry,
  readabilityChecks,
  internalHeadersPassed: internalHeaderChecks.every(Boolean),
  utilityChecksPassed: utilityChecks.every(Boolean),
  routeFailures,
  journeyLinked,
  journeyActive,
  startupRecovery,
  functionalChecks,
  screenGeometry,
  cinematicCount,
  consoleErrorCount: errors.length,
  errors,
};
await writeFile(join(root, 'qa-screenshots', 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
server.close();
console.log(JSON.stringify(report));
if (
  result.cards !== 125 ||
  result.duplicateIds !== 0 ||
  !result.skillRule ||
  !Object.values(layoutChecks).every(Boolean) ||
  !homeHitGeometry.aligned ||
  !homeHitGeometry.separated ||
  !Object.values(readabilityChecks).every(Boolean) ||
  !internalHeaderChecks.every(Boolean) ||
  !utilityChecks.every(Boolean) ||
  routeFailures.length !== 0 ||
  journeyActive !== 'journey' ||
  !journeyLinked?.includes('admin/dungeon-flow.html') ||
  startupRecovery !== 'home' ||
  !Object.values(functionalChecks).every(Boolean) ||
  cinematicCount !== 0 ||
  errors.length !== 0
) process.exit(1);
