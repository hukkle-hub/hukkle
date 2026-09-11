import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=join(root,'qa-combat');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(req.url.split('?')[0]);if(p==='/favicon.ico'){res.writeHead(204);res.end();return;}const f=join(root,p==='/'?'index.html':p);res.writeHead(200,{'content-type':mime[extname(f)]||'application/octet-stream'});res.end(await readFile(f));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(4175,'127.0.0.1',r));await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
const page=await browser.newPage({viewport:{width:1279,height:599}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(String(e)));
const origin=process.env.HY_LIVE_URL||'http://127.0.0.1:4175/';
const regions=(process.env.HY_PAN_REGIONS||'yeoja,nokdong,palyoung,geogeum,naro').split(',');
function check(ok,msg){if(!ok)throw Error(msg);}
async function settled(){await page.waitForFunction(()=>window.hyPan?.state()&&!window.hyPan.state().busy,null,{timeout:15000});}
async function act(right=true){const before=await page.evaluate(()=>window.hyPan.state()),kind=right?before.response:['strike','guard','break'].find(k=>k!==before.response);await page.locator('[data-skill="'+kind+'"]:visible').first().click();await page.waitForFunction(t=>window.hyPan.state().turn>t||window.hyPan.state().won||window.hyPan.state().lost,before.turn,{timeout:15000});await settled();return {before,after:await page.evaluate(()=>window.hyPan.state())};}
try{
await page.goto(origin);await page.waitForFunction(()=>window.hyCards?.length===125);
const party=await page.evaluate(()=>['c001','c002','c075','c121','c034'].map(id=>{const c=hyCards.find(c=>c.id.toLowerCase()===id);return {...c,stage:6,manifested:id==='c075',img:new URL(c.img,location.href).href,finalImg:new URL(c.finalImg||c.img,location.href).href,skill:c.skills?.[5]?.name};}));
for(const region of regions){
await page.evaluate(region=>localStorage.setItem('hy-dungeon-flow-v660',JSON.stringify({[region]:{routeDone:true,investigationComplete:true,routeVersion:73,zones:[0,1,3,5,6],bossSeen:true}})),region);
await page.goto(origin+'admin/dungeon-flow.html?region='+region);
await page.evaluate(party=>window.postMessage({type:'hy-journey-context',party,companionCard:'c075',companionManifested:true,motion:false},'*'),party);
await page.locator('#confirmBoss').click();await settled();
const layout=await page.evaluate(()=>{const a=document.querySelector('.battle-actors').getBoundingClientRect(),h=document.querySelector('#skillGrid').getBoundingClientRect();return {actorsLower:a.top>=innerHeight*.5,handInside:h.bottom<=innerHeight+1,skills:document.querySelectorAll('.deployed-card').length};});
const director=await page.evaluate(()=>window.hyBattleDirector?.diagnostics());
check(director?.running&&director.failed.length===0,'cinematic stage: '+JSON.stringify(director));
check(layout.actorsLower&&layout.handInside&&layout.skills===5,'layout '+JSON.stringify(layout));
await page.screenshot({path:join(out,region+'-start.png')});
const miss=await act(false);check(miss.after.playerHp===100&&miss.after.knotsRemaining===7,'first encounter punishment');
for(let i=0;i<7;i++){const hit=await act();check(hit.after.knotsRemaining===6-i&&hit.after.playerHp===100,'clash cancellation');if(i===3)await page.screenshot({path:join(out,region+'-manifest.png')});}
const victory=await page.evaluate(()=>hyPan.state());check(victory.won&&victory.wins===7&&victory.manifestUsed,'seven knot victory/manifest');
await page.screenshot({path:join(out,region+'-victory.png')});
await page.locator('#battleResultSecondary').click();await settled();
const repeat=await act(false);check(repeat.after.playerHp<100&&repeat.after.knotsRemaining===7,'repeat counterattack');
const hit=await act();check(hit.after.playerHp>=hit.before.playerHp,'correct clash must cancel counter');
for(let i=0;i<15&&!(await page.evaluate(()=>hyPan.state().lost));i++)await act(false);
check(await page.evaluate(()=>hyPan.state().lost),'repeat defeat');
check(victory.manifestCardId==='c075','manifested companion must be the equipped 7-star');
const saved=await page.evaluate(region=>JSON.parse(localStorage.getItem('hy-dungeon-flow-v660'))[region].battle,region);
check(saved.clears===1&&saved.pan.knotsRemaining===0,'saved victory must survive defeat');
results.push({region,layout,victory,repeat:repeat.after,passed:true});
}
await page.goto(origin);await page.waitForFunction(()=>window.hyCards?.length===125);
await page.evaluate(()=>{
 sessionStorage.setItem('hy-title-passed','1');
 hyState.firstDestination='yeojaman';hyState.selectedRegion='yeojaman';hySave();hyRoute('home',{direct:true});
 localStorage.setItem('hy-dungeon-flow-v660',JSON.stringify({yeoja:{routeDone:true,routeVersion:73,investigationComplete:true,zones:[0,1,3,5,6],bossSeen:true}}));
});
await page.locator('.home-action').click();
const frame=page.frameLocator('#journeyFrame');
await frame.locator('#confirmBoss').click();
await page.waitForFunction(()=>{const w=document.querySelector('#journeyFrame').contentWindow;return w.hyPan?.state()&&!w.hyPan.state().busy;});
const embedded=await page.evaluate(()=>{const f=document.querySelector('#journeyFrame');return {src:f.getAttribute('src'),nested:f.contentDocument.querySelectorAll('iframe').length,version:f.contentWindow.hyPan.version,party:f.contentDocument.documentElement.dataset.partyCount};});
check(embedded.src.includes('/dungeon-flow.html?')&&embedded.nested===0&&embedded.version==='82.0.0'&&embedded.party==='5','embedded integration '+JSON.stringify(embedded));
await page.screenshot({path:join(out,'embedded-battle.png')});
results.push({embedded,passed:true});
}catch(e){errors.push(String(e));}finally{await writeFile(join(out,'report.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));await browser.close();server.close();if(results.length!==regions.length+1||errors.length)process.exitCode=1;}
