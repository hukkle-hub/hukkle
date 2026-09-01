/* 적 전투력 곡선을 역산한다.
   던전마다 "클리어율 80%가 나오는 적 전투력"을 이분탐색으로 찾고,
   그 점들에 지수곡선을 맞춘다. 숫자를 고르지 않고 재서 구한다. */
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

function party(lv: number, awk = 0) {
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
    const x = TIERS[t-1], r = RULE.ROLE[KIT[i].role];
    const k = (1 + (t*8-1)*0.015) * (1 + awk*0.06);
    return { uid:"u"+i, card_id:"u"+i, name:"u"+i, faction:"당", role:KIT[i].role, tier:t, side:"us",
      ap:x.ap*r.ap*k, dp:x.dp*r.dp*k, hp:x.hp*r.hp*k, maxhp:x.hp*r.hp*k,
      spd:x.spd_base+KIT[i].spd_mod+r.spd, gauge:0, alive:true,
      skill_type:KIT[i].skill_type, skill_coef:KIT[i].skill_coef, skill_rate:KIT[i].skill_rate,
      unique_effect:null, unique_unlocked:false, buffs:[], dots:[], uniqueUsed:false, cd:0 };
  });
}

/* 적을 '절대 전투력 P'로 만든다. P 안에 들어가는 가장 높은 성급을 쓰고, 나머지는 배율.
   성급이 올라도 총 전투력이 끊기지 않는다. */
function foesByPower(P: number, boss: boolean, rng: RNG, step: number) {
  const B = RULE2.BOSS;
  let base = 1;
  for (const t of TIERS) if (t.ap <= P) base = t.tier;
  const tier = Math.max(1, Math.min(5, base));
  const k = Math.max(1, P / TIERS[tier-1].ap) * (boss ? B.MULT : 1);
  const n = boss ? B.COUNT : RULE2.PARTY_SIZE;
  const out: any[] = [];
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

function run(seed0: number, lv: number, P: number, awk: number) {
  const RC = RULE2.STEP_RECOVER;
  let carry: any[] | null = null, buj = 0;
  for (let step=1; step<=RULE2.EXPLORE_STEPS; step++){
    const us = party(lv, awk);
    if (carry) us.forEach((u,i)=>{ const h=carry![i];
      if(h.alive){u.hp=Math.min(u.maxhp,h.hp+u.maxhp*RC.HP);u.alive=u.hp>0;}
      else if(RC.REVIVE>0){u.hp=u.maxhp*RC.REVIVE;u.alive=true;}
      else {u.hp=0;u.alive=false;} });
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
const N = 200;
const rate = (lv: number, P: number, awk=0) => {
  let c=0; for(let i=0;i<N;i++) if(run(1000+i*7919, lv, P, awk)===0) c++;
  return c/N*100;
};

/* 목표 80% 가 나오는 P 를 이분탐색 */
function solve(lv: number, target = 80) {
  let lo = 100, hi = 6000;
  for (let it=0; it<12; it++){
    const mid = (lo+hi)/2;
    if (rate(lv, mid) >= target) lo = mid; else hi = mid;
  }
  return (lo+hi)/2;
}


/* 플레이어가 그 레벨에 낼 수 있는 파티의 전투력 — 적 곡선을 여기에 붙인다 */
function partyPower(lv: number){
  const u = party(lv);
  return u.reduce((a:number,x:any)=>a + x.ap + x.dp*1.6 + x.hp*0.28, 0);
}

const LVS = [1,4,8,16,26,36,46,55,65,71,79,83];
console.log("적 전투력을 플레이어 파티 전투력에 붙여본다\n");
console.log("입장격  파티전투력  P(80%)   비율   현행P   현행비율");
console.log("─".repeat(60));
const ratios: number[] = [];
for (const lv of LVS){
  const pp = partyPower(lv), P = solve(lv);
  const curTier = Math.max(1, Math.min(4, Math.ceil(lv/22)));
  const curP = TIERS[curTier-1].ap * (1 + lv*0.012);
  ratios.push(P/pp);
  console.log(String(lv).padStart(5) + pp.toFixed(0).padStart(11) + P.toFixed(0).padStart(9) +
    (P/pp).toFixed(4).padStart(9) + curP.toFixed(0).padStart(8) + (curP/pp).toFixed(4).padStart(10));
}
const avg = ratios.reduce((a,b)=>a+b,0)/ratios.length;
const dev = Math.sqrt(ratios.reduce((a,r)=>a+(r-avg)**2,0)/ratios.length);
console.log(`\n비율 평균 ${avg.toFixed(4)} · 표준편차 ${dev.toFixed(4)} (${(dev/avg*100).toFixed(0)}%)`);

console.log("\n■ 규칙 후보:  적 전투력 = 파티전투력 × R  — R 을 바꿔가며 클리어율");
console.log("입장격 " + [0.055,0.065,0.075,0.085].map(r=>`R=${r}`.padStart(9)).join(""));
console.log("─".repeat(48));
for (const lv of LVS){
  const pp = partyPower(lv);
  const row = [0.055,0.065,0.075,0.085].map(R => (rate(lv, pp*R).toFixed(0)+"%").padStart(9)).join("");
  console.log(String(lv).padStart(5) + " " + row);
}
