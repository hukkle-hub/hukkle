/* 던전 사다리 검증 — 처음부터 다시 짠다.
   묻는 것: 던전이 열리는 시점에 그 플레이어가 낼 수 있는 파티로 그 던전을 뚫을 수 있는가.
   전투는 서버가 쓰는 engine.ts 를, 규칙은 서버가 쓰는 rules.ts 를 그대로 부른다. */
import { battle, RULE, RNG } from "../api/engine.ts";
import { RULE2, costCap } from "../api/rules.ts";

/* DB master_tier 실측값 */
const TIERS = [
  { tier:1, ap:140,  dp:55,  hp:700,  cost:12, spd_base:80  },
  { tier:2, ap:238,  dp:94,  hp:1190, cost:19, spd_base:90  },
  { tier:3, ap:405,  dp:159, hp:2023, cost:30, spd_base:100 },
  { tier:4, ap:688,  dp:270, hp:3439, cost:46, spd_base:110 },
  { tier:5, ap:1403, dp:551, hp:7016, cost:82, spd_base:120 },
];

/* DB master_dungeon 실측값 (combat=true 만) */
const DUNS: [string, string, number][] = [
  ["D01","흥양 저잣거리",1],["D02","능가사 앞마당",4],["D03","팔령산 유영봉",8],
  ["D04","팔령산 성주봉",12],["D05","팔령산 생황봉",16],["D06","팔령산 사자봉",21],
  ["D07","팔령산 오로봉",26],["D08","팔령산 두류봉",31],["D09","팔령산 칠성봉",36],
  ["S1","나락 시왕 10전",40],["D10","팔령산 적취봉",41],["D11","여자만 갯벌",46],
  ["D12","득량만 갯바위",51],["D13","해창만 간척지",55],["S2","통천문",55],
  ["D14","녹동항 새벽",59],["S3","팔령산 심층",60],["S4","심연의 갯벌",65],
  ["D16","거금대교 아래",67],["D17","거금도 적대봉",71],["D18","나로도 삼치 파시",75],
  ["D19","봉대산 말바위터",79],["S5","나로 발사대",80],["D20","신통소 폐허",83],
];

/* 역할 분포만 맞춘 대표 카드. 실제 풀은 세력별로 다르지만 통계적 성질은 같다. */
const KIT = [
  { role:"탱커",   skill_type:"buff",   skill_rate:11, skill_coef:0,   spd_mod:-9  },
  { role:"밸런스", skill_type:"single", skill_rate:9,  skill_coef:1.1, spd_mod:-10 },
  { role:"밸런스", skill_type:"heal",   skill_rate:12, skill_coef:0.5, spd_mod:-10 },
  { role:"밸런스", skill_type:"aoe",    skill_rate:10, skill_coef:0.9, spd_mod:-9  },
  { role:"암살자", skill_type:"debuff", skill_rate:10, skill_coef:1,   spd_mod:-9  },
];

const mkUnit = (kit: any, tier: number, lv: number, awk: number, side: "us"|"them", uid: string) => {
  const t = TIERS[tier-1], r = RULE.ROLE[kit.role];
  const k = (1 + (lv-1)*0.015) * (1 + awk*0.06);
  return { uid, card_id:uid, name:uid, faction:"당", role:kit.role, tier, side,
    ap:t.ap*r.ap*k, dp:t.dp*r.dp*k, hp:t.hp*r.hp*k, maxhp:t.hp*r.hp*k,
    spd:t.spd_base+kit.spd_mod+r.spd, gauge:0, alive:true,
    skill_type:kit.skill_type, skill_coef:kit.skill_coef, skill_rate:kit.skill_rate,
    unique_effect:null, unique_unlocked:false, buffs:[], dots:[], uniqueUsed:false, cd:0 };
};

/* 플레이어가 실제로 낼 수 있는 파티.
   배틀 코스트 상한이 성급 조합을 정하고, 성급이 카드 격 상한(성급×8)을 정한다.
   실제 플레이어는 성급을 섞는다 — 상한 안에서 전투력 합이 가장 큰 조합을 고른다. */
function party(playerLv: number, awk = 0) {
  const cap = costCap(playerLv);
  const pw = (t: number) => { const x = TIERS[t-1]; return x.ap + x.dp*1.6 + x.hp*0.28; };
  let best = [1,1,1,1,1], bestP = pw(1)*5;
  const rec = (i: number, cur: number[], cost: number) => {
    if (cost > cap) return;
    if (i === 5) { const p = cur.reduce((a,t)=>a+pw(t),0); if (p > bestP) { bestP = p; best = [...cur]; } return; }
    for (let t = cur[i-1] ?? 5; t >= 1; t--) rec(i+1, [...cur, t], cost + TIERS[t-1].cost);
  };
  rec(0, [], 0);
  best = [...best].sort((a,b)=>b-a);
  return best.map((t,i) => mkUnit(KIT[i], t, t*RULE2.CARD_LV.CAP_PER_TIER, awk, "us", "u"+i));
}

function foes(lvReq: number, step: number, rng: RNG) {
  const B = RULE2.BOSS;
  const boss = step >= RULE2.EXPLORE_STEPS;
  const tier = Math.max(1, Math.min(4, Math.ceil(lvReq/22) + (boss ? B.TIER_BUMP : 0)));
  const n = boss ? B.COUNT : RULE2.PARTY_SIZE;
  const k = (1 + lvReq*0.012) * (boss ? B.MULT : 1);
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

/* 리더 보너스 — 서버는 항상 건다. 흔한 값(전체 방어 +9%)으로 둔다. */
const LEAD = { ops:[{op:"stat", stat:"dp", pct:9, filter:"all"}], text:"터가 단단하다" };

/* 던전 한 판. 서버 /explore/step 과 같은 순서로 돈다. */
function run(seed0: number, lvReq: number, playerLv: number, awk: number) {
  const RC = RULE2.STEP_RECOVER;
  let carry: {hp:number, alive:boolean}[] | null = null;
  let buj = 0;
  for (let step=1; step<=RULE2.EXPLORE_STEPS; step++){
    const us = party(playerLv, awk);
    if (carry) us.forEach((u,i)=>{
      const h = carry![i];
      if (h.alive) { u.hp = Math.min(u.maxhp, h.hp + u.maxhp*RC.HP); u.alive = u.hp>0; }
      else if (RC.REVIVE>0) { u.hp = u.maxhp*RC.REVIVE; u.alive = true; }
      else { u.hp = 0; u.alive = false; }
    });
    if (!us.some(u=>u.alive)) return step;
    const seed = seed0 + step*1013904223;
    const s = BigInt(Math.abs(seed) % 9007199254740991);
    const R = battle(us, foes(lvReq, step, new RNG(s)), s, LEAD, 1);
    buj = Math.min(100, buj + RULE2.BUJEONG_PER_STEP + (R.result==="win"?0:RULE2.BUJEONG_ON_LOSE));
    if (R.result !== "win" || buj >= RULE2.BUJEONG_MAX) return step;
    carry = us.map(u=>({hp:u.hp, alive:u.alive}));
  }
  return 0;   // 클리어
}

const N = 300;
const rate = (lvReq: number, lv: number, awk: number) => {
  let c=0; for(let i=0;i<N;i++) if(run(1000+i*7919, lvReq, lv, awk)===0) c++;
  return c/N*100;
};

console.log(`던전 사다리 · 던전마다 ${N}회 · 리더 보너스 포함\n`);
console.log("던전   이름              입장격  파티구성   적성급 배율   각성0  각성2  각성4");
console.log("─".repeat(76));
for (const [id, name, lv] of DUNS){
  const comp = party(lv).map(u=>u.tier).join("");
  const bt = Math.max(1, Math.min(4, Math.ceil(lv/22)));
  const k = (1 + lv*0.012).toFixed(2);
  const r0 = rate(lv, lv, 0), r2 = rate(lv, lv, 2), r4 = rate(lv, lv, 4);
  const mark = r4 < 20 ? "  ←★막힘" : r0 < 40 ? "  ←낮음" : "";
  console.log(
    `${id.padEnd(6)} ${name.padEnd(16)}${String(lv).padStart(5)}   ${comp.padEnd(9)}` +
    `${bt}성  ×${k}` + (r0.toFixed(0)+"%").padStart(7) + (r2.toFixed(0)+"%").padStart(7) +
    (r4.toFixed(0)+"%").padStart(7) + mark);
}

console.log("\n\n■ 벽이 정확히 어디서 서는가 — 입장격 60~72 를 한 칸씩");
console.log("입장격  적성급  적배율   파티구성   각성0  각성4");
console.log("─".repeat(52));
for (let lv=60; lv<=72; lv++){
  const bt = Math.max(1, Math.min(4, Math.ceil(lv/22)));
  const comp = party(lv).map(u=>u.tier).join("");
  console.log(String(lv).padStart(5) + `${String(bt).padStart(7)}성  ×${(1+lv*0.012).toFixed(2)}` +
    `   ${comp.padEnd(9)}` + (rate(lv,lv,0).toFixed(0)+"%").padStart(7) +
    (rate(lv,lv,4).toFixed(0)+"%").padStart(7));
}
