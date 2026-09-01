/* 고친 규칙으로 사다리를 다시 잰다. 서버 rules.ts 의 foePower 를 그대로 부른다 —
   시뮬레이션과 서버가 같은 함수를 본다. */
import { battle, RULE, RNG } from "../api/engine.ts";
import { RULE2, foePower, bestMix } from "../api/rules.ts";

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

const party = (lv:number, awk=0) => bestMix(TIERS, lv).map((t,i)=>{
  const x = TIERS[t-1], r = RULE.ROLE[KIT[i].role];
  const k = (1 + (t*RULE2.CARD_LV.CAP_PER_TIER-1)*0.015) * (1 + awk*0.06);
  return { uid:"u"+i, card_id:"u"+i, name:"u"+i, faction:"당", role:KIT[i].role, tier:t, side:"us",
    ap:x.ap*r.ap*k, dp:x.dp*r.dp*k, hp:x.hp*r.hp*k, maxhp:x.hp*r.hp*k,
    spd:x.spd_base+KIT[i].spd_mod+r.spd, gauge:0, alive:true,
    skill_type:KIT[i].skill_type, skill_coef:KIT[i].skill_coef, skill_rate:KIT[i].skill_rate,
    unique_effect:null, unique_unlocked:false, buffs:[], dots:[], uniqueUsed:false, cd:0 };
});

/* 서버 makeFoes 와 같은 계산 */
function foes(lvReq:number, step:number, rng:RNG){
  const B = RULE2.BOSS, boss = step >= RULE2.EXPLORE_STEPS;
  const P = foePower(TIERS, lvReq);
  let fit = 1; for (const t of TIERS) if (t.ap <= P) fit = t.tier;
  const tier = Math.max(1, Math.min(5, fit + (boss ? B.TIER_BUMP : 0)));
  const k = Math.max(0.5, P / TIERS[tier-1].ap) * (boss ? B.MULT : 1);
  const n = boss ? B.COUNT : RULE2.PARTY_SIZE, out:any[] = [];
  for(let i=0;i<n;i++){
    const kit = rng.pick(KIT), t = TIERS[tier-1], r = RULE.ROLE[kit.role];
    out.push({ uid:`e${step}_${i}`, card_id:"E", name:"E", faction:"당", role:kit.role, tier, side:"them",
      ap:t.ap*r.ap*k, dp:t.dp*r.dp*k, hp:t.hp*r.hp*k, maxhp:t.hp*r.hp*k,
      spd:t.spd_base+kit.spd_mod+r.spd, gauge:0, alive:true,
      skill_type:kit.skill_type, skill_coef:kit.skill_coef, skill_rate:kit.skill_rate,
      unique_effect:null, unique_unlocked:false, buffs:[], dots:[], uniqueUsed:false, cd:0 });
  }
  return { units: out, tier, k, P };
}

function run(seed0:number, lv:number, awk:number){
  const RC = RULE2.STEP_RECOVER;
  let carry:any = null, buj = 0;
  for(let step=1; step<=RULE2.EXPLORE_STEPS; step++){
    const us = party(lv, awk);
    if(carry) us.forEach((u,i)=>{ const h=carry[i];
      if(h.alive){u.hp=Math.min(u.maxhp,h.hp+u.maxhp*RC.HP);u.alive=u.hp>0;}
      else if(RC.REVIVE>0){u.hp=u.maxhp*RC.REVIVE;u.alive=true;} });
    if(!us.some(u=>u.alive)) return step;
    const seed = seed0+step*1013904223, s = BigInt(Math.abs(seed)%9007199254740991);
    const R = battle(us as any, foes(lv,step,new RNG(s)).units, s, LEAD, 1);
    buj = Math.min(100, buj + RULE2.BUJEONG_PER_STEP + (R.result==="win"?0:RULE2.BUJEONG_ON_LOSE));
    if(R.result!=="win" || buj>=RULE2.BUJEONG_MAX) return step;
    carry = us.map(u=>({hp:u.hp, alive:u.alive}));
  }
  return 0;
}
const N=300, rate=(lv:number,awk=0)=>{let c=0;for(let i=0;i<N;i++) if(run(1000+i*7919,lv,awk)===0)c++;return c/N*100;};

const DUNS: [string,string,number][] = [
  ["D01","흥양 저잣거리",1],["D02","능가사 앞마당",4],["D03","팔령산 유영봉",8],
  ["D04","팔령산 성주봉",12],["D05","팔령산 생황봉",16],["D06","팔령산 사자봉",21],
  ["D07","팔령산 오로봉",26],["D08","팔령산 두류봉",31],["D09","팔령산 칠성봉",36],
  ["S1","나락 시왕 10전",40],["D10","팔령산 적취봉",41],["D11","여자만 갯벌",46],
  ["D12","득량만 갯바위",51],["D13","해창만 간척지",55],["S2","통천문",55],
  ["D14","녹동항 새벽",59],["S3","팔령산 심층",60],["S4","심연의 갯벌",65],
  ["D16","거금대교 아래",67],["D17","거금도 적대봉",71],["D18","나로도 삼치 파시",75],
  ["D19","봉대산 말바위터",79],["S5","나로 발사대",80],["D20","신통소 폐허",83],
];

console.log(`고친 규칙 검증 — FOE.RATIO=${RULE2.FOE.RATIO} · 던전마다 ${N}회\n`);
console.log("던전   이름              입장격  파티     적성급 배율   앞대비  클리어");
console.log("─".repeat(74));
let prev = 0;
for (const [id,name,lv] of DUNS){
  const f = foes(lv, 1, new RNG(1n));
  const j = prev ? (f.P/prev-1)*100 : 0;
  const r = rate(lv);
  console.log(id.padEnd(6)+" "+name.padEnd(16)+String(lv).padStart(5)+"  "+
    bestMix(TIERS,lv).join("").padEnd(8)+`${f.tier}성  ×${f.k.toFixed(2)}`+
    (prev? (j>=0?"+":"")+j.toFixed(0)+"%" : "—").padStart(8)+
    (r.toFixed(0)+"%").padStart(8) + (r<50?"  ←낮음":""));
  prev = f.P;
}
console.log("\n앞대비 도약이 전이폭(16%) 안에 있으면 절벽이 아니다.");
