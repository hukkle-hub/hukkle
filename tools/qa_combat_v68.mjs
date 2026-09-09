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
  await page.goto(`http://127.0.0.1:4175/admin/dungeon-flow.html?region=${region}&v=72.0.0`, { waitUntil:'networkidle' });
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
    type:'hy-journey-context', companionCard:'qa-card', companionName:'검수 동행', companionRole:'수호 · 파훼', companionStage:6, companionManifested:true,
    companionImg:new URL('../assets/cards-v63/C075.webp', location.href).href,
    companionFinalImg:new URL('../assets/battle-v70/C075-manifest-cutout.png', location.href).href,
    companionSkill:'검수 베기', companionManifest:'검수 동행 · 일곱 별 현현',
    party:[
      ['c075','해신 당골','C075.webp','C075-manifest-cutout.png',true,'밸런스','물길 진혼'],
      ['c071','진도씻김굿 무녀','C071.webp','C071-final.webp',false,'파훼','씻김 장단'],
      ['c045','제석할멈','C045.webp','C045-final.webp',false,'탱커','제석 수호'],
      ['c121','강림도령','C121.webp','C121-final.webp',true,'심판','저승 판결'],
      ['c034','바리공주','C034.webp','C034-final.webp',false,'지원','생명수 회복'],
    ].map(([id,name,img,finalImg,manifested,role,skill],slot)=>({id,name,img:new URL('../assets/cards-v63/'+img,location.href).href,finalImg:new URL((finalImg.endsWith('.png')?'../assets/battle-v70/':'../assets/cards-v63/')+finalImg,location.href).href,manifested,role,skill,stage:6,cost:slot===4?2:1,slot})),
  }, location.origin));
  await page.locator('#confirmBoss').click();
  await page.waitForSelector('#battleShell.active');
  await page.screenshot({ path:join(out, `${region}-battle-start.png`) });
  const sceneStart=await page.evaluate(()=>{const rail=document.querySelector('#raidRail'),units=[...document.querySelectorAll('#raidRail .raid-unit')],first=units[0]?.getBoundingClientRect(),last=units.at(-1)?.getBoundingClientRect();return {deployedCards:document.querySelectorAll('#skillGrid .deployed-card').length,raidUnits:units.length,raidVertical:!!first&&!!last&&last.top>first.bottom,knots:document.querySelectorAll('#knotGauge i').length,manifestActor:document.querySelector('#manifestActor')?.classList.contains('active'),ainVisible:document.querySelector('.ain-actor img')?.getBoundingClientRect().height>200,railVisible:rail?.getBoundingClientRect().height>150}});
  let actions = 0;
  let skillBannerSeen=false,criticalSeen=false,seventhMotionSeen=false;
  while (!(await page.locator('#battleResult').evaluate(el => el.classList.contains('show'))) && actions < 18) {
    let selector;
    if (await page.locator('#manifestSkill').isEnabled()) selector = '#manifestSkill';
    else {
      const hint = await page.locator('#bossIntentHint').textContent();
      selector = hint.includes('파훼') ? '[data-skill="break"]' : hint.includes('수호') ? '[data-skill="guard"]' : '[data-skill="strike"]';
    }
    const beforeSeq=await page.locator('#damageFloat').getAttribute('data-seq')||'0';
    await page.locator(selector).first().click();
    actions += 1;
    await page.waitForTimeout(120);
    seventhMotionSeen ||= await page.locator('#seventhSkillMotion').evaluate(el=>el.classList.contains('play'));
    await page.waitForFunction(seq => (document.querySelector('#damageFloat')?.dataset.seq||'0')!==seq, beforeSeq, { timeout:5000 });
    const fx=await page.evaluate(()=>({banner:document.querySelector('#skillBanner')?.classList.contains('play'),critical:document.querySelector('#damageFloat')?.dataset.critical==='true'}));
    if(fx.critical&&!criticalSeen)await page.screenshot({ path:join(out, `${region}-critical.png`) });
    skillBannerSeen ||= fx.banner; criticalSeen ||= fx.critical;
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
      criticalGold:/^[\d,]+$/.test(document.querySelector('#damageFloat')?.textContent||''),
      rewards:document.querySelectorAll('#battleResult.victory .reward-item').length,
    };
  }, region);
  await page.screenshot({ path:join(out, `${region}-victory.png`) });
  results.push({ region, actions, ...sceneStart, skillBannerSeen, criticalSeen, seventhMotionSeen, ...result, errors });
  await page.close();
}

const report = { version:'72.0.0', regions:results, allPassed:results.every(r => r.victory && r.completed && r.playerHp > 0 && r.actions <= 18 && r.companion.includes('검수 동행') && r.deployedCards===5 && r.raidUnits===5 && r.raidVertical && r.knots===7 && r.railVisible && r.rewards===4 && r.manifestActor && r.ainVisible && r.skillBannerSeen && r.criticalSeen && r.seventhMotionSeen && r.criticalGold && r.errors.length === 0) };
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
server.close();
if (!report.allPassed) process.exit(1);
