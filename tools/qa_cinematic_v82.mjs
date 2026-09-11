import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=join(root,'qa-cinematic');
await mkdir(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(req.url.split('?')[0]);if(p==='/favicon.ico'){res.writeHead(204);res.end();return;}const f=join(root,p==='/'?'index.html':p);res.writeHead(200,{'content-type':mime[extname(f)]||'application/octet-stream'});res.end(await readFile(f));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(4176,'127.0.0.1',r));
const b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
const ctx=await b.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}});
const p=await ctx.newPage(),errors=[],report={};
p.on('pageerror',e=>errors.push(String(e)));
const origin=process.env.HY_LIVE_URL||'http://127.0.0.1:4176/';
function check(v,m){if(!v)throw Error(m)}
try{
 await p.goto(origin);await p.waitForFunction(()=>window.hyCards?.length===125);
 const party=await p.evaluate(()=>['c075','c001','c002','c121','c034'].map(id=>{const c=hyCards.find(c=>c.id===id);return {...c,stage:6,manifested:id==='c075',img:new URL(c.img,location.href).href,finalImg:new URL(c.finalImg||c.img,location.href).href};}));
 await p.evaluate(()=>localStorage.setItem('hy-dungeon-flow-v660',JSON.stringify({nokdong:{routeDone:true,routeVersion:73,investigationComplete:true,zones:[0,1,3,5,6],bossSeen:true}})));
 await p.goto(origin+'admin/dungeon-flow.html?region=nokdong');
 await p.evaluate(party=>{window.qaParty=party;postMessage({type:'hy-journey-context',party,companionCard:'c075',companionName:'해신 당골',companionManifested:true},'*')},party);
 await p.locator('#confirmBoss').click();await p.waitForFunction(()=>hyBattleDirector?.running&&!hyPan.state().busy,null,{timeout:15000});
 await p.screenshot({path:join(out,'01-arena.png')});
 for(const [i,route] of ['기록','수호','의례','해령','심판','넋'].entries()){
  await p.evaluate(route=>{window.previewPromise=hyBattleDirector.play({card:qaParty[0],route,skill:route+' · 연출 검수',won:true,duration:1600,firstEncounter:true})},route);
  await p.waitForTimeout(700);await p.screenshot({path:join(out,'route-'+i+'.png')});await p.evaluate(()=>window.previewPromise);
 }
 for(let i=0;i<4;i++){
  const state=await p.evaluate(()=>hyPan.state());
  await p.locator('[data-skill="'+state.response+'"]:visible').first().click();
  await p.waitForFunction(t=>hyPan.state().turn>t&&!hyPan.state().busy,state.turn,{timeout:15000});
 }
 await p.screenshot({path:join(out,'02-manifest.png')});
 report.director=await p.evaluate(()=>hyBattleDirector.diagnostics());
 check(report.director.routes.length===6&&report.director.bossPoses.length===3&&report.director.manifested&&!report.director.sound&&report.director.failed.length===0,'motion coverage');
 report.oldActorHidden=await p.locator('.ain-actor').evaluate(e=>getComputedStyle(e).visibility==='hidden');
 check(report.oldActorHidden,'legacy actor overlaps');
 await p.getByRole('button',{name:'연출 간소화',exact:true}).click();
 check(await p.evaluate(()=>hyBattleDirector.reduced),'reduced motion control');
 report.viewports=[];
 for(const [width,height] of [[1280,720],[960,540],[844,390]]){
  await p.setViewportSize({width,height});await p.waitForTimeout(150);
  const checks=await p.evaluate(()=>[...document.querySelectorAll('#skillGrid .deployed-card,.director-controls button,.pan-field-actions button')].filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label')||e.textContent,inside:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));
  check(checks.every(c=>c.inside&&c.hit),'touch geometry '+width);report.viewports.push({width,height,checks});
  await p.screenshot({path:join(out,width+'-layout.png')});
 }
 const before=await p.evaluate(()=>hyBattleDirector.frames);
 await p.evaluate(()=>document.querySelector('#home5').click());await p.waitForTimeout(200);
 // Standalone page emits exit; embedded parent owns routing, so stop explicitly for cleanup.
 await p.evaluate(()=>window.hyBattleDirector?.stop());await p.waitForTimeout(100);
 report.cleanup=await p.evaluate(()=>!window.hyBattleDirector?.running);
 check(report.cleanup,'renderer cleanup');
}catch(e){errors.push(String(e))}
finally{report.errors=errors;const v=p.video();await p.close();await v.saveAs(join(out,'combat-v82.webm'));await ctx.close();await b.close();server.close();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(errors.length)process.exitCode=1;}
