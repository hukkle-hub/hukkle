// ═══════════════════════════════════════════════════════════
// 흥양기 — 전투 엔진
//
// 원칙: 모든 판정은 seed 하나에서 나온다.
//       seed가 같으면 결과가 똑같다. 분쟁이 나면 그대로 재현한다.
//       클라이언트는 결과를 보여줄 뿐, 아무것도 결정하지 않는다.
// ═══════════════════════════════════════════════════════════

// ── 난수: xorshift128. 시드만 있으면 어디서든 같은 수열 ──
export class RNG {
  private a: number; private b: number; private c: number; private d: number;
  constructor(seed: number | bigint) {
    let s = BigInt(seed) & 0xFFFFFFFFFFFFFFFFn;
    this.a = Number(s & 0xFFFFFFFFn) >>> 0;
    this.b = Number((s >> 32n) & 0xFFFFFFFFn) >>> 0;
    this.c = 0x9E3779B9; this.d = 0x85EBCA6B;
    if ((this.a | this.b) === 0) { this.a = 0x1234567; this.b = 0x89ABCDEF; }
    for (let i = 0; i < 12; i++) this.next();      // 워밍업
  }
  next(): number {                                  // [0,1)
    let t = this.d;
    const s = this.a;
    this.d = this.c; this.c = this.b; this.b = s;
    t ^= t << 11; t >>>= 0;
    t ^= t >>> 8;
    this.a = (t ^ s ^ (s >>> 19)) >>> 0;
    return this.a / 4294967296;
  }
  range(lo: number, hi: number) { return lo + this.next() * (hi - lo); }
  int(n: number) { return Math.floor(this.next() * n); }
  chance(p: number) { return this.next() < p; }     // p는 0~1
  pick<T>(arr: T[]): T { return arr[this.int(arr.length)]; }
}

// ── 규칙 상수. 전부 한 곳에. 밸런스는 여기만 만진다 ──
export const RULE = {
  DP_K: 320,              // 데미지 = ... × (1 - DP/(DP+320)). 5성 탱커도 60% 이상은 못 깎는다
  GAUGE: 100,             // 게이지가 여기 닿으면 행동. SPD 80~120이므로 한 틱에 0.8~1.2회.
                          //  ★ 1000으로 두면 10틱에 1회밖에 못 움직여 아무도 안 죽는다. 실측으로 잡았다.
  MAX_TURN: 60,           // 틱 상한. 실측 승부는 18~26틱에 난다
  VAR: [0.95, 1.05] as const,

  ROLE: {
    "탱커":   { hp: 1.25, dp: 1.20, ap: 1.00, spd: 0,  pierce: false },
    "밸런스": { hp: 1.00, dp: 1.00, ap: 1.00, spd: 0,  pierce: false },
    "암살자": { hp: 0.90, dp: 0.85, ap: 1.20, spd: 8,  pierce: true  },
  } as Record<string, { hp: number; dp: number; ap: number; spd: number; pierce: boolean }>,

  // 세력 상성 — 당 → 저승 → 물 → 당
  //   당(마을신)이 잡귀를 몰아낸다 / 저승(넋)이 물에 빠진 자를 데려간다 / 물(용왕)이 마을에 비를 준다
  //   무신도의 논리 그대로다. 배율 1.15는 파티를 강제하지 않으면서 세력을 의미 있게 만드는 선.
  BEATS: { "당": "저승", "저승": "물", "물": "당" } as Record<string, string>,
  ADV: 1.15,
  DIS: 0.90,

  TAUNT: 0.72,            // 탱커가 살아 있으면 이 확률로 탱커가 맞는다 (도발)
  BASIC: 0.40,            // 평타 계수. 스킬(1.2)·유니크(1.4~1.6)는 그대로 두고 평타만 낮췄다.
                          //  ★ 1.0이면 8턴에 전투가 끝나 스킬도 유니크도 낄 틈이 없다.
  CRIT_BASE: 0.05,        // 기본 치명 5%
  CRIT_MULT: 1.6,
  BUJEONG_MAX: 100,       // 부정(不淨). 탐험 중 쌓인다. 100이면 강제 퇴각

  // 보스 ATB 틱 배율 — 격이 높을수록 게이지가 천천히 찬다 (design_decision #25)
  TICK_SCALE: { "잡귀": 0.85, "하위신": 0.85, "신령": 0.80, "상위신": 0.75, "대신": 0.70 } as Record<string, number>,
} as const;

export type Faction = "당" | "물" | "저승";

export interface Unit {
  uid: string;            // player_card.id 또는 적 슬롯
  card_id: string;
  name: string;
  faction: Faction;
  role: string;
  tier: number;
  side: "us" | "them";

  ap: number; dp: number; hp: number; maxhp: number; spd: number;
  gauge: number;
  alive: boolean;

  skill_type: string | null;
  skill_coef: number;
  skill_rate: number;     // %
  unique_effect: any | null;
  unique_unlocked: boolean;

  // 성장(접신 슬롯 · 무신도 노드)에서 오는 보정. 없으면 0이다.
  startGauge?: number;    // 개막 게이지 가산
  skillRateAdd?: number;  // 술법 발동 확률 가산 (%p)
  dotMit?: number;        // 불씨(지속피해) 경감 (고정값)
  facPierce?: number;     // 상성 열세일 때 관통 가산 (고정값)
  critAdd?: number;       // 치명 확률 가산 (0~1)
  coefAdd?: number;       // 평타 계수 가산

  // 전투 중 상태
  buffs: Buff[];
  dots: Dot[];
  uniqueUsed: boolean;
  cd: number;
}

interface Buff { stat: string; pct: number; turns: number }
interface Dot  { coef: number; turns: number; srcAp: number }

export interface LogLine {
  t: number;              // 턴
  actor?: string;
  op: string;
  target?: string;
  val?: number;
  crit?: boolean;
  text: string;
}

// ── 능력치 계산: 티어 기본 × 역할 × 버프 ──
function stat(u: Unit, key: "ap" | "dp" | "spd"): number {
  const base = u[key];
  let pct = 0;
  for (const b of u.buffs) if (b.stat === key) pct += b.pct;
  return Math.max(1, base * (1 + pct / 100));
}

function factionMult(a: Faction, d: Faction): number {
  if (RULE.BEATS[a] === d) return RULE.ADV;
  if (RULE.BEATS[d] === a) return RULE.DIS;
  return 1.0;
}

function damage(src: Unit, tgt: Unit, coef: number, rng: RNG): { val: number; crit: boolean } {
  const ap = stat(src, "ap");
  const pierce = RULE.ROLE[src.role]?.pierce ? 0.5 : 1.0;   // 암살자는 방어를 절반만 인정
  const dp = stat(tgt, "dp") * pierce;
  const mit = 1 - dp / (dp + RULE.DP_K);
  const fac = factionMult(src.faction, tgt.faction);
  const crit = rng.chance(RULE.CRIT_BASE + (src.critAdd || 0));
  let v = ap * coef * mit * fac * (crit ? RULE.CRIT_MULT : 1) * rng.range(RULE.VAR[0], RULE.VAR[1]);
  // 상성 열세를 뚫는다 — 저승 계열 접신 슬롯의 작용
  if (fac === RULE.DIS) v += src.facPierce || 0;
  return { val: Math.max(1, Math.round(v)), crit };
}

// ── 대상 고르기 ──
//  탱커가 살아 있으면 앞에서 맞는다. 그게 탱커의 존재 이유다.
//  암살자만 뒤로 파고들어 약한 쪽을 마무리한다. 그게 암살자의 존재 이유다.
function pickTargets(all: Unit[], src: Unit, target: string, rng: RNG): Unit[] {
  const foes = all.filter(u => u.side !== src.side && u.alive);
  const mates = all.filter(u => u.side === src.side && u.alive);
  const weakest = (xs: Unit[]) => xs.reduce((a, b) => (a.hp / a.maxhp) <= (b.hp / b.maxhp) ? a : b);

  switch (target) {
    case "enemy_one": {
      if (!foes.length) return [];
      if (RULE.ROLE[src.role]?.pierce) return [weakest(foes)];      // 암살자 — 후열 관통
      const tanks = foes.filter(u => u.role === "탱커");
      if (tanks.length && rng.chance(RULE.TAUNT)) return [rng.pick(tanks)];
      return [rng.pick(foes)];
    }
    case "enemy_all":  return foes;
    case "party":      return mates;
    case "self":       return [src];
    case "lowest_hp":  return mates.length ? [weakest(mates)] : [];
    default:           return foes.length ? [rng.pick(foes)] : [];
  }
}

// ── 효과 DSL 실행 ──
function runActions(all: Unit[], src: Unit, actions: any[], rng: RNG, log: LogLine[], turn: number) {
  for (const a of actions ?? []) {
    const tgts = pickTargets(all, src, a.target ?? "enemy_one", rng);
    for (const t of tgts) {
      switch (a.op) {
        case "dmg": {
          const { val, crit } = damage(src, t, a.coef ?? 1, rng);
          t.hp = Math.max(0, t.hp - val);
          if (t.hp === 0) t.alive = false;
          log.push({ t: turn, actor: src.name, op: "dmg", target: t.name, val, crit,
            text: `${src.name} → ${t.name} ${val}${crit ? " 치명!" : ""}${!t.alive ? " (쓰러짐)" : ""}` });
          break;
        }
        case "heal": {
          const v = Math.round(stat(src, "ap") * (a.coef ?? 1) * 0.9);
          const before = t.hp;
          t.hp = Math.min(t.maxhp, t.hp + v);
          log.push({ t: turn, actor: src.name, op: "heal", target: t.name, val: t.hp - before,
            text: `${src.name}이 ${t.name}을 ${t.hp - before} 돌린다` });
          break;
        }
        case "stat": {
          t.buffs.push({ stat: a.stat, pct: a.pct, turns: a.turns ?? 3 });
          log.push({ t: turn, actor: src.name, op: "stat", target: t.name, val: a.pct,
            text: `${t.name} ${a.stat} ${a.pct > 0 ? "+" : ""}${a.pct}%` });
          break;
        }
        case "dot": {
          t.dots.push({ coef: a.coef ?? 0.3, turns: a.turns ?? 3, srcAp: stat(src, "ap") });
          log.push({ t: turn, actor: src.name, op: "dot", target: t.name,
            text: `${t.name}에 불씨가 붙는다` });
          break;
        }
        case "cleanse": {
          const n = a.count ?? 1;
          let removed = 0;
          t.buffs = t.buffs.filter(b => (b.pct < 0 && removed++ < n) ? false : true);
          t.dots = t.dots.slice(0, Math.max(0, t.dots.length - n));
          log.push({ t: turn, actor: src.name, op: "cleanse", target: t.name,
            text: `${t.name}의 부정을 씻는다` });
          break;
        }
        case "gauge": {
          t.gauge = Math.max(0, t.gauge + (a.pct / 100) * RULE.GAUGE);
          log.push({ t: turn, actor: src.name, op: "gauge", target: t.name, val: a.pct,
            text: `${t.name} 기세 ${a.pct > 0 ? "+" : ""}${a.pct}%` });
          break;
        }
        // first_strike / explore 는 전투 밖(리더 보너스)에서 처리한다
      }
    }
  }
}

// ── 리더 보너스: 전투 시작 전에 한 번 ──
export function applyLeader(us: Unit[], leader: Unit, leaderEffect: any, log: LogLine[]) {
  if (!leaderEffect?.ops) return;
  for (const op of leaderEffect.ops) {
    if (op.op !== "stat") continue;                        // first_strike/explore는 전투 스탯이 아니다
    const tgts = (op.filter && op.filter !== "all")
      ? us.filter(u => u.faction === op.filter)
      : us;
    for (const t of tgts) t.buffs.push({ stat: op.stat, pct: op.pct, turns: 999 });
  }
  log.push({ t: 0, op: "leader", actor: leader.name,
    text: `${leader.name}이 앞에 선다 — ${leaderEffect.text ?? ""}` });
}

// ── 전투 본체 ──
//  tickScale: 보스전에서 적 격에 따라 게이지 충전을 늦춘다. 1이면 평시.
export function battle(us: Unit[], them: Unit[], seed: number | bigint, leaderEffect?: any, tickScale = 1) {
  const rng = new RNG(seed);
  const all = [...us, ...them];
  const log: LogLine[] = [];
  const tk = Number(tickScale) > 0 ? Number(tickScale) : 1;
  const maxTurn = Math.ceil(RULE.MAX_TURN / tk);           // 틱이 느려지면 상한도 비례해 늘린다

  // 초기 게이지를 흩는다. 안 그러면 배열 순서대로 먼저 때려서 us가 항상 유리하다.
  for (const u of all) u.gauge = rng.int(RULE.GAUGE) + (u.startGauge || 0);

  if (leaderEffect && us[0]) applyLeader(us, us[0], leaderEffect, log);

  // battle_start 트리거
  for (const u of all) {
    const eff = u.unique_unlocked ? u.unique_effect : null;
    for (const e of eff?.effects ?? []) {
      if (e.trigger === "battle_start") {
        log.push({ t: 0, actor: u.name, op: "unique", text: `【${eff.name}】 ${eff.text ?? ""}` });
        runActions(all, u, e.actions, rng, log, 0);
      }
    }
  }

  let turn = 0;
  while (turn < maxTurn) {
    turn++;
    // 게이지 충전
    for (const u of all) if (u.alive) u.gauge += stat(u, "spd") * tk;

    const ready = all.filter(u => u.alive && u.gauge >= RULE.GAUGE)
                     .sort((a, b) => b.gauge - a.gauge);
    if (!ready.length) continue;

    for (const u of ready) {
      if (!u.alive) continue;
      u.gauge -= RULE.GAUGE;

      // 지속 피해 — 물 계열 접신 슬롯이 붙어 있으면 덜 아프다
      for (const d of u.dots) {
        const v = Math.max(1, Math.round(d.srcAp * d.coef * 0.6) - (u.dotMit || 0));
        u.hp = Math.max(0, u.hp - v);
        log.push({ t: turn, op: "dot_tick", target: u.name, val: v, text: `${u.name} 불씨 ${v}` });
        d.turns--;
      }
      u.dots = u.dots.filter(d => d.turns > 0);
      if (u.hp === 0) { u.alive = false; log.push({ t: turn, op: "down", target: u.name, text: `${u.name} 쓰러짐` }); continue; }

      // 유니크 → 스킬 → 평타
      const eff = u.unique_unlocked ? u.unique_effect : null;
      const onCast = (eff?.effects ?? []).find((e: any) => e.trigger === "on_cast");
      if (onCast && !u.uniqueUsed && u.cd <= 0) {
        u.uniqueUsed = true; u.cd = onCast.cd ?? 4;
        log.push({ t: turn, actor: u.name, op: "unique", text: `【${eff.name}】 ${eff.text ?? ""}` });
        runActions(all, u, onCast.actions, rng, log, turn);
      } else if (u.skill_type && rng.chance(((u.skill_rate ?? 0) + (u.skillRateAdd || 0)) / 100)) {
        const map: Record<string, any[]> = {
          single: [{ op: "dmg", coef: u.skill_coef || 1.2, target: "enemy_one" }],
          heal:   [{ op: "heal", coef: u.skill_coef || 1.0, target: "lowest_hp" }],
          buff:   [{ op: "stat", stat: "dp", pct: 10, turns: 2, target: "party" }],
          debuff: [{ op: "stat", stat: "ap", pct: -8, turns: 2, target: "enemy_all" }],
        };
        runActions(all, u, map[u.skill_type] ?? map.single, rng, log, turn);
      } else {
        runActions(all, u, [{ op: "dmg", coef: RULE.BASIC + (u.coefAdd || 0), target: "enemy_one" }], rng, log, turn);
      }

      if (u.cd > 0) u.cd--;
      u.uniqueUsed = u.cd > 0;

      // 버프 감쇠
      for (const b of u.buffs) if (b.turns < 999) b.turns--;
      u.buffs = u.buffs.filter(b => b.turns > 0);

      if (!them.some(x => x.alive) || !us.some(x => x.alive)) break;
    }
    if (!them.some(x => x.alive) || !us.some(x => x.alive)) break;
  }

  const win = us.some(u => u.alive) && !them.some(u => u.alive);
  const draw = turn >= maxTurn && us.some(u => u.alive) && them.some(u => u.alive);
  log.push({ t: turn, op: "end", text: win ? "이겼다" : draw ? "해가 진다 (무승부)" : "졌다" });

  return {
    result: win ? "win" : draw ? "draw" : "lose",
    turns: turn,
    log,
    hp_state: us.map(u => ({ uid: u.uid, hp: u.hp, maxhp: u.maxhp, alive: u.alive })),
  };
}
