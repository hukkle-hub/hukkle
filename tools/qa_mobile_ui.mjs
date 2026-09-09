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
page.on('pageerror', error => errors.push(error.stack || String(error)));
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

const titleStabilityChecks = await page.evaluate(() => {
  const game = document.querySelector('#game').getBoundingClientRect();
  const loader = document.querySelector('#titleLoad');
  const expected = {
    titlePrologue:[.044,.826,.174,.088],
    titleStart:[.392,.823,.218,.09],
    titleNotice:[.786,.826,.162,.088],
  };
  const targets = {};
  let aligned = true;
  let centerHit = true;
  for (const [id, e] of Object.entries(expected)) {
    const el = document.getElementById(id), r = el.getBoundingClientRect();
    const actual = [(r.left-game.left)/game.width,(r.top-game.top)/game.height,r.width/game.width,r.height/game.height];
    targets[id] = actual.map(x => Number(x.toFixed(4)));
    aligned &&= actual.every((x, i) => Math.abs(x-e[i]) < .005);
    centerHit &&= document.elementFromPoint(r.left+r.width/2,r.top+r.height/2) === el;
  }
  return {
    artwork: document.querySelector('.title-art')?.getAttribute('src') === 'assets/title_screen_v67.png',
    loaderReady: loader.classList.contains('ready'),
    loaderHidden: getComputedStyle(loader).visibility === 'hidden' && Number(getComputedStyle(loader).opacity) === 0,
    loaderAriaHidden: loader.getAttribute('aria-hidden') === 'true',
    aligned,
    centerHit,
    targets,
  };
});

const utilityChecks = [];
const utilityFontChecks = [];
await page.locator('#titlePrologue').click();
utilityChecks.push(await page.evaluate(() => {
  const layer = document.querySelector('#utilityLayer');
  const card = document.querySelector('.prologue-card')?.getBoundingClientRect();
  const actions = document.querySelector('.prologue-actions')?.getBoundingClientRect();
  const game = document.querySelector('#game').getBoundingClientRect();
  return !layer.classList.contains('hidden') && card && actions &&
    card.bottom <= actions.top && actions.bottom <= game.bottom + 1;
}));
utilityFontChecks.push(await page.evaluate(() => [...document.querySelectorAll('#utilityWindow button,#utilityWindow p,#utilityWindow small,#utilityWindow span,#utilityWindow b')].filter(el => el.textContent.trim() && el.getClientRects().length).every(el => parseFloat(getComputedStyle(el).fontSize) >= 12)));
await page.screenshot({ path: join(root, 'qa-screenshots', '01b-prologue.png') });
await page.locator('#utilityClose').click();
for (const id of ['titleNotice', 'titleSettings', 'titleAccount', 'titleSupport']) {
  console.log(`QA utility: ${id}`);
  await page.locator(`#${id}`).click();
  utilityChecks.push(await page.locator('#utilityLayer').evaluate(el => !el.classList.contains('hidden')));
  utilityFontChecks.push(await page.evaluate(() => [...document.querySelectorAll('#utilityWindow button,#utilityWindow p,#utilityWindow small,#utilityWindow span,#utilityWindow b')].filter(el => el.textContent.trim() && el.getClientRects().length).every(el => parseFloat(getComputedStyle(el).fontSize) >= 12)));
  if (id === 'titleNotice') await page.screenshot({ path: join(root, 'qa-screenshots', '01c-notice.png') });
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
const minimumFontChecks = [];
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
  if (!['home','title','journey'].includes(screen)) minimumFontChecks.push(await page.evaluate(screenName => ({ screen:screenName, offenders:[...document.querySelectorAll('.screen.active button,.screen.active p,.screen.active small,.screen.active b,.screen.active span:not(.ico):not(.fit-dot)')].filter(el => el.textContent.trim() && el.getClientRects().length && parseFloat(getComputedStyle(el).fontSize) < 12).slice(0,8).map(el => ({ tag:el.tagName, cls:el.className, text:el.textContent.trim().slice(0,28), px:getComputedStyle(el).fontSize })) }), screen));
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
await page.evaluate(() => window.hyRoute('cards', { direct: true }));
const cardPresentationChecks = await page.evaluate(() => {
  const hero = document.querySelector('.screen.active .card-world').getBoundingClientRect();
  const nameplate = document.querySelector('.screen.active .card-nameplate').getBoundingClientRect();
  const evolution = document.querySelector('.screen.active .evolution-strip-v4').getBoundingClientRect();
  const units = [...document.querySelectorAll('.screen.active .card-unit-v4')].slice(0, 2).map(el => el.getBoundingClientRect());
  return {
    heroWidth: Math.round(hero.width),
    heroHeight: Math.round(hero.height),
    galleryScale: hero.width >= 225 && hero.height >= 340,
    singleColumnCatalog: units.length < 2 || Math.abs(units[0].left - units[1].left) < 2,
    controlsClear: nameplate.bottom + 4 <= evolution.top,
  };
});
await page.evaluate(() => window.hyRoute('codex', { direct: true }));
const recordTaxonomyChecks = await page.evaluate(() => ({
  screenTitle: document.querySelector('.screen.active .screen-title h1')?.textContent.trim() === '기록',
  navLabel: document.querySelector('.screen.active .nav button[data-route="codex"]')?.textContent.trim() === '기록',
  homeLabel: document.querySelector('.home-hit[data-screen="codex"]')?.getAttribute('aria-label') === '기록',
}));
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
await page.locator('#cardModeTabs [data-tab="craft"]').click();
const craftOnlyCount = await page.locator('#cardGrid [data-id]').count();
const craftLabels = await page.locator('#cardGrid .craft-only-mark').allTextContents();
await page.evaluate(() => { window.hyState.gold=200000; window.hyState.itemQty.mirror=2; window.hyState.itemQty.paper=40; window.hyRenderCards(); });
const craftBefore = await page.evaluate(() => ({gold:window.hyState.gold,mirror:window.hyState.itemQty.mirror,paper:window.hyState.itemQty.paper}));
await page.locator('#cardEvolve').click();
const craftAfter = await page.evaluate(() => ({gold:window.hyState.gold,mirror:window.hyState.itemQty.mirror,paper:window.hyState.itemQty.paper,made:window.hyState.craftedCards.includes('c088')}));
await page.locator('.screen.active .nav button[data-route="party"]').click();
await page.locator('#autoParty').click();
const partySize = await page.evaluate(() => window.hyState.party.length);
const partyRosterChecks = await page.evaluate(() => {
  const grid=document.querySelector('#rosterGrid'),head=document.querySelector('.party-side-head'),title=head?.querySelector('b'),fit=head?.querySelector('span');
  const overlap=(a,b)=>{if(!a||!b)return true;const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return x.left<y.right&&x.right>y.left&&x.top<y.bottom&&x.bottom>y.top};
  return {
    twoColumns:getComputedStyle(grid).gridTemplateColumns.split(' ').length===2,
    headerClear:!overlap(title,fit),
    craftedVisible:!!grid.querySelector('[data-id="c088"]'),
    craftLockedHidden:![...grid.querySelectorAll('[data-id]')].some(el=>['c077','c066','c011','c098'].includes(el.dataset.id)),
    inside:grid.getBoundingClientRect().right<=document.querySelector('.party-side-v6').getBoundingClientRect().right+1,
  };
});
const functionalChecks = {
  inventoryConsume: waterAfter === waterBefore - 1,
  shopPurchase: goldAfter < goldBefore,
  renderedCards: renderedCards > 0,
  craftOnlyCount: craftOnlyCount === 5,
  craftLabels: craftLabels.length === 5 && craftLabels.every(x => x.trim() === '제작'),
  craftTransaction: craftAfter.made && craftAfter.gold === craftBefore.gold - 45000 && craftAfter.mirror === craftBefore.mirror - 1 && craftAfter.paper === craftBefore.paper - 20,
  partySize: partySize === 5,
  partyRoster: Object.values(partyRosterChecks).every(Boolean),
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
  titleStabilityChecks,
  homeHitGeometry,
  readabilityChecks,
  internalHeadersPassed: internalHeaderChecks.every(Boolean),
  minimumFontsPassed: minimumFontChecks.every(x => x.offenders.length === 0),
  minimumFontChecks,
  cardPresentationChecks,
  recordTaxonomyChecks,
  utilityChecksPassed: utilityChecks.every(Boolean),
  utilityFontChecksPassed: utilityFontChecks.every(Boolean),
  routeFailures,
  journeyLinked,
  journeyActive,
  startupRecovery,
  functionalChecks,
  partyRosterChecks,
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
  !Object.entries(titleStabilityChecks).filter(([key]) => key !== 'targets').every(([,value]) => value === true) ||
  !homeHitGeometry.aligned ||
  !homeHitGeometry.separated ||
  !Object.values(readabilityChecks).every(Boolean) ||
  !internalHeaderChecks.every(Boolean) ||
  !minimumFontChecks.every(x => x.offenders.length === 0) ||
  !cardPresentationChecks.galleryScale ||
  !cardPresentationChecks.singleColumnCatalog ||
  !cardPresentationChecks.controlsClear ||
  !Object.values(recordTaxonomyChecks).every(Boolean) ||
  !utilityChecks.every(Boolean) ||
  !utilityFontChecks.every(Boolean) ||
  routeFailures.length !== 0 ||
  journeyActive !== 'journey' ||
  !journeyLinked?.includes('admin/dungeon-flow.html') ||
  startupRecovery !== 'home' ||
  !Object.values(functionalChecks).every(Boolean) ||
  cinematicCount !== 0 ||
  errors.length !== 0
) process.exit(1);
