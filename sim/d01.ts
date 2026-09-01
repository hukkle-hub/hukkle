/* D01 흥양 저잣거리 — 실제 엔진으로 1,000회 돌려 어디서 왜 죽는지 잰다.
   짐작으로 밸런스를 만지지 않는다. */
import { battle, RULE, RNG } from "../api/engine.ts";
import { RULE2 } from "../api/rules.ts";

const TIERS = [
  { tier:1, ap:140, dp:55, hp:700, cost:12, spd_base:80 },
  { tier:2, ap:238, dp:94, hp:1190, cost:19, spd_base:90 },
  { tier:3, ap:405, dp:159, hp:2023, cost:30, spd_base:100 },
  { tier:4, ap:688, dp:270, hp:3439, cost:46, spd_base:110 },
  { tier:5, ap:1403, dp:551, hp:7016, cost:82, spd_base:120 },
];

// 시작 카드 5장 (서버 /player/init 과 동일)
const STARTERS = [
  { id:"C001", name:"벅수",     faction:"당",   role:"탱커",   skill_type:"buff",   skill_rate:10, skill_coef:0,   spd_mod:-7,
    leader_effect:{ops:[{op:"stat",pct:6,stat:"dp",filter:"all"}],text:"장승 안쪽"} },
  { id:"C005", name:"정화수",   faction:"당",   role:"밸런스", skill_type:"heal",   skill_rate:12, skill_coef:0.5, spd_mod:-10 },
  { id:"C041", name:"갯것",     faction:"물",   role:"밸런스", skill_type:"single", skill_rate:8,  skill_coef:1,   spd_mod:11 },
  { id:"C046", name:"낙지귀신", faction:"물",   role:"암살자", skill_type:"single", skill_rate:9,  skill_coef:1.1, spd_mod:13 },
  { id:"C081", name:"몽달귀",   faction:"저승", role:"밸런스", skill_type:"single", skill_rate:10, skill_coef:1.2, spd_mod:-2 },
];

// D01 은 factions:["당"] — 적 풀은 당 카드 전체(히든 제외)
const FOE_POOL = [
  { id:"C015", role:"밸런스", skill_type:"buff",    skill_rate:12, skill_coef:0,   spd_mod:-13 },
  { id:"C005", role:"밸런스", skill_type:"heal",    skill_rate:12, skill_coef:0.5, spd_mod:-10 },
  { id:"C008", role:"밸런스", skill_type:"heal",    skill_rate:10, skill_coef:0.4, spd_mod:-8  },
  { id:"C004", role:"밸런스", skill_type:"debuff",  skill_rate:10, skill_coef:0,   spd_mod:-8  },
  { id:"C002", role:"밸런스", skill_type:"single",  skill_rate:8,  skill_coef:1.1, spd_mod:-10 },
  { id:"C026", role:"밸런스", skill_type:"aoe",     skill_rate:10, skill_coef:0.9, spd_mod:-9  },
  { id:"C006", role:"밸런스", skill_type:"single",  skill_rate:8,  skill_coef:1.2, spd_mod:-13 },
  { id:"C012", role:"탱커",   skill_type:"buff",    skill_rate:12, skill_coef:0,   spd_mod:-7  },
  { id:"C010", role:"탱커",   skill_type:"heal",    skill_rate:12, skill_coef:0.6, spd_mod:-12 },
  { id:"C001", role:"탱커",   skill_type:"buff",    skill_rate:10, skill_coef:0,   spd_mod:-7  },
  { id:"C013", role:"탱커",   skill_type:"seal",    skill_rate:8,  skill_coef:0,   spd_mod:-2  },
  { id:"C007", role:"탱커",   skill_type:"buff",    skill_rate:10, skill_coef:0,   spd_mod:-9  },
  { id:"C011", role:"암살자", skill_type:"debuff",  skill_rate:10, skill_coef:1,   spd_mod:-11 },
  { id:"C014", role:"암살자", skill_type:"debuff",  skill_rate:8,  skill_coef:0.9, spd_mod:-7  },
].map(c => ({ ...c, name:c.id, faction:"당" }));

const DUN = { id:"D01", level_req:1, factions:["당"] };

function mkUs(tier = 1, lvl = 1) {
  const k = 1 + (lvl - 1) * 0.015;
  return STARTERS.map((c, i) => {
    const t = TIERS[tier - 1], r = RULE.ROLE[c.role];
    return {
      uid:"u"+i, card_id:c.id, name:c.name, faction:c.faction, role:c.role, tier, side:"us",
      ap:t.ap*r.ap*k, dp:t.dp*r.dp*k, hp:t.hp*r.hp*k, maxhp:t.hp*r.hp*k,
      spd:t.spd_base+(c.spd_mod??0)+r.spd, gauge:0, alive:true,
      skill_type:c.skill_type, skill_coef:c.skill_coef, skill_rate:c.skill_rate,
      unique_effect:null, unique_unlocked:false, buffs:[], dots:[], uniqueUsed:false, cd:0,
    };
  });
}

function mkFoes(step, rng, steps, foeK=1, bossMult=1.45, bossTier=1) {
  const boss = step >= steps;
  const lvReq = DUN.level_req;
  const tier = Math.max(1, Math.min(4, Math.ceil(lvReq/22) + (boss?bossTier:0)));
  const n = boss ? 3 : RULE2.PARTY_SIZE;
  const k = (1 + lvReq*0.012) * (boss ? bossMult : 1.0) * foeK;
  const out = [];
  for (let i=0;i<n;i++){
    const c = rng.pick(FOE_POOL), t = TIERS[tier-1], r = RULE.ROLE[c.role];
    out.push({ uid:`e${step}_${i}`, card_id:c.id, name:c.name, faction:"당", role:c.role,
      tier, side:"them", ap:t.ap*r.ap*k, dp:t.dp*r.dp*k, hp:t.hp*r.hp*k, maxhp:t.hp*r.hp*k,
      spd:t.spd_base+(c.spd_mod??0)+r.spd, gauge:0, alive:true,
      skill_type:c.skill_type, skill_coef:c.skill_coef, skill_rate:c.skill_rate,
      unique_effect:null, unique_unlocked:false, buffs:[], dots:[], uniqueUsed:false, cd:0 });
  }
  return out;
}

/* opt: { steps, healPct, revivePct } — 회복은 "걸음을 뗄 때" 적용한다 */
function run(seed0, opt) {
  const steps = opt.steps ?? RULE2.EXPLORE_STEPS;
  let us = mkUs(1, 1);
  const lead = STARTERS[0].leader_effect;
  let buj = 0;
  for (let step=1; step<=steps; step++){
    const seed = seed0 + step*1013904223;
    const R = runStep(us, step, seed, lead, steps, opt.foeK ?? 1, opt.bossMult ?? 1.45, opt.bossTier ?? 1);
    us = R.us; buj = Math.min(100, buj + 4 + (R.win?0:25));
    if (!R.win) return { dead:step, reason:"패배", buj };
    if (buj >= 100) return { dead:step, reason:"부정", buj };
    if (step === steps) return { dead:0, reason:"클리어", buj, hp:hpPct(us) };
    // 걸음 사이 회복
    if (opt.healPct){
      for (const u of us){
        if (u.alive) u.hp = Math.min(u.maxhp, u.hp + u.maxhp*opt.healPct);
        else if (opt.revivePct){ u.alive = true; u.hp = u.maxhp*opt.revivePct; }
      }
    }
  }
  return { dead:0, reason:"클리어", buj, hp:hpPct(us) };
}

const hpPct = us => us.reduce((s,u)=>s+Math.max(0,u.hp),0) / us.reduce((s,u)=>s+u.maxhp,0);

function runStep(usPrev, step, seed, lead, steps, foeK=1, bossMult=1.45, bossTier=1){
  const us = mkUs(1,1);
  usPrev.forEach((p,i)=>{ us[i].hp = p.hp; us[i].alive = p.alive; });
  const s = BigInt(Math.abs(seed) % 9007199254740991);
  const rng = new RNG(s);           // 적 생성에도 같은 시드 계열을 쓴다
  const them = mkFoes(step, rng, steps, foeK, bossMult, bossTier);
  const R = battle(us, them, s, lead, 1);
  return { win: R.result === "win", us };
}


/* ── 진단 1: 1걸음을 이긴 직후 파티가 어떤 상태인가 ── */
function diag(N=400){
  let win=0, aliveSum=0, hpSum=0; const aliveHist={};
  for(let i=0;i<N;i++){
    const seed = 5000 + i*7919 + 1013904223;
    const s = BigInt(Math.abs(seed) % 9007199254740991);
    const us = mkUs(1,1), them = mkFoes(1, new RNG(s), 10);
    const R = battle(us, them, s, STARTERS[0].leader_effect, 1);
    if(R.result !== "win") continue;
    win++;
    const a = us.filter(u=>u.alive).length;
    aliveSum += a; aliveHist[a]=(aliveHist[a]??0)+1;
    hpSum += hpPct(us);
  }
  console.log(`1걸음 승률 ${(win/N*100).toFixed(1)}%`);
  console.log(`  이겼을 때 살아남은 수 평균 ${(aliveSum/win).toFixed(2)}명 / 5명`);
  console.log(`  이겼을 때 남은 총 HP ${(hpSum/win*100).toFixed(1)}%`);
  console.log("  생존 인원 분포 " + Object.entries(aliveHist).sort()
    .map(([k,v])=>`${k}명 ${Math.round(v/win*100)}%`).join(" · "));
}

/* ── 진단 2: 적 강도 · 회복 · 걸음 수 스윕 ── */
function sweep(){
  const N=400;
  const foeK = [1.0, 0.85, 0.7, 0.6, 0.5];
  const rec  = [
    { n:"회복 없음",        heal:0,   rev:0   },
    { n:"25% 회복",         heal:.25, rev:0   },
    { n:"50% 회복+30% 부활", heal:.5,  rev:.3  },
    { n:"전원 완전 회복",    heal:1,   rev:1   },
  ];
  for(const steps of [10, 6]){
    console.log(`\n■ ${steps}걸음`);
    console.log("적강도".padEnd(8) + rec.map(r=>r.n.padStart(15)).join(""));
    for(const fk of foeK){
      const row=[];
      for(const r of rec){
        let clear=0;
        for(let i=0;i<N;i++){
          const res = run(1000+i*7919, { steps, healPct:r.heal, revivePct:r.rev, foeK:fk });
          if(res.dead===0) clear++;
        }
        row.push(((clear/N*100).toFixed(0)+"%").padStart(15));
      }
      console.log(("×"+fk.toFixed(2)).padEnd(8) + row.join(""));
    }
  }
}

/* ── 진단 3: 보스 걸음만 따로. 만전 상태에서 붙는다 ── */
function bossDiag(){
  const N=400;
  console.log("\n■ 보스 걸음 (만전 상태에서 붙었을 때 승률)");
  console.log("보스배율   적 성급   승률");
  for(const [mult,tierBump] of [[1.45,1],[1.45,0],[1.20,0],[1.00,0],[0.85,0]]){
    let win=0;
    for(let i=0;i<N;i++){
      const seed = 9000+i*7919;
      const sd = BigInt(Math.abs(seed) % 9007199254740991);
      const us = mkUs(1,1);
      const rng = new RNG(sd);
      const tier = Math.max(1, Math.min(4, Math.ceil(1/22) + tierBump));
      const k = (1+1*0.012) * mult;
      const them = [];
      for(let j=0;j<3;j++){
        const c = rng.pick(FOE_POOL), t = TIERS[tier-1], r = RULE.ROLE[c.role];
        them.push({ uid:"b"+j, card_id:c.id, name:c.name, faction:"당", role:c.role, tier, side:"them",
          ap:t.ap*r.ap*k, dp:t.dp*r.dp*k, hp:t.hp*r.hp*k, maxhp:t.hp*r.hp*k,
          spd:t.spd_base+(c.spd_mod??0)+r.spd, gauge:0, alive:true,
          skill_type:c.skill_type, skill_coef:c.skill_coef, skill_rate:c.skill_rate,
          unique_effect:null, unique_unlocked:false, buffs:[], dots:[], uniqueUsed:false, cd:0 });
      }
      if(battle(us, them, sd, STARTERS[0].leader_effect, 1).result === "win") win++;
    }
    console.log(`×${mult.toFixed(2)}      ${tierBump?"+1성":"동성급"}   ${(win/N*100).toFixed(0)}%`);
  }
}

/* ── 진단 4: 보스를 고친 뒤, 걸음마다 필요한 회복량 ── */
function healSweep(){
  const N=400;
  console.log("\n■ 보스 동성급×1.20 으로 낮춘 뒤 · 일반 적은 그대로(×1.00)");
  console.log("걸음  " + [0,.15,.25,.35,.5,.75,1].map(h=>`${Math.round(h*100)}%회복`.padStart(9)).join(""));
  for(const steps of [10,8,6]){
    const row=[];
    for(const h of [0,.15,.25,.35,.5,.75,1]){
      let clear=0;
      for(let i=0;i<N;i++){
        const r = run(1000+i*7919, { steps, healPct:h, revivePct:h>=.5?0.3:0, foeK:1, bossMult:1.20, bossTier:0 });
        if(r.dead===0) clear++;
      }
      row.push(((clear/N*100).toFixed(0)+"%").padStart(9));
    }
    console.log(String(steps).padEnd(6) + row.join(""));
  }
}

const N=600;
const cr=(steps,foeK,heal,rev,bm=1.20,bt=0)=>{let c=0;for(let i=0;i<N;i++){
  const r=run(1000+i*7919,{steps,healPct:heal,revivePct:rev,foeK,bossMult:bm,bossTier:bt});
  if(r.dead===0)c++;}return c/N*100;};

console.log("D01 · 10걸음 · 적×1.00 · 보스 동성급×1.20 · " + N + "회");
console.log("살아있는 넋은 완전 회복. 쓰러진 넋을 얼마로 일으키냐에 따라:\n");
console.log("부활%".padEnd(8)+"클리어율");
for(const rev of [0,.4,.5,.6,.75,.9,1.0])
  console.log((Math.round(rev*100)+"%").padEnd(8)+cr(10,1.0,1.0,rev).toFixed(0)+"%");

console.log("\n■ 최종안 검산 — 걸음 사이 완전 회복 + 완전 부활 · 보스 동성급×1.20");
for(const [fk,lab] of [[1.0,"D01 적×1.00"],[1.05,"뒤 던전 적×1.05"],[1.15,"더 뒤 ×1.15"]]){
  let c=0; const reach=[];
  for(let i=0;i<N;i++){
    const r=run(1000+i*7919,{steps:10,healPct:1,revivePct:1,foeK:fk,bossMult:1.20,bossTier:0});
    if(r.dead===0)c++; reach.push(r.dead===0?10:r.dead);
  }
  console.log(`  ${lab}: 클리어 ${(c/N*100).toFixed(0)}% · 평균 도달 ${(reach.reduce((a,b)=>a+b,0)/N).toFixed(1)}걸음`);
}
console.log("\n■ 보스를 안 고치면? (+1성 ×1.45 유지 · 완전 회복)");
console.log(`  클리어 ${cr(10,1.0,1,1,1.45,1).toFixed(0)}%`);
