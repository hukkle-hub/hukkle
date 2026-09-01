// ═══════════════════════════════════════════════════════════
// 흥양기 — 게임 규칙 (전투 외 전부)
//
// 이 파일이 밸런스의 단일 원천이다. 숫자를 바꾸려면 여기만 만진다.
// 모든 판정은 seed에서 나온다. progression_log에 seed를 남기므로
// 유저가 "조작 아니냐"고 하면 그대로 재현해서 보여줄 수 있다.
// ═══════════════════════════════════════════════════════════
import { RNG } from "./engine.ts";

// ── 배틀 코스트 상한 ────────────────────────────────────────
//  ★ 예전 공식 (40 + lv×1.4) 은 틀렸다. 레벨 1 상한이 41인데
//    1성 5명이 60이라 시작하자마자 파티 5칸을 못 채웠다.
export const costCap = (level: number) => Math.floor(60 + level * 2.0);

//  Lv1  62  → 1성×5 (60)
//  Lv30 120 → 2성×5 (95) / 3성×4 (120)
//  Lv60 180 → 3성×5 (150)
//  Lv90 240 → 4성×5 (230)
//  Lv175 이상이어야 5성×5. 도달 불가 = 5성의 희소성이 코스트로 강제된다.

export const RULE2 = {
  HYANG_MAX: 120,          // 향(香) — 일반 던전 입장 재화
  HYANG_MIN: 6,            // 1회복에 걸리는 분(分)
  BUJEONG_MAX: 100,        // 부정(不淨). 100이면 강제 퇴각
  BUJEONG_PER_STEP: 4,     // 한 걸음마다 쌓인다
  BUJEONG_ON_LOSE: 25,     // 전투에서 지면 왕창 쌓인다

  PARTY_SIZE: 5,
  EXPLORE_STEPS: 10,       // 던전 한 판의 길이

  // 가챠 — 확률형 아이템 정보 표시 의무 대응. 이 숫자가 곧 공시값이다.
  GACHA: {
    COST_BOKCHAE: 30,      // 복채(福債) 1회
    RATE: { 1: 0.60, 2: 0.28, 3: 0.10, 4: 0.02 },  // 합 1.00. 5성은 어디서도 안 나온다.
    PITY: 90,              // 90회 안에 4성 확정
    PITY_SOFT: 75,         // 75회부터 4성 확률이 오른다
    PITY_SOFT_ADD: 0.06,   // 1회마다 +6%p
  },

  // 육성 — 진화(성급)·각성·유니크 해금
  //  정성(精誠)을 쌓으면 실패해도 다음 확률이 오른다. 무한 실패를 막는다.
  EVOLVE: {
    RATE:  { 2: 0.90, 3: 0.65, 4: 0.35, 5: 0.12 },  // n성 → n성이 되는 확률
    JEONG: { 2: 0.03, 3: 0.05, 4: 0.06, 5: 0.05 },  // 실패 1회당 오르는 폭
    CAP:   0.95,
    FEED:  { 2: 1, 3: 2, 4: 3, 5: 4 },              // 같은 성급 재료 장수
    YEOP:  { 2: 2000, 3: 8000, 4: 30000, 5: 120000 }, // 엽전
  },
  AWAKEN: {                 // 0~5. 같은 카드를 먹인다
    RATE: [0, 0.80, 0.65, 0.50, 0.35, 0.20],
    JEONG: 0.05, CAP: 0.95,
    SINMUL: [0, 20, 40, 80, 160, 320],              // 상급신물
  },
  UNIQUE: {                 // 5성 도달 후 신표(信標)로 해금
    RATE: 0.25, JEONG: 0.08, CAP: 0.90,
    SINPYO: 3,              // 카드 전용 신표 3개
  },

  // 정성을 미리 들인다 — 재료를 올려 게이지를 채운다
  //  여태 정성은 "실패해야만" 쌓였다. 그래서 성장이 도박이었다.
  //  이제 신물을 올리면 정성이 쌓이고, 게이지가 차면 올리면 된다.
  //  확률 공식은 그대로다. 오르는 경로만 하나 더 났을 뿐이다.
  JEONG: {
    MAT: "하급신물",
    YEOP_PER: 1500,        // 신물 하나를 올릴 때 같이 드는 복채
    MAX_AT_ONCE: 20,
  },

  // 씻김(解冤) — D15 소록도. 전투가 아니다.
  //  원(冤)을 풀어야 카드가 풀려난다. 실패해도 재료는 안 잃는다.
  SSITGIM: {
    STEPS: 5,               // 초가망석 → 넋올림 → 고풀이 → 씻김 → 길닦음
    KNOT_MIN_MS: 220,       // 고풀이 매듭 하나의 최소 시간. 이보다 빠르면 매크로다.
    KNOTS: 7,
    BASE: 0.40,
    PER_JEONG: 0.10,        // 정성 1당
    CLEANSE: 30,            // 성공 시 부정 감소
  },

  // 플레이어 격 — 던전 정산에서 오른다.
  //  ★ 이게 없으면 배틀 코스트 상한(60+lv×2)이 62에 묶여 1성 5장(60)에서 끝난다.
  //    level_req 4 인 D02 조차 LOW_LEVEL 로 영영 못 들어간다. 게임이 D01 에서 멈춘다.
  //    곡선은 라이브 DB 7명의 (level, exp) 와 정확히 맞춰 확인했다.
  PLAYER_LV: { NEED: (lv: number) => lv * 100 + 50 },

  // 카드 격(레벨) — 던전 정산에서 오른다
  CARD_LV: {
    CAP_PER_TIER: 8,        // 성급 × 8 이 상한. 5성이면 40
    NEED: (lv: number) => lv * 60 + 40,
  },

  // 무신도 노드 — 격을 열어 능력을 붙인다
  NODE: {
    COST: {
      AP_1: { level: 1, yeop: 5000,  hon: 2 },
      AP_2: { level: 1, yeop: 5000,  hon: 2 },
      DP_1: { level: 2, yeop: 15000, hon: 5 },
      DP_2: { level: 2, yeop: 15000, hon: 5 },
      CRIT_1: { level: 3, yeop: 40000, hon: 12 },
      COEF_1: { level: 3, yeop: 40000, hon: 12 },
    } as Record<string, { level: number; yeop: number; hon: number }>,
    LV_GATE: { 1: 10, 2: 25, 3: 40 } as Record<number, number>,
    HON: "영험한혼",
    RESET_FEE: 20000,
    // 실제 수치 — 전투 엔진이 이 값을 읽는다
    EFFECT: { AP: 15, DP: 8, CRIT: 0.01, COEF: 0.02 },
  },

  // 걸음 사이 회복 — 「숨을 고른다」
  //  ★ 이게 없으면 첫 던전 클리어율이 0%다. 짐작이 아니라 실측이다(600회).
  //    5대5 동성급전은 만전에서 98.5% 이기지만 HP 70%로 붙으면 진다 — 여유가 없는 눈덩이 구조다.
  //    이겨도 평균 3.6명만 남고 HP 40%가 남는다. 그 상태로 다음 걸음을 만나면 99%가 죽는다.
  //    부활을 75%로 낮추면 61%, 50%면 3%, 40%면 0%. 중간값이 없어서 온전히 되돌린다.
  //    던전의 압박은 HP가 아니라 부정(不淨)이 진다 — 한 판이라도 지면 그 자리에서 끝난다.
  STEP_RECOVER: { HP: 1.0, REVIVE: 1.0 },


  // 적 전투력 곡선 — 계단이 아니라 플레이어 곡선에 붙인다.
  //  ★ 예전엔 성급 = ceil(level_req/22) 로 계단처럼 뛰었다. 실측한 계단은 세 곳:
  //    D07(+78%) · D11(+77%) · D16(+72%). 그런데 전투의 전이 구간 폭은 16%다
  //    (적 전투력 16% 안에서 클리어율 90%→10%). 계단이 폭의 4~5배라 반드시 벽이 선다.
  //    계단 사이 구간은 반대로 1~5% 밖에 안 움직여서 난이도가 아예 없었다.
  //    → 평평 · 절벽 · 평평 · 절벽. 곡선이 아니었다.
  //
  //    고친 방식: 적 전투력을 '그 레벨에 플레이어가 낼 수 있는 파티 전투력'에 비례시킨다.
  //    클리어율 80%가 나오는 적 전투력을 던전마다 역산했더니, 그 비율이 사다리 전 구간에서
  //    0.0606 ± 11% 로 일정했다. 계단이 아니라 여기에 붙이면 던전 간 도약이 0~37%로 줄고
  //    대부분 폭(16%) 안에 들어온다.
  //
  //    RATIO 하나로 사다리 전체 난이도를 조절한다. 0.056 이 실측 기준선(전 구간 95~100%).
  //    올리면 전 구간이 같이 어려워진다 — 0.060 이면 29~100% 로 널뛰므로 그 위는 권하지 않는다.
  //    첫 구간은 따로 눕힌다 — 고정 비율이면 D01 이 61% 로 사다리에서 제일 어려웠다.
  //    시작 파티가 절대치로 약해 한 판의 흔들림이 가장 큰 구간이기 때문이다.
  //    튜토리얼이 제일 어려운 건 거꾸로다. EASE_LV 까지 EASE_FROM 에서 RATIO 로 올린다.
  FOE: {
    RATIO: 0.056,
    EASE_FROM: 0.044,                  // 입장격 1 에서의 비율
    EASE_LV: 16,                       // 여기까지 RATIO 로 올라간다
    W: { ap: 1, dp: 1.6, hp: 0.28 },   // 전투력 환산 가중치
  },

  // 보스 걸음
  //  ★ 예전엔 +1성 ×1.45 였다. 1성 파티가 만전으로 붙어도 승률 0%.
  //    동성급으로 내리면 100%다. 클리어율 0%의 절반은 이것 때문이었다.
  BOSS: { MULT: 1.20, TIER_BUMP: 0, COUNT: 3 },

  SLOT_MAX: 2,              // 접신 자리는 둘뿐이다
  GHOST_TTL_H: 12,          // 이 시간을 넘긴 active 세션은 유령이다. 정산하고 닫는다.
} as const;

// ── 가챠 판정 ──────────────────────────────────────────────
export function gachaRoll(rng: RNG, pity: number, pool: { id: string; min: number; max: number }[]) {
  const G = RULE2.GACHA;
  let r4: number = G.RATE[4];
  if (pity >= G.PITY - 1) r4 = 1.0;                                  // 천장
  else if (pity >= G.PITY_SOFT) r4 += (pity - G.PITY_SOFT + 1) * G.PITY_SOFT_ADD;

  const x = rng.next();
  let tier: number;
  if (x < r4) tier = 4;
  else {
    const rest = 1 - r4;
    const y = (x - r4) / rest;                                        // 남은 확률을 1~3성에 비례 분배
    const s = G.RATE[1] + G.RATE[2] + G.RATE[3];
    tier = y < G.RATE[1] / s ? 1 : y < (G.RATE[1] + G.RATE[2]) / s ? 2 : 3;
  }

  const cands = pool.filter(c => c.min <= tier && tier <= c.max);
  if (!cands.length) return null;
  return { card: rng.pick(cands).id, tier, pity_after: tier === 4 ? 0 : pity + 1 };
}

// ── 육성 판정 — 정성이 쌓이면 확률이 오른다 ─────────────────
export function growRate(base: number, jeongPer: number, jeong: number, cap: number) {
  return Math.min(cap, base + jeongPer * jeong);
}

// 상한에 닿는 데 필요한 정성 횟수. 그 이상은 받지 않는다 — 엽전만 버리게 둘 수 없다.
export function jeongNeeded(base: number, jeongPer: number, cap: number) {
  if (jeongPer <= 0) return 0;
  return Math.ceil((cap - base) / jeongPer);
}

// ── 고풀이 검증 — 서버가 판정한다 ───────────────────────────
//  클라이언트가 보낸 매듭 타이밍이 사람이 낼 수 있는 값인지 본다.
export function verifyGopuli(knots: number[]): { ok: boolean; why?: string } {
  const S = RULE2.SSITGIM;
  if (!Array.isArray(knots) || knots.length !== S.KNOTS)
    return { ok: false, why: `매듭이 ${S.KNOTS}개여야 한다 (받은 값: ${knots?.length ?? 0})` };
  for (let i = 0; i < knots.length; i++) {
    if (!Number.isFinite(knots[i]) || knots[i] < S.KNOT_MIN_MS)
      return { ok: false, why: `${i + 1}번째 매듭이 ${knots[i]}ms — 최소 ${S.KNOT_MIN_MS}ms` };
  }
  // 전부 똑같은 간격이면 사람이 아니다
  const avg = knots.reduce((a, b) => a + b, 0) / knots.length;
  const dev = Math.sqrt(knots.reduce((s, k) => s + (k - avg) ** 2, 0) / knots.length);
  if (dev < 8) return { ok: false, why: `매듭 간격이 너무 고르다 (편차 ${dev.toFixed(1)}ms)` };
  return { ok: true };
}

// ── 드랍 판정 ──────────────────────────────────────────────
export function rollDrops(rng: RNG, dungeon: any) {
  const mats: Record<string, number> = {};
  for (const [name, d] of Object.entries<any>(dungeon.drops ?? {})) {
    if (rng.chance(d.rate)) mats[name] = (mats[name] ?? 0) + d.per;
  }
  const cards: { id: string; tier: number }[] = [];
  for (const c of dungeon.card_drops ?? []) {
    if (rng.chance(c.rate)) cards.push({ id: c.id, tier: c.tier });
  }
  return { mats, cards };
}

// ── 적 전투력 ──────────────────────────────────────────────
//  그 레벨의 배틀 코스트 상한 안에서 플레이어가 낼 수 있는 가장 센 다섯을 세우고,
//  그 전투력에 비례해 적을 만든다. 서버와 시뮬레이션이 같은 함수를 쓴다.
export function bestMix(tiers: any[], level: number): number[] {
  const cap = costCap(level);
  const W = RULE2.FOE.W;
  const pw = (t: number) => { const x = tiers.find((y:any)=>y.tier===t); return x.ap*W.ap + x.dp*W.dp + x.hp*W.hp; };
  const cost = (t: number) => tiers.find((y:any)=>y.tier===t).cost;
  let best = [1,1,1,1,1], bestP = pw(1) * RULE2.PARTY_SIZE;
  const rec = (i: number, cur: number[], c: number) => {
    if (c > cap) return;
    if (i === RULE2.PARTY_SIZE) {
      const p = cur.reduce((a,t)=>a+pw(t),0);
      if (p > bestP) { bestP = p; best = [...cur]; }
      return;
    }
    // 내림차순으로만 훑어 같은 조합을 두 번 세지 않는다
    for (let t = cur[i-1] ?? 5; t >= 1; t--) rec(i+1, [...cur, t], c + cost(t));
  };
  rec(0, [], 0);
  return [...best].sort((a,b)=>b-a);
}

export function partyPower(tiers: any[], level: number): number {
  const W = RULE2.FOE.W;
  return bestMix(tiers, level).reduce((a, t) => {
    const x = tiers.find((y:any)=>y.tier===t);
    return a + x.ap*W.ap + x.dp*W.dp + x.hp*W.hp;
  }, 0);
}

/* 적 한 위(位)의 절대 전투력. 성급은 이 안에 들어가는 가장 높은 값,
   나머지는 배율로 둔다 — 성급이 올라도 총 전투력이 끊기지 않는다. */
export function foeRatio(levelReq: number): number {
  const F = RULE2.FOE;
  const L = Math.max(1, levelReq);
  if (L >= F.EASE_LV) return F.RATIO;
  const t = (L - 1) / (F.EASE_LV - 1);          // 0 → 1
  return F.EASE_FROM + (F.RATIO - F.EASE_FROM) * t;
}

export const foePower = (tiers: any[], levelReq: number) =>
  partyPower(tiers, Math.max(1, levelReq)) * foeRatio(levelReq);
