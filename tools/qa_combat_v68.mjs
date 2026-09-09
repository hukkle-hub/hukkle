import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const out = join(root, 'qa-combat');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp' };
const server = createServer(async (req, res) => {
  try {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (clean === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const file = normalize(join(root, clean === '/' ? 'index.html' : clean));
    if (!(await stat(file)).isFile()) throw new Error('not file');
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(resolve => server.listen(4175, '127.0.0.1', resolve));
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const regions = ['yeoja','nokdong','palyoung','geogeum','naro'];
const results = [];

for (const region of regions) {
  const page = await browser.newPage({ viewport: { width: 1279, height: 599 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:4175/admin/dungeon-flow.html?region=${region}&v=69.0.0`, { waitUntil:'networkidle' });
  await page.evaluate((id) => {
    localStorage.setItem('hy-dungeon-flow-v660', JSON.stringify({
      [id]: {
        routeDone:true,
        investigationComplete:true,
        clueStates:[0,1,2].map(() => ({ observed:true, verified:true, recorded:true, method:'qa', confidence:3 })),
        zones:[0,1,2,3,4],
        bossSeen:false,
        complete:false,
      },
    }));
  }, region);
  await page.reload({ waitUntil:'networkidle' });
  await page.waitForSelector('#bossIntro:not(.hidden)');
  await page.evaluate(() => window.postMessage({
    type:'hy-journey-context', companionCard:'qa-card', companionName:'검수 동행', companionRole:'수호 · 파훼', companionStage:1,
    companionImg:new URL('../assets/cards-v63/C075.webp', location.href).href,
    companionFinalImg:new URL('../assets/cards-v63/C075-final.webp', location.href).href,
    companionSkill:'검수 베기', companionManifest:'검수 동행 · 일곱 별 현현',
  }, location.origin));
  await page.locator('#confirmBoss').click();
  await page.waitForSelector('#battleShell.active');
  let actions = 0;
  while (!(await page.locator('#battleResult').evaluate(el => el.classList.contains('show'))) && actions < 18) {
    let selector;
    if (await page.locator('#manifestSkill').isEnabled()) selector = '#manifestSkill';
    else {
      const hint = await page.locator('#bossIntentHint').textContent();
      selector = hint.includes('파훼') ? '[data-skill="break"]' : hint.includes('수호') ? '[data-skill="guard"]' : '[data-skill="strike"]';
    }
    await page.locator(selector).click();
    actions += 1;
    await page.waitForFunction(() => document.querySelector('#battleResult')?.classList.contains('show') || [...document.querySelectorAll('#skillGrid button')].some(b => !b.disabled), null, { timeout:5000 });
  }
  const result = await page.evaluate((id) => {
    const saved=JSON.parse(localStorage.getItem('hy-dungeon-flow-v660')||'{}')?.[id];
    return {
      victory:document.querySelector('#battleResultTitle')?.textContent.includes('금기 봉합'),
      completed:saved?.battle?.completed===true,
      playerHp:parseInt(document.querySelector('#playerHpText')?.textContent||'0',10),
      turn:Number((document.querySelector('#battleTurn')?.textContent||'0').replace(/\D/g,'')),
      companion:document.querySelector('#battleCompanionName')?.textContent,
      manifestName:document.querySelector('#manifestTitle')?.textContent,
    };
  }, region);
  await page.screenshot({ path:join(out, `${region}-victory.png`) });
  results.push({ region, actions, ...result, errors });
  await page.close();
}

const report = { version:'69.0.0', regions:results, allPassed:results.every(r => r.victory && r.completed && r.playerHp > 0 && r.actions <= 18 && r.companion === '검수 동행' && r.errors.length === 0) };
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
server.close();
if (!report.allPassed) process.exit(1);
