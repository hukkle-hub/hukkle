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
await page.goto('http://127.0.0.1:4174/admin/dungeon-flow.html?region=yeoja&v=79.0.0', { waitUntil: 'networkidle', timeout:15000 });

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
const travelExperience = await page.evaluate(() => { const passport=document.querySelector('.travel-passport')?.getBoundingClientRect(),steps=[...document.querySelectorAll('#routeSteps .route-step')],badges=[...document.querySelectorAll('#tourismBadges span')]; return {passportInside:!!passport&&passport.top>=0&&passport.right<=innerWidth&&passport.bottom<=innerHeight,verticalSteps:steps.length===4&&steps[3].getBoundingClientRect().top>steps[0].getBoundingClientRect().bottom,tourismBadges:badges.length,area:document.querySelector('#travelArea')?.textContent,discovery:document.querySelector('#travelDiscoveries')?.textContent}; });
for (let i = 0; i < 4; i += 1) await page.locator('#nextTravel').click();
await page.waitForSelector('#game[data-phase="explore"]');
phases.explore = await snapshot('02-explore');

const markerChecks = await page.evaluate(() => [...document.querySelectorAll('.hotspot')].map(el => {
  const r = el.getBoundingClientRect();
  return { label: el.textContent.trim(), width: r.width, height: r.height, visible: r.width >= 120 && r.height >= 44 };
}));

const clueArts=[];
for (let clue = 0; clue < 3; clue += 1) {
  if (!(await page.locator('#investSheet').evaluate(el => el.classList.contains('open')))) await page.locator('#nextClue').click();
  await page.waitForFunction(() => document.querySelector('#sceneImg')?.complete && document.querySelector('#sceneImg')?.naturalWidth > 0);
  clueArts.push(await page.locator('#sceneImg').evaluate(img => ({src:img.getAttribute('src'),width:img.naturalWidth,height:img.naturalHeight})));
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

let stageLayout = null;
const stageArts = [];
for (let zone = 0; zone < 7; zone += 1) {
  await page.locator(`.zone[data-i="${zone}"]`).click();
  await page.waitForSelector('#stageSheet.open');
  await page.waitForFunction(() => document.querySelector('#sceneImg')?.complete && document.querySelector('#sceneImg')?.naturalWidth > 0);
  stageArts.push(await page.locator('#sceneImg').evaluate(img => ({src:img.getAttribute('src'),width:img.naturalWidth,height:img.naturalHeight})));
  if (zone === 0) {
    stageLayout = await page.locator('#stageSheet').evaluate(el => { const r=el.getBoundingClientRect(); return {inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,choices:el.querySelectorAll('#stageChoices button').length}; });
    await page.screenshot({ path: join(out, '03b-dungeon-stage.png') });
  }
  await page.locator('#stageChoices [data-choice="safe"]').click();
}
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
const fxChecks = {};
for (const skill of ['break','guard','strike','break']) {
  const beforeSeq=await page.locator('#damageFloat').getAttribute('data-seq')||'0';
  await page.locator(`[data-skill="${skill}"]`).first().click();
  await page.waitForFunction(seq => (document.querySelector('#damageFloat')?.dataset.seq||'0')!==seq, beforeSeq, { timeout:5000 });
  fxChecks[skill] = await page.locator('#skillFx').evaluate((el,kind) => el.classList.contains('play') && el.classList.contains(kind), skill);
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
    fontOffenders:[...document.querySelectorAll('#battleShell *')].filter(el => el.offsetParent && el.textContent.trim() && parseFloat(getComputedStyle(el).fontSize)<12).map(el=>({tag:el.tagName,id:el.id,cls:el.className,size:getComputedStyle(el).fontSize,text:el.textContent.trim().slice(0,30)})),
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
const promoPage=await browser.newPage({viewport:{width:1279,height:599}});
promoPage.on('pageerror',error=>errors.push(String(error)));
await promoPage.goto('http://127.0.0.1:4174/admin/dungeon-flow.html?region=nokdong&v=79.0.0',{waitUntil:'networkidle',timeout:15000});
await promoPage.locator('#nextTravel').click();
await promoPage.waitForFunction(()=>document.querySelector('#sceneImg')?.complete&&document.querySelector('#sceneImg')?.naturalWidth>0);
await promoPage.screenshot({path:join(out,'00-nokdong-travel-promo.png')});
const travelPromo=await promoPage.evaluate(()=>({area:document.querySelector('#travelArea')?.textContent,badges:[...document.querySelectorAll('#tourismBadges span')].map(x=>x.textContent),image:document.querySelector('#sceneImg')?.getAttribute('src'),imageWidth:document.querySelector('#sceneImg')?.naturalWidth,captionVisible:document.querySelector('.travel-caption')?.getBoundingClientRect().width>300,passportVisible:document.querySelector('.travel-passport')?.getBoundingClientRect().height>200}));
await promoPage.close();
const regionalTravelAssets=[];
const regionalExploreAssets=[];
for(const region of ['yeoja','nokdong','palyoung','geogeum','naro']){
  const regionPage=await browser.newPage({viewport:{width:1279,height:599}});
  regionPage.on('pageerror',error=>errors.push(String(error)));
  await regionPage.goto(`http://127.0.0.1:4174/admin/dungeon-flow.html?region=${region}&v=79.0.0`,{waitUntil:'networkidle',timeout:15000});
  await regionPage.waitForFunction(()=>document.querySelector('#sceneImg')?.complete&&document.querySelector('#sceneImg')?.naturalWidth>0);
  regionalTravelAssets.push(await regionPage.evaluate(region=>{const img=document.querySelector('#sceneImg');return {region,src:img?.getAttribute('src'),width:img?.naturalWidth,height:img?.naturalHeight};},region));
  await regionPage.locator('#skipTravel').click();
  await regionPage.waitForSelector('#game[data-phase="explore"]');
  for(let clue=0;clue<3;clue++){
    await regionPage.locator(`#clueList [data-i="${clue}"]`).click();
    await regionPage.waitForFunction(()=>document.querySelector('#sceneImg')?.complete&&document.querySelector('#sceneImg')?.naturalWidth>0);
    regionalExploreAssets.push(await regionPage.evaluate(({region,clue})=>{const img=document.querySelector('#sceneImg');return {region,clue,src:img?.getAttribute('src'),width:img?.naturalWidth,height:img?.naturalHeight};},{region,clue}));
    if(region==='geogeum'&&clue===2)await regionPage.screenshot({path:join(out,'00-geogeum-clue-03.png')});
    await regionPage.locator('#closeInvest').click();
  }
  await regionPage.close();
}
const report = { phases, travelExperience, travelPromo, regionalTravelAssets, regionalExploreAssets, clueArts, markerChecks, clueCount, dungeonEnabled, stageLayout, stageArts, zoneCount, bossEnabled, manifestReady, fxChecks, layout, battleLayout, completed, errors };
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
server.close();
console.log(JSON.stringify(report));

const hdScenes = ['travel','explore','dungeon'].every(key => phases[key].image.width >= 1600 && phases[key].image.height >= 900 && phases[key].image.visible);
if (!hdScenes || !travelExperience.passportInside || !travelExperience.verticalSteps || travelExperience.tourismBadges!==4 || travelPromo.area!=='도양읍 · 녹동항' || travelPromo.badges.length!==4 || !travelPromo.image?.includes('travel-v78/nokdong-night-harbor.webp') || travelPromo.imageWidth<1900 || !travelPromo.captionVisible || !travelPromo.passportVisible || regionalTravelAssets.length!==5 || !regionalTravelAssets.every(x=>x.src?.includes('travel-v78/')&&x.width===1920&&x.height===1080) || clueArts.length!==3 || new Set(clueArts.map(x=>x.src)).size!==3 || !clueArts.every(x=>x.width===1920&&x.height===1080) || regionalExploreAssets.length!==15 || !regionalExploreAssets.every(x=>x.width===1920&&x.height===1080) || !['yeoja','nokdong','palyoung','geogeum','naro'].every(region=>new Set(regionalExploreAssets.filter(x=>x.region===region).map(x=>x.src)).size===3) || !regionalExploreAssets.filter(x=>x.clue>0).every(x=>x.src?.includes('explore-v79/')) || markerChecks.length !== 3 || !markerChecks.every(x => x.visible) || clueCount?.trim() !== '기록 3 / 3' || !dungeonEnabled || !stageLayout?.inside || stageLayout.choices !== 2 || stageArts.length!==7 || !stageArts.every((x,i)=>x.src?.includes(`dungeon-v75/stage-0${i+1}`)&&x.width>=1600&&x.height>=900) || zoneCount !== 7 || !bossEnabled || !manifestReady || !Object.values(fxChecks).every(Boolean) || !Object.values(layout).every(Boolean) || !Object.values(battleLayout).every(Boolean) || !completed || errors.length) process.exit(1);
