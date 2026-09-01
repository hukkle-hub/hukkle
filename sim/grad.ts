/* 전투에 난이도 기울기를 만든다.
   지금은 적 전투력이 몇 %p만 달라져도 100%↔0% 로 뒤집힌다.
   "전이 구간의 폭"을 재서, 그 폭을 넓히는 수식을 찾는다.

   폭 = (클리어율 10% 가 되는 적 전투력) / (90% 가 되는 적 전투력)
   1.0 에 가까울수록 절벽, 클수록 완만한 기울기. */
import { battle, RULE, RNG } from "../api/engine.ts";
import { RULE2, costCap } from "../api/rules.ts";

const TIERS = [
  { tier:1, ap:140,  dp:55,  hp:700,  cost:12, spd_base:80  },
  { tier:2, ap:238,  dp:94,  hp:1190, cost:19, spd_base:90  },
  { tier:3, ap:405,  dp:159, hp:2023, cost:30, spd_base:100 },
  { tier:4, ap:688,  dp:270, hp:3439, cost:46, spd_base:110 },
  { tier:5, ap:1403, dp:551, hp:7016, cost:82, spd_base:120 },
];
const KIT = [
  { role:"탱커",   skill_type:"buff",   skill_rate:11, skill_coef:0,   spd_mod:-9  },
  { role:"밸런스", skill_type:"single", skill_rate:9,  skill_coef:1.1, spd_mod:-10 },
  { role:"밸런스", skill_type:"heal",   skill_rate:12, skill_coef:0.5, spd_mod:-10 },
  { role:"밸런스", skill_type:"aoe",    skill_rate:10, skill_coef:0.9, spd_mod:-9  },
  { role:"암살자", skill_type:"debuff", skill_rate:10, skill_coef:1,   spd_mod:-9  },
];
const LEAD = { ops:[{op:"stat", stat:"dp", pct:9, filter:"all"}], text:"" };

function party(lv: number) {
  const cap = costCap(lv);
  const pw = (t: number) => { const x = TIERS[t-1]; return x.ap + x.dp*1.6 + x.hp*0.28; };
  let best = [1,1,1,1,1], bestP = pw(1)*5;
  const rec = (i: number, cur: number[], cost: number) => {
    if (cost > cap) return;
    if (i === 5) { const p = cur.reduce((a,t)=>a+pw(t),0); if (p > bestP) { bestP = p; best = [...cur]; } return; }
    for (let t = cur[i-1] ?? 5; t >= 1; t--) rec(i+1, [...cur, t], cost + TIERS[t-1].cost);
  };
  rec(0, [], 0);
  return [...best].sort((a,b)=>b-a).map((t,i) => {
    const x = TIERS[t-1], r = RULE.ROLE[KIT[i].role], k = 1 + (t*8-1)*0.015;
    return { uid:"u"+i, card_id:"u"+i, name:"u"+i, faction:"당", role:KIT[i].role, tier:t, side:"us",
      ap:x.ap*r.ap*k, dp:x.dp*r.dp*k, hp:x.hp*r.hp*k, maxhp:x.hp*r.hp*k,
      spd:x.spd_base+KIT[i].spd_mod+r.spd, gauge:0, alive:true,
      skill_type:KIT[i].skill_type, skill_coef:KIT[i].skill_coef, skill_rate:KIT[i].skill_rate,
      unique_effect:null, unique_unlocked:false, buffs:[], dots:[], uniqueUsed:false, cd:0 };
  });
}
const partyPower = (lv:number) => party(lv).reduce((a:number,x:any)=>a+x.ap+x.dp*1.6+x.hp*0.28,0);

function foesByPower(P: number, boss: boolean, rng: RNG, step: number) {
  const B = RULE2.BOSS;
  let base = 1;
  for (const t of TIERS) if (t.ap <= P) base = t.tier;
  const tier = Math.max(1, Math.min(5, base));
  const k = Math.max(1, P / TIERS[tier-1].ap) * (boss ? B.MULT : 1);
  const n = boss ? B.COUNT : RULE2.PARTY_SIZE, out: any[] = [];
  for (let i=0;i<n;i++){
    const kit = rng.pick(KIT), t = TIERS[tier-1], r = RULE.ROLE[kit.role];
    out.push({ uid:`e${step}_${i}`, card_id:"E", name:"E", faction:"당", role:kit.role, tier, side:"them",
      ap:t.ap*r.ap*k, dp:t.dp*r.dp*k, hp:t.hp*r.hp*k, maxhp:t.hp*r.hp*k,
      spd:t.spd_base+kit.spd_mod+r.spd, gauge:0, alive:true,
      skill_type:kit.skill_type, skill_coef:kit.skill_coef, skill_rate:kit.skill_rate,
      unique_effect:null, unique_unlocked:false, buffs:[], dots:[], uniqueUsed:false, cd:0 });
  }
  return out;
}

function run(seed0: number, lv: number, P: number) {
  const RC = RULE2.STEP_RECOVER;
  let carry: any[] | null = null, buj = 0;
  for (let step=1; step<=RULE2.EXPLORE_STEPS; step++){
    const us = party(lv);
    if (carry) us.forEach((u,i)=>{ const h=carry![i];
      if(h.alive){u.hp=Math.min(u.maxhp,h.hp+u.maxhp*RC.HP);u.alive=u.hp>0;}
      else if(RC.REVIVE>0){u.hp=u.maxhp*RC.REVIVE;u.alive=true;} });
    if (!us.some(u=>u.alive)) return step;
    const seed = seed0 + step*1013904223;
    const s = BigInt(Math.abs(seed) % 9007199254740991);
    const R = battle(us as any, foesByPower(P, step>=RULE2.EXPLORE_STEPS, new RNG(s), step), s, LEAD, 1);
    buj = Math.min(100, buj + RULE2.BUJEONG_PER_STEP + (R.result==="win"?0:RULE2.BUJEONG_ON_LOSE));
    if (R.result !== "win" || buj >= RULE2.BUJEONG_MAX) return step;
    carry = us.map(u=>({hp:u.hp, alive:u.alive}));
  }
  return 0;
}
const N = 150;
const rate = (lv:number, P:number) => { let c=0; for(let i=0;i<N;i++) if(run(1000+i*7919,lv,P)===0) c++; return c/N*100; };

/* 목표 클리어율이 나오는 P — 이분탐색 */
function solveP(lv:number, target:number){
  let lo=50, hi=8000;
  for(let i=0;i<13;i++){ const m=(lo+hi)/2; if(rate(lv,m)>=target) lo=m; else hi=m; }
  return (lo+hi)/2;
}
/* 전이 구간의 폭 */
function width(lv:number){
  const p90 = solveP(lv, 90), p10 = solveP(lv, 10);
  return { p90, p10, w: p10/p90 };
}


/* 한 판(1걸음)만 — 만전 상태에서 붙었을 때 승률 */
const M = 400;
function fightRate(lv:number, P:number){
  let w=0;
  for(let i=0;i<M;i++){
    const seed = 3000+i*7919;
    const s = BigInt(Math.abs(seed) % 9007199254740991);
    if (battle(party(lv) as any, foesByPower(P,false,new RNG(s),1), s, LEAD, 1).result==="win") w++;
  }
  return w/M*100;
}
function solveF(lv:number, t:number){
  let lo=50, hi=8000;
  for(let i=0;i<13;i++){ const m=(lo+hi)/2; if(fightRate(lv,m)>=t) lo=m; else hi=m; }
  return (lo+hi)/2;
}


const DUNS: [string,number][] = [["D01",1],["D02",4],["D03",8],["D04",12],["D05",16],
 ["D06",21],["D07",26],["D08",31],["D09",36],["S1",40],["D10",41],["D11",46],
 ["D12",51],["D13",55],["D14",59],["S3",60],["S4",65],["D16",67],["D17",71],
 ["D18",75],["D19",79],["S5",80],["D20",83]];

console.log("전이 구간의 폭은 1.16 — 적 전투력 16% 안에서 90%→10% 로 떨어진다.");
console.log("던전 간격이 그보다 촘촘하면 조절이 되고, 성기면 절벽이 된다.\n");
console.log("■ 현행: 던전 사이 적 전투력이 몇 % 뛰나");
console.log("던전   입장격  적전투력   앞 던전 대비");
console.log("─".repeat(46));
let prev = 0;
for (const [id,lv] of DUNS){
  const t = Math.max(1, Math.min(4, Math.ceil(lv/22)));
  const P = TIERS[t-1].ap * (1 + lv*0.012);
  const j = prev ? (P/prev-1)*100 : 0;
  console.log(id.padEnd(6)+String(lv).padStart(5)+P.toFixed(0).padStart(10)+
    (prev? (j>=0?"+":"")+j.toFixed(0)+"%" : "—").padStart(12) +
    (j > 16 ? "   ← 폭보다 큼 = 절벽" : ""));
  prev = P;
}

console.log("\n\n■ 적 곡선을 파티 전투력에 붙이면 (P = 파티전투력 × R)");
console.log("   던전 사이가 촘촘해지는지, 클리어율이 조절되는지\n");
console.log("던전   입장격  파티전투력  앞 대비  " + [0.052,0.056,0.060].map(r=>`R=${r}`.padStart(8)).join(""));
console.log("─".repeat(66));
let pp0 = 0;
for (const [id,lv] of DUNS){
  const pp = partyPower(lv);
  const j = pp0 ? (pp/pp0-1)*100 : 0;
  const cells = [0.052,0.056,0.060].map(R => (rate(lv, pp*R).toFixed(0)+"%").padStart(8)).join("");
  console.log(id.padEnd(6)+String(lv).padStart(5)+pp.toFixed(0).padStart(11)+
    (pp0? (j>=0?"+":"")+j.toFixed(0)+"%" : "—").padStart(8) + cells);
  pp0 = pp;
}
