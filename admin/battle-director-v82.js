/* 흥양기 cinematic combat renderer. Rendering only; rules and rewards stay in dungeon-flow. */
(() => {
'use strict';
const W=1280,H=720,AS='../assets/battle-v82/';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=t=>1-Math.pow(1-clamp(t),3);
const ROUTES={
 '기록':{pose:2,arc:-100,x:24,y:-6},
 '수호':{pose:3,arc:65,x:8,y:0},
 '의례':{pose:5,arc:-160,x:0,y:-8},
 '해령':{pose:2,arc:100,x:38,y:-4},
 '심판':{pose:5,arc:-235,x:14,y:-5},
 '넋':{pose:5,arc:170,x:0,y:-10}
};
const arenas={
 nokdong:AS+'nokdong-arena.png',
 yeoja:'../assets/explore-v79/yeoja-clue-02-living-traces.webp',
 palyoung:'../assets/travel-v78/palyoung-eight-peaks.webp',
 geogeum:'../assets/explore-v79/geogeum-clue-02-repeating-markers.webp',
 naro:'../assets/travel-v78/naro-space-harbor.webp'
};
class Director{
 constructor(root){
  this.root=root;this.assets=new Map();this.failed=[];this.pose=0;this.running=false;this.action=null;this.manifested=false;this.sound=false;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.frames=0;this.maxGap=0;this.poseHistory=new Set();this.bossPoseHistory=new Set();this.routeHistory=new Set();
  this.canvas=document.createElement('canvas');this.canvas.id='cinematicStage';this.canvas.setAttribute('aria-label','지역 보스와 아인의 전투 무대');root.prepend(this.canvas);this.ctx=this.canvas.getContext('2d',{alpha:false});
  this.caption=document.createElement('div');this.caption.className='director-caption';this.caption.setAttribute('aria-live','polite');root.append(this.caption);
  this.controls=document.createElement('div');this.controls.className='director-controls';
  this.controls.innerHTML='<button type="button" data-director="sound" aria-pressed="false">소리 켜기</button><button type="button" data-director="motion" aria-pressed="false">연출 간소화</button>';
  this.controls.onclick=e=>{const k=e.target.dataset.director;if(k==='sound'){this.sound=!this.sound;e.target.textContent=this.sound?'소리 끄기':'소리 켜기';e.target.setAttribute('aria-pressed',this.sound);if(this.sound)this.audio();}if(k==='motion'){this.reduced=!this.reduced;e.target.textContent=this.reduced?'전체 연출':'연출 간소화';e.target.setAttribute('aria-pressed',this.reduced);}};
  root.append(this.controls);this.abort=new AbortController();
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.audioCtx?.suspend();else if(this.sound)this.audioCtx?.resume();},{signal:this.abort.signal});
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(root);
 }
 resize(){const r=this.root.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5);this.canvas.width=Math.max(1,Math.round(r.width*dpr));this.canvas.height=Math.max(1,Math.round(r.height*dpr));}
 async load(url,keyed=false){
  const key=url+keyed;if(this.assets.has(key))return this.assets.get(key);
  const promise=new Promise(resolve=>{const img=new Image();let done=false;const timer=setTimeout(()=>finish(null),7000);const finish=v=>{if(done)return;done=true;clearTimeout(timer);resolve(v);};img.onload=()=>{
   if(!keyed)return finish(img);
   try{
    const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);
    const d=x.getImageData(0,0,c.width,c.height),p=d.data;
    // Chroma matte is decoded at render time; original generation remains unchanged.
    let keyedPixels=0;
    for(let i=0;i<p.length;i+=4){const r=p[i],g=p[i+1],b=p[i+2],key=Math.min(r,b)-g;if(r>25&&b>25&&key>10){keyedPixels++;const alpha=1-clamp((key-10)/30);p[i+3]=Math.round(p[i+3]*alpha);p[i]=Math.min(r,g+10);p[i+2]=Math.min(b,g+10);}}
    if(keyedPixels<c.width*c.height*.04){this.failed.push('invalid-matte:'+url);return finish(null);}
    if(url.includes('/boss-')){
     const width=c.width,height=c.height;
     // Reject isolated pieces leaking across atlas cells; keep the main silhouette.
     for(let cell=0;cell<3;cell++){
      const left=Math.floor(cell*width/3),right=Math.floor((cell+1)*width/3),cw=right-left;
      const seen=new Uint8Array(cw*height),parts=[];let largest=0;
      for(let n=0;n<seen.length;n++){
       if(seen[n])continue;seen[n]=1;
       const gx=left+n%cw,gy=Math.floor(n/cw);if(p[(gy*width+gx)*4+3]<40)continue;
       const queue=[n];for(let k=0;k<queue.length;k++){const at=queue[k],cx=at%cw,cy=Math.floor(at/cw);
        for(const nn of [cx?at-1:-1,cx<cw-1?at+1:-1,cy?at-cw:-1,cy<height-1?at+cw:-1]){if(nn<0||seen[nn])continue;seen[nn]=1;const xx=left+nn%cw,yy=Math.floor(nn/cw);if(p[(yy*width+xx)*4+3]>=40)queue.push(nn);}
       }parts.push(queue);largest=Math.max(largest,queue.length);
      }
      for(const part of parts)if(part.length<largest*.10)for(const n of part)p[(Math.floor(n/cw)*width+left+n%cw)*4+3]=0;
     }
    }
    x.putImageData(d,0,0);finish(c);
   }catch(e){this.failed.push(url);finish(img);}
  };img.onerror=()=>{this.failed.push(url);finish(null)};img.src=url;});
  this.assets.set(key,promise);return promise;
 }
 async start({region,party,companion,heat=0}){
  const token=this.token=(this.token||0)+1;this.stop(false);this.region=region;this.party=party;this.companion=companion;this.heat=heat;this.manifested=false;this.action=null;this.caption.textContent='';
  const [bg,boss,ain,companionSprite]=await Promise.all([this.load(arenas[region]),this.load(AS+'boss-'+region+'.png',true),this.load(AS+'ain-poses.png',true),this.load(AS+'companion-poses.png',true)]);
  if(token!==this.token)return false;
  if(!bg||!boss||!ain){this.root.dataset.directorFallback='true';return false;}
  this.bg=bg;this.boss=boss;this.ain=ain;this.companionSprite=companionSprite;this.root.closest('#game').classList.add('cinematic-v82');this.resize();this.running=true;this.last=performance.now();this.tick(this.last);return true;
 }
 stop(clear=true){this.running=false;cancelAnimationFrame(this.raf);if(this.pending){this.pending();this.pending=null;}this.action=null;this.root.dataset.directorPhase='idle';if(clear)this.root.closest('#game').classList.remove('cinematic-v82');}
 sync({heat,won,lost}){this.heat=heat||0;this.won=won;this.lost=lost;}
 audio(){if(!this.sound)return;try{if(!this.audioCtx)this.audioCtx=new(window.AudioContext||window.webkitAudioContext)();this.audioCtx.resume();}catch{this.sound=false;}}
 cue(kind){
  if(!this.sound)return;this.audio();const c=this.audioCtx;if(!c)return;
  const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(kind==='impact'?115:230,c.currentTime);o.frequency.exponentialRampToValueAtTime(kind==='impact'?45:130,c.currentTime+.16);g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.08,c.currentTime+.008);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.28);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+.3);
 }
 async play({card,skill,route,won,duration,firstEncounter}){
  if(!this.running)return;
  const art=card?.img?await this.load(card.img):null;
  const ms=this.reduced?320:Math.max(480,duration||920);
  this.action={start:performance.now(),ms,route:ROUTES[route]?route:'기록',won,firstEncounter,art,skill:skill||'기록의 수',card,kind:'clash',hit:false};
  this.routeHistory.add(this.action.route);
  this.root.dataset.directorPhase='anticipation';this.root.dataset.directorRoute=this.action.route;this.caption.innerHTML='';
  const name=document.createElement('strong');name.textContent=this.action.skill;const sub=document.createElement('span');sub.textContent=card?.name||'아인 · 기록자';this.caption.append(sub,name);this.caption.classList.add('show');
  await new Promise(resolve=>{this.pending=resolve;this.timer=setTimeout(()=>this.finishAction(),ms+1000);});
 }
 async manifest(card,label){
  if(!this.running)return;
  this.companion=card;this.companionPortrait=card?.id?.toLowerCase()==='c075'?null:await this.load(card.finalImg||card.img);
  this.manifested=true;
  this.action={start:performance.now(),ms:this.reduced?360:1900,kind:'manifest',route:'의례',won:true,hit:false,card};
  this.caption.textContent=label||'동행자가 판에 내려옵니다';this.caption.classList.add('show');
  await new Promise(resolve=>{this.pending=resolve;this.timer=setTimeout(()=>this.finishAction(),2900);});
 }
 finishAction(){clearTimeout(this.timer);this.action=null;this.root.dataset.directorPhase='idle';this.caption.classList.remove('show');const f=this.pending;this.pending=null;f?.();}
 tick(now){
  if(!this.running)return;
  if(!this.root.classList.contains('active')||this.root.closest('#game')?.dataset.phase!=='boss'){this.stop();return;}
  const dt=now-this.last;this.maxGap=Math.max(this.maxGap,dt);this.last=now;
  if(!document.hidden)this.draw(now);
  if(this.action&&now-this.action.start>=this.action.ms)this.finishAction();
  this.frames++;this.raf=requestAnimationFrame(t=>this.tick(t));
 }
 cover(img,x,y,w,h){if(!img)return;const iw=img.width,ih=img.height,s=Math.max(w/iw,h/ih);this.ctx.drawImage(img,x+(w-iw*s)/2,y+(h-ih*s)/2,iw*s,ih*s);}
 sprite(img,frame,cols,rows,x,y,w,h,rotation=0,alpha=1){
  if(!img)return;const c=this.ctx,sw=img.width/cols,sh=img.height/rows;c.save();c.globalAlpha=alpha;c.translate(x,y);c.rotate(rotation);c.drawImage(img,(frame%cols)*sw,Math.floor(frame/cols)*sh,sw,sh,-w/2,-h,w,h);c.restore();
 }
 shadow(x,y,w){const c=this.ctx;c.save();c.translate(x,y);c.scale(w,8);const g=c.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'rgba(0,0,0,.65)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(-1,-1,2,2);c.restore();}
 technique(a,p){
  if(!a.art||p<.24||p>.79)return;
  const c=this.ctx,q=clamp((p-.24)/.45),fade=Math.min(1,q*5,(1-q)*5);
  const paper=(x,y,rot,w=38,h=58,opacity=1)=>{c.save();c.globalAlpha=fade*opacity;c.translate(x,y);c.rotate(rot);c.shadowColor='#061017';c.shadowBlur=8;c.drawImage(a.art,-w/2,-h/2,w,h);c.restore();};
  switch(a.route){
   case '수호':
    for(let i=0;i<3;i++)paper(625+i*36,422-Math.sin((i+1)*Math.PI/4)*55*ease(q),.12*(i-1),32,68);
    break;
   case '의례':
    for(let i=0;i<4;i++){const angle=i*Math.PI/2+q*2;paper(650+Math.cos(angle)*75,400+Math.sin(angle)*24,-angle*.25,28,46);}
    break;
   case '해령':
    // Refracted water, sampled from the actual environment, sweeps toward the target.
    c.save();c.globalAlpha=fade*.42;
    for(let i=0;i<7;i++){const xx=620+q*190-i*12,yy=475-i*5;c.drawImage(this.bg,this.bg.width*.44,this.bg.height*.56,this.bg.width*.16,this.bg.height*.08,xx,yy,85,8+i*2);}
    c.restore();paper(620+q*190,425-Math.sin(q*Math.PI)*28,-q*.5,36,56);break;
   case '심판':
    paper(785,195+ease(q)*170,Math.PI*.03,44,78);break;
   case '넋':
    for(let i=0;i<3;i++)paper(760+i*24,510-ease(q)*(140+i*18),Math.sin(q*3+i)*.12,30,50,.5+i*.2);
    break;
   default:
    for(let i=0;i<3;i++){const f=clamp(q-i*.09);paper(630+f*165,425-f*80-Math.sin(f*Math.PI)*55,(f-.5)*.7,30,46,1-i*.2);}
  }
 }
 draw(now){
  const c=this.ctx;c.setTransform(this.canvas.width/W,0,0,this.canvas.height/H,0,0);
  const t=now/1000,a=this.action,p=a?clamp((now-a.start)/a.ms):0,route=ROUTES[a?.route]||ROUTES['기록'];
  const anticipation=a?.kind==='clash'&&p<.3,release=a?.kind==='clash'&&p>=.3&&p<.65,impact=a?.kind==='clash'&&p>=.6&&p<.8;
  const motion=this.reduced?0:1,hit=impact?Math.sin((p-.6)*80)*3*motion:0;
  c.fillStyle='#081015';c.fillRect(0,0,W,H);
  this.cover(this.bg,-10+Math.sin(t*.13)*3*motion,-4,W+20,H+8);
  c.fillStyle='rgba(5,13,21,.23)';c.fillRect(0,0,W,H);
  // Boss scale is fixed. Threat comes from pose, cloth and air, never zooming the boss.
  const bossFrame=anticipation||release?1:impact&&a.won?2:0,bx=820+hit,by=531;
  this.bossPoseHistory.add(bossFrame);
  this.shadow(bx,by-3,118);
  this.sprite(this.boss,bossFrame,3,1,bx,by+Math.sin(t*1.1)*1.8*motion,270,440,impact&&a.won?-.035*motion:0);
  // Fine environmental rain is separate from skill effects and does not flash.
  if(!this.reduced){c.strokeStyle='rgba(187,215,226,.13)';c.lineWidth=.7;for(let i=0;i<46;i++){const x=(i*113.7+t*16)%W,y=(i*61+t*(125+this.heat*5))%H;c.beginPath();c.moveTo(x,y);c.lineTo(x-3,y+12);c.stroke();}}
  c.fillStyle='rgba(153,175,177,.03)';for(let i=0;i<3;i++){c.beginPath();c.ellipse(300+i*420+Math.sin(t*.2+i)*30,480+i*16,320,18,0,0,Math.PI*2);c.fill();}
  let pose=a?.kind==='manifest'?5:anticipation?1:release||impact?route.pose:a&&!a.won&&!a.firstEncounter&&p>.72?4:0;
  this.poseHistory.add(pose);
  const drive=a?.kind==='clash'?Math.sin(p*Math.PI)*motion:0;
  this.shadow(590,562,62);this.sprite(this.ain,pose,3,2,590+route.x*drive,568+route.y*drive,176,255,-.015*Math.sin(t*1.5)*motion);
  if(this.manifested){
   const alpha=a?.kind==='manifest'?ease(p*2):1;
   this.shadow(395,560,68);
   if(this.companion?.id?.toLowerCase()==='c075'&&this.companionSprite){
    const cp=a?.kind==='manifest'?5:a?.card?.id===this.companion.id?pose:0;
    this.sprite(this.companionSprite,cp,3,2,395,568+Math.sin(t)*1.5*motion,175,260,0,alpha);
   }else if(this.companionPortrait){c.save();c.globalAlpha=alpha;c.beginPath();c.ellipse(395,445,70,120,0,0,Math.PI*2);c.clip();this.cover(this.companionPortrait,325,325,140,240);c.restore();}
  }
  if(a?.kind==='clash'){
   this.technique(a,p);
   // A single contact pulse, followed by recoil. Never a full-screen white flash.
   if(impact){if(!a.hit){a.hit=true;this.cue('impact');this.root.dataset.directorPhase=a.won?'clash-win':'clash-loss';}
    c.save();c.translate(790,350);c.globalAlpha=(1-clamp((p-.6)/.2))*.55;c.strokeStyle=a.won?'#dec599':'#9b6864';c.lineWidth=2;c.beginPath();c.moveTo(-18,-22);c.lineTo(16,24);c.moveTo(18,-14);c.lineTo(-17,15);c.stroke();c.restore();
   }else this.root.dataset.directorPhase=anticipation?'anticipation':release?'release':'recovery';
  }
  const v=c.createLinearGradient(0,510,0,H);v.addColorStop(0,'rgba(4,9,13,0)');v.addColorStop(1,'rgba(4,9,13,.94)');c.fillStyle=v;c.fillRect(0,510,W,210);
 }
 diagnostics(){return {version:'82.0.0',running:this.running,region:this.region,frames:this.frames,failed:[...this.failed],manifested:this.manifested,route:this.root.dataset.directorRoute||null,phase:this.root.dataset.directorPhase||'idle',reduced:this.reduced,poses:[...this.poseHistory],bossPoses:[...this.bossPoseHistory],routes:[...this.routeHistory],sound:this.sound};}
}
window.HYBattleDirector=Director;
})();
