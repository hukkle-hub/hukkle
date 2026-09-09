import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp' };
const server = createServer(async (req,res) => {
  try {
    const clean=decodeURIComponent((req.url||'/').split('?')[0]);
    const file=normalize(join(root,clean==='/'?'index.html':clean));
    if(!(await stat(file)).isFile())throw new Error('not file');
    res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'});res.end(await readFile(file));
  } catch { res.writeHead(404);res.end('not found'); }
});
await new Promise(resolve=>server.listen(4176,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
const page=await browser.newPage({viewport:{width:1279,height:599}});
page.setDefaultTimeout(8000);
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:4176/',{waitUntil:'domcontentloaded'});
await page.evaluate(()=>{sessionStorage.setItem('hy-title-passed','1')});
await page.reload({waitUntil:'networkidle'});

const assetChecks=await page.evaluate(async()=>Promise.all(Array.from({length:7},(_,i)=>fetch(`assets/dungeon-v75/stage-${String(i+1).padStart(2,'0')}-${['threshold','village','tidal-maze','ridge','ritual-rest','sea-cave','taboo-gate'][i]}.webp`).then(r=>r.ok))));

await page.evaluate(()=>{
  const s=window.hyState,c=window.hyCards.find(x=>x.id==='c071'),region=window.hyHomeRegionForCard(c);
  s.selectedCard=c.id;s.cardTab='evolution';s.cardStages[c.id]=5;s.cardFragments[c.id]=20;s.finalCards=(s.finalCards||[]).filter(id=>id!==c.id);delete s.finalSkillRolls[c.id];s.bossSeals[region]=3;window.hyRoute('cards',{direct:true});window.hyRenderCards();
});
await page.locator('#cardEvolve').click();
await page.locator('#cardEvolve').click();
const finalChecks=await page.evaluate(()=>{
  const s=window.hyState,c=window.hyCards.find(x=>x.id==='c071'),skills=window.hyFinalSkills(c),region=window.hyHomeRegionForCard(c);
  return{stage:s.cardStages[c.id],final:s.finalCards.includes(c.id),skills:skills.length,unique:new Set(skills.map(x=>x.id)).size,seals:s.bossSeals[region],button:document.querySelector('#cardEvolve')?.textContent};
});
await page.locator('#cardStory').click();
await page.waitForSelector('#cardLoreLayer.open');
const loreChecks=await page.evaluate(()=>{const selected=window.hyCards.find(x=>x.id===window.hyState.selectedCard);return{large:document.querySelector('#cardLoreLayer img')?.getBoundingClientRect().height>200,name:!!selected&&document.querySelector('#cardLoreLayer')?.innerText.includes(selected.name),sections:['사연 기록','전승과 고증 구분','흥양기에서의 조우','획득·성장'].every(x=>document.querySelector('#cardLoreLayer')?.innerText.includes(x))}});
await page.locator('#cardLoreLayer .lore-close').click();

const rewardChecks=await page.evaluate(async()=>{
  const s=window.hyState,frame=document.querySelector('#journeyFrame'),beforePaper=Number(s.itemQty.paper||0);s.bossSeals.yeoja=0;s.bossWeeklyMarks.yeoja=[];
  const send=data=>window.dispatchEvent(new MessageEvent('message',{data:{type:'hy-journey-reward',region:'yeoja',...data},source:frame.contentWindow}));
  send({source:'region-boss',materials:{paper:5},fragmentCardId:'c001',fragments:5,bossCardDrop:false});
  send({source:'region-boss',materials:{paper:5},fragmentCardId:'c001',fragments:5,bossCardDrop:true});
  await new Promise(r=>setTimeout(r,100));
  return{seals:s.bossSeals.yeoja,weeks:s.bossWeeklyMarks.yeoja.length,paper:Number(s.itemQty.paper||0)-beforePaper,fragments:s.cardFragments.c001,bossOwned:s.obtainedCards.includes(window.hyRegionBossCard.yeoja),bossStage:s.cardStages[window.hyRegionBossCard.yeoja]};
});

const report={assetChecks,finalChecks,loreChecks,rewardChecks,errors};
console.log(JSON.stringify(report));
await browser.close();server.close();
const pass=assetChecks.every(Boolean)&&finalChecks.stage===6&&finalChecks.final&&[2,3].includes(finalChecks.skills)&&finalChecks.unique===finalChecks.skills&&finalChecks.seals===0&&Object.values(loreChecks).every(Boolean)&&rewardChecks.seals===2&&rewardChecks.weeks===1&&rewardChecks.paper===10&&rewardChecks.fragments>=10&&rewardChecks.bossOwned&&rewardChecks.bossStage===6&&!errors.length;
if(!pass)process.exit(1);
