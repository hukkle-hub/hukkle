import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=join(root,'qa-cinematic');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const path=decodeURIComponent(req.url.split('?')[0]);if(path==='/favicon.ico'){res.writeHead(204).end();return;}const file=join(root,path==='/'?'index.html':path);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'});res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(4176,'127.0.0.1',r));
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],report={};
page.on('pageerror',e=>errors.push(String(e)));
page.on('response',r=>{if(r.url().includes('card-battle-v85')&&r.status()>=400)errors.push('asset '+r.url());});
const origin=process.env.HY_LIVE_URL||'http://127.0.0.1:4176/';
const check=(ok,msg)=>{if(!ok)throw Error(msg)};
try{
 await page.goto(origin);await page.waitForFunction(()=>window.hyCards?.length===125);
 const party=await page.evaluate(()=>['c075','c001','c002','c121','c034'].map(id=>{const c=hyCards.find(c=>c.id===id);return {...c,stage:6,manifested:id==='c075',img:new URL(c.img,location.href).href,finalImg:new URL(c.finalImg||c.img,location.href).href};}));
 await page.evaluate(()=>localStorage.setItem('hy-dungeon-flow-v660',JSON.stringify({nokdong:{routeDone:true,routeVersion:73,investigationComplete:true,zones:[0,1,3,5,6],bossSeen:true}})));
 await page.goto(origin+'admin/dungeon-flow.html?region=nokdong');
 check((await page.locator('#bossName').textContent())==='얼굴 없는 기척','First introduction leaks identity');
 check(!(await page.locator('#sceneImg').getAttribute('src')).includes('boss'),'First introduction shows boss art');
 await page.evaluate(party=>{window.qaParty=party;postMessage({type:'hy-journey-context',party,companionCard:'c075',companionName:party[0].name,companionManifested:true},'*');},party);
 await page.locator('#confirmBoss').click();
 await page.waitForFunction(()=>window.hyBattleDirector?.running&&!hyPan.state().busy);
 check(await page.locator('#game').evaluate(e=>e.classList.contains('cb-first-encounter')),'First exploration missing');
 await page.screenshot({path:join(out,'first-encounter.png')});
 // Existing clears must immediately enable the combat presentation, including after a reload.
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('hy-dungeon-flow-v660'));s.nokdong.battle={completed:true,clears:1};localStorage.setItem('hy-dungeon-flow-v660',JSON.stringify(s));});
 await page.reload();
 await page.evaluate(party=>{postMessage({type:'hy-journey-context',party,companionCard:'c075',companionName:party[0].name,companionManifested:true},'*');},party);
 await page.locator('#confirmBoss').click();await page.waitForFunction(()=>hyBattleDirector.running&&!hyPan.state().busy);
 check(!(await page.locator('#game').evaluate(e=>e.classList.contains('cb-first-encounter'))),'Repeat still faceless');
 const before=await page.evaluate(()=>hyPan.state());
 await page.locator('[data-skill="'+before.response+'"]:visible').first().click();
 await page.waitForFunction(()=>!!document.querySelector('#battleShell').dataset.cardAction);
 await page.waitForTimeout(500);
 await page.screenshot({path:join(out,'exchange.png')});
 check((await page.locator('.cb-challenge b').textContent()).length>0,'Enemy card missing');
 await page.waitForFunction(t=>hyPan.state().turn>t&&!hyPan.state().busy,before.turn);
 check(await page.evaluate(()=>hyPan.state().knotsRemaining===6),'Counter did not resolve');
 report.viewports=[];
 for(const [width,height] of [[1280,720],[960,540],[844,390],[667,375]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(150);
  const geometry=await page.evaluate(()=>[...document.querySelectorAll('#skillGrid button,.cb-controls button,.pan-field-actions button')].filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect();return {label:e.textContent.trim(),inside:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));
  check(geometry.every(e=>e.inside&&e.hit),'Touch obstruction '+width+': '+JSON.stringify(geometry));
  check(await page.locator('#manifestSkill').isVisible(),'Manifest control hidden');
  check(await page.locator('.battle-actors').evaluate(e=>getComputedStyle(e).display==='none'),'Old actors visible');
  await page.screenshot({path:join(out,width+'-card-battle.png')});
  report.viewports.push({width,height,geometry});
 }
 await page.setViewportSize({width:1280,height:720});
 for(let i=0;i<3;i++){
  const s=await page.evaluate(()=>hyPan.state());
  await page.locator('[data-skill="'+s.response+'"]:visible').first().click();
  await page.waitForFunction(t=>hyPan.state().turn>t&&!hyPan.state().busy,s.turn,{timeout:15000});
 }
 check(await page.evaluate(()=>hyPan.state().manifestCardId==='c075'&&hyBattleDirector.manifested),'Incorrect manifested companion');
 await page.locator('.cb-motion').click();check(await page.evaluate(()=>hyBattleDirector.reduced),'Reduced motion');
 await page.screenshot({path:join(out,'manifested-hand.png')});
 report.director=await page.evaluate(()=>hyBattleDirector.diagnostics());
 check(report.director.failed.length===0,'Missing image '+JSON.stringify(report.director.failed));
 await page.locator('.cb-exit').click();await page.waitForURL('**/index.html');
 report.exit=true;
}catch(e){errors.push(String(e));}
finally{report.errors=errors;await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();server.close();if(errors.length)process.exitCode=1;}
