/* 열 가지 술법이 실제로 서로 다르게 도는지 확인한다.
   예전엔 여섯이 조용히 단일공격으로 떨어졌다. 그게 고쳐졌는지 로그로 본다. */
import { battle, RULE, RNG } from "../api/engine.ts";

const T = { ap:405, dp:159, hp:2023, spd_base:100 };
const mk = (id:string, side:"us"|"them", st:string|null, coef=1.2, rate=100) => {
  const r = RULE.ROLE["밸런스"];
  return { uid:id, card_id:id, name:id, faction:"당", role:"밸런스", tier:3, side,
    ap:T.ap*r.ap, dp:T.dp*r.dp, hp:T.hp*r.hp, maxhp:T.hp*r.hp, spd:T.spd_base,
    gauge:0, alive:true, skill_type:st, skill_coef:coef, skill_rate:rate,
    unique_effect:null, unique_unlocked:false, buffs:[], dots:[], uniqueUsed:false, cd:0 } as any;
};

const TYPES = ["single","heal","buff","debuff","aoe","seal","counter","summon","revive","special"];
console.log("술법 유형별로 실제 일어나는 일\n");
console.log("유형      나타난 동작");
console.log("─".repeat(62));
const seen: Record<string,string> = {};
for (const st of TYPES){
  const us = [mk("주",  "us", st), mk("동무1","us",null), mk("동무2","us",null)];
  const them = [mk("적1","them",null), mk("적2","them",null), mk("적3","them",null)];
  us[1].hp = us[1].maxhp*0.3;            // 회복 대상
  us[2].alive = false; us[2].hp = 0;     // 부활 대상
  const R = battle(us, them, 20260901n, null, 1);
  const mine = R.log.filter(l => l.actor === "주");
  /* op 이름만 보면 single 과 aoe 가 같아 보인다. 대상 수와 부호까지 봐야 갈린다. */
  const firstTurn = mine.length ? mine[0].t : 0;
  const burst = mine.filter(l => l.t === firstTurn);
  const tgts  = new Set(burst.map(l => l.target)).size;
  const sign  = burst.some(l => (l.val ?? 0) < 0) ? "−" : "+";
  const sig = burst.map(l => `${l.op}${(l.val ?? 0) < 0 ? "−" : ""}`).join("·") + `/${tgts}`;
  seen[st] = sig;
  console.log(`${st.padEnd(9)} ${sig.padEnd(24)} 대상 ${tgts} · 총 ${mine.length}회`);
}
console.log("\n■ 서로 다른가");
const groups: Record<string,string[]> = {};
for (const [k,v] of Object.entries(seen)) (groups[v] ??= []).push(k);
let dup = 0;
for (const [sig, ks] of Object.entries(groups)){
  if (ks.length > 1){ dup++; console.log(`  ★ 같은 동작: ${ks.join(", ")} → ${sig}`); }
}
console.log(dup ? `\n중복 ${dup}건` : "\n열 가지가 전부 다르게 돈다 ✓");

console.log("\n■ 되살리기가 실제로 되나");
{
  const us = [mk("무당","us","revive"), mk("죽은넋","us",null)];
  us[1].alive = false; us[1].hp = 0;
  const them = [mk("적","them",null)];
  const R = battle(us, them, 777n, null, 1);
  const rv = R.log.filter(l => l.op === "revive");
  console.log(rv.length ? `  ✓ ${rv[0].text} (HP ${rv[0].val})` : "  ✗ 부활 안 일어남");
}
