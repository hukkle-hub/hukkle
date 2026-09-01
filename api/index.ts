// ═══════════════════════════════════════════════════════════
// 흥양기(興陽記) — API
//
//   마스터 조회 / 플레이어 / 파티 / 탐험 · 전투 · 드랍 / 육성 / 씻김
//
// 원칙
//   · 클라이언트는 아무것도 결정하지 않는다. 결과를 받아 보여줄 뿐이다.
//   · 모든 판정은 seed 하나에서 나온다. 로그에 seed를 남기므로 그대로 재현된다.
//   · 히든 카드 정보는 /master 에서 잘라낸다. 클라이언트가 미리 알면 안 된다.
//
// 인증: JWT가 아니라 x-player 헤더다. 배포 시 verify_jwt=false 필수.
// ═══════════════════════════════════════════════════════════
import { createClient } from "jsr:@supabase/supabase-js@2";
import { battle, RULE, RNG, type Unit, type Faction } from "./engine.ts";
import { costCap, foePower, RULE2, rollDrops } from "./rules.ts";
import { sinpyoFor } from "./sinpyo.ts";
import {
  awaken, evolve, gacha, ssitgim, unlockUnique,
  growSlot, unlockMasteryNode, resetMasteryNodes, growJeong, growthMeta,
} from "./routes2.ts";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,   // service_role — RLS를 우회한다. 절대 클라이언트에 나가면 안 된다.
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-player",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const ok = (d: unknown) => new Response(JSON.stringify(d), { headers: { ...CORS, "Content-Type": "application/json" } });
const err = (code: string, msg: string, extra: Record<string, unknown> = {}, status = 400) =>
  new Response(JSON.stringify({ error: code, message: msg, ...extra }), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });

// ── 마스터 캐시 (콜드 스타트당 1회) ──────────────────────────
let MC: any[] | null = null, MD: any[] | null = null, MT: any[] | null = null;
async function master() {
  if (!MC) {
    const [c, d, t] = await Promise.all([
      sb.from("master_card").select("*").eq("is_active", true),
      sb.from("master_dungeon").select("*"),
      sb.from("master_tier").select("*"),
    ]);
    if (c.error || d.error || t.error) throw new Error("마스터 로드 실패: " + (c.error ?? d.error ?? t.error)!.message);
    MC = c.data; MD = d.data; MT = t.data.sort((a: any, b: any) => a.tier - b.tier);
  }
  return { cards: MC!, dungeons: MD!, tiers: MT! };
}
const card = (m: any, id: string) => m.cards.find((c: any) => c.id === id);
const tierOf = (m: any, t: number) => m.tiers.find((x: any) => x.tier === t);

// ── 향(香) 자연 회복 ────────────────────────────────────────
function regenHyang(p: any) {
  const mins = (Date.now() - new Date(p.hyang_updated_at).getTime()) / 60000;
  const gain = Math.floor(mins / RULE2.HYANG_MIN);
  if (gain <= 0 || p.hyang >= RULE2.HYANG_MAX) return p;
  p.hyang = Math.min(RULE2.HYANG_MAX, p.hyang + gain);
  p.hyang_updated_at = new Date().toISOString();
  return p;
}

// ── 성장 보정 — 접신 슬롯 + 무신도 노드를 전투 수치로 편다 ──
//  클라이언트는 이 계산을 못 한다. 전부 여기서 접어 넣는다.
function growthBonus(pc: any) {
  const b = { ap: 0, dp: 0, hp: 0, startGauge: 0, skillRateAdd: 0, dotMit: 0, facPierce: 0, critAdd: 0, coefAdd: 0 };
  const meta = growthMeta(pc);
  const E = RULE2.NODE.EFFECT;

  for (const s of meta.slots) {
    if (!s) continue;
    const v = Number(s.val) || 0;
    if (s.op === "flat_stat") {
      if (s.stat === "ap") b.ap += v;
      else if (s.stat === "dp") b.dp += v;
      else if (s.stat === "hp") b.hp += v;
    }
    else if (s.op === "start_gauge_flat")    b.startGauge += v;
    else if (s.op === "skill_rate_add")      b.skillRateAdd += v;
    else if (s.op === "dot_mitigation_flat") b.dotMit += v;
    else if (s.op === "faction_pierce_flat") b.facPierce += v;
  }
  for (const n of meta.nodes) {
    if (n === "AP_1" || n === "AP_2") b.ap += E.AP;
    else if (n === "DP_1" || n === "DP_2") b.dp += E.DP;
    else if (n === "CRIT_1") b.critAdd += E.CRIT;
    else if (n === "COEF_1") b.coefAdd += E.COEF;
  }
  return b;
}

// ── player_card → 전투 유닛 ────────────────────────────────
function toUnit(m: any, pc: any, side: "us" | "them"): Unit {
  const c = card(m, pc.card_id);
  const t = tierOf(m, pc.tier);
  const r = RULE.ROLE[c.role] ?? RULE.ROLE["밸런스"];

  const lv = 1 + ((Number(pc.level) || 1) - 1) * 0.015;   // 레벨 보정: 40레벨에 1.6배
  const aw = 1 + (pc.awaken ?? 0) * 0.06;                 // 각성 보정: 1단계당 +6%
  const k = lv * aw;
  const g = growthBonus(pc);

  return {
    uid: String(pc.id), card_id: c.id, name: c.name,
    faction: c.faction as Faction, role: c.role, tier: pc.tier, side,
    ap: t.ap * r.ap * k + g.ap,
    dp: t.dp * r.dp * k + g.dp,
    hp: t.hp * r.hp * k + g.hp,
    maxhp: t.hp * r.hp * k + g.hp,
    spd: t.spd_base + (c.spd_mod ?? 0) + r.spd,
    gauge: 0, alive: true,
    skill_type: c.skill_type, skill_coef: Number(c.skill_coef ?? 1), skill_rate: c.skill_rate ?? 0,
    unique_effect: c.unique_effect,
    unique_unlocked: !!pc.unique_unlocked && pc.tier >= 5,   // 유니크는 5성부터
    startGauge: g.startGauge, skillRateAdd: g.skillRateAdd, dotMit: g.dotMit,
    facPierce: g.facPierce, critAdd: g.critAdd, coefAdd: g.coefAdd,
    buffs: [], dots: [], uniqueUsed: false, cd: 0,
  };
}

// ── 적 생성: 던전 세력 + 진행도에 맞춰 ──────────────────────
function makeFoes(m: any, dun: any, step: number, rng: RNG): Unit[] {
  const facs: string[] = dun.factions ?? ["당"];
  const boss = step >= RULE2.EXPLORE_STEPS;
  const lvReq = dun.level_req ?? 1;
  const B = RULE2.BOSS;

  /* 전투력을 먼저 정하고, 성급은 그 안에 들어가는 가장 높은 값으로 둔다.
     성급이 한 칸 올라도 총 전투력이 끊기지 않는다 — 계단이 사라진다. */
  const P = foePower(m.tiers, lvReq);
  let fit = 1;
  for (const t of m.tiers) if (t.ap <= P) fit = t.tier;
  const tier = Math.max(1, Math.min(5, fit + (boss ? B.TIER_BUMP : 0)));
  /* 배율이 1 미만이어도 막지 않는다. 초반에는 원하는 전투력이 1성 기준보다 낮은데,
     1 로 잘라버리면 첫 던전을 눕힐 방법이 아예 없어진다(실측 61%에서 안 움직였다). */
  const kBase = Math.max(0.5, P / tierOf(m, tier).ap);

  const pool = m.cards.filter((c: any) => facs.includes(c.faction) && !c.hidden);

  const n = boss ? B.COUNT : RULE2.PARTY_SIZE;
  const out: Unit[] = [];
  for (let i = 0; i < n; i++) {
    const c = rng.pick(pool);
    const t = tierOf(m, tier);
    const r = RULE.ROLE[c.role] ?? RULE.ROLE["밸런스"];
    const k = kBase * (boss ? B.MULT : 1.0);
    out.push({
      uid: `e${step}_${i}`,
      card_id: c.id,
      name: (boss && i === 0 && dun.bosses?.length) ? rng.pick(dun.bosses) : c.name,
      faction: c.faction, role: c.role, tier, side: "them",
      ap: t.ap * r.ap * k, dp: t.dp * r.dp * k, hp: t.hp * r.hp * k, maxhp: t.hp * r.hp * k,
      spd: t.spd_base + (c.spd_mod ?? 0) + r.spd,
      gauge: 0, alive: true,
      skill_type: c.skill_type, skill_coef: Number(c.skill_coef ?? 1), skill_rate: c.skill_rate ?? 0,
      unique_effect: null, unique_unlocked: false,           // 적은 유니크를 안 쓴다
      buffs: [], dots: [], uniqueUsed: false, cd: 0,
    });
  }
  return out;
}

// 보스 ATB 배율 — 보스 카드의 격을 보고 정한다 (design_decision #25)
function tickScaleFor(m: any, dun: any, step: number) {
  if (step < RULE2.EXPLORE_STEPS) return 1;
  const bc = dun.boss_card ? card(m, dun.boss_card) : null;
  return (bc && RULE.TICK_SCALE[bc.godhood]) || 1;
}

// ── 카드 격(레벨) ───────────────────────────────────────────
const lvCap = (t: any) => Math.max(1, Math.min(5, Number(t) || 1)) * RULE2.CARD_LV.CAP_PER_TIER;
const lvNeed = RULE2.CARD_LV.NEED;

function grantExp(pc: any, gain: number) {
  const cap = lvCap(pc.tier);
  let lv = Math.max(1, Number(pc.level) || 1);
  let exp = Math.max(0, Number(pc.exp) || 0) + Math.max(0, Math.round(gain));
  let ups = 0;
  while (lv < cap && exp >= lvNeed(lv)) { exp -= lvNeed(lv); lv++; ups++; }
  return { level: lv, exp, ups, cap, capped: lv >= cap };
}

// 던전 정산에서 파티 전원에게 경험치를 준다. 실패해도 30%는 준다.
async function partyExp(pid: string, sessionId: string, cleared: boolean, dun: any) {
  try {
    const base = (Number(dun && dun.level_req) || 1) * 12 + 40;
    const gain = cleared ? base : Math.round(base * 0.3);
    if (gain <= 0) return [];

    const { data: sess } = await sb.from("explore_session").select("party_snapshot")
      .eq("id", sessionId).maybeSingle();
    const cards = sess?.party_snapshot?.cards;
    if (!Array.isArray(cards) || !cards.length) return [];

    const ids = cards.map((c: any) => c.id).filter((x: any) => x != null);
    if (!ids.length) return [];

    const { data: rows } = await sb.from("player_card")
      .select("id, level, exp, tier, card_id")
      .eq("player_id", pid).in("id", ids).is("sacrificed_at", null);
    if (!rows || !rows.length) return [];

    const out: any[] = [];
    for (const pc of rows) {
      const r = grantExp(pc, gain);
      const up = await sb.from("player_card").update({ level: r.level, exp: r.exp })
        .eq("id", pc.id).eq("player_id", pid);
      if (up.error) continue;
      out.push({
        id: pc.id, card_id: pc.card_id, gained: gain,
        level: r.level, exp: r.exp, need: lvNeed(r.level),
        cap: r.cap, leveled: r.ups > 0, capped: r.capped,
      });
    }
    return out;
  } catch (_) { return []; }
}

// ── 정산 — 세션을 닫고 전리품을 실제 재화로 바꾼다 ───────────
async function settle(pid: string, sessionId: string, loot: any[], cleared: boolean, dun: any) {
  const mats: Record<string, number> = {};
  const cards: { id: string; tier: number }[] = [];
  for (const l of loot ?? []) {
    for (const [k, v] of Object.entries<any>(l.mats ?? {})) mats[k] = (mats[k] ?? 0) + Number(v);
    for (const c of l.cards ?? []) cards.push(c);
  }

  // 신물 배율 — 던전마다 다르다
  const mult = Number(dun?.sinmul_mult ?? 1) || 1;
  for (const k of Object.keys(mats)) mats[k] = Math.round(mats[k] * mult);

  for (const [k, v] of Object.entries(mats)) {
    if (!v) continue;
    const { data: cur } = await sb.from("player_material").select("qty")
      .eq("player_id", pid).eq("material_id", k).maybeSingle();
    await sb.from("player_material").upsert(
      { player_id: pid, material_id: k, qty: Math.max(0, (cur?.qty ?? 0) + v) },
      { onConflict: "player_id,material_id" },
    );
  }

  const gained: any[] = [];
  for (const c of cards) {
    const { data: pc } = await sb.from("player_card").insert({
      player_id: pid, card_id: c.id, tier: c.tier, obtained_from: "dungeon",
    }).select().single();
    gained.push({ id: pc?.id, card_id: c.id, tier: c.tier });

    const { data: al } = await sb.from("player_album").select("max_tier_seen")
      .eq("player_id", pid).eq("card_id", c.id).maybeSingle();
    if (!al) await sb.from("player_album").insert({ player_id: pid, card_id: c.id, max_tier_seen: c.tier });
    else if (al.max_tier_seen < c.tier)
      await sb.from("player_album").update({ max_tier_seen: c.tier })
        .eq("player_id", pid).eq("card_id", c.id);
  }

  // 엽전 — 클리어했을 때만 준다
  const yeop = cleared ? (Number(dun?.level_req ?? 1) * 120 + 300) : 0;

  // 플레이어 격 — 카드와 같은 양을 받는다. 실패해도 30%.
  //  배틀 코스트 상한이 여기서 풀린다. 이게 없으면 던전 사다리를 한 칸도 못 오른다.
  const expGain = (() => {
    const base = (Number(dun?.level_req) || 1) * 12 + 40;
    return cleared ? base : Math.round(base * 0.3);
  })();

  let lvUp: any = null;
  {
    const { data: p } = await sb.from("player").select("level, exp, yeopjeon").eq("id", pid).maybeSingle();
    if (p) {
      let lv = Math.max(1, Number(p.level) || 1);
      let exp = Math.max(0, Number(p.exp) || 0) + expGain;
      const from = lv;
      while (exp >= RULE2.PLAYER_LV.NEED(lv)) { exp -= RULE2.PLAYER_LV.NEED(lv); lv++; }
      await sb.from("player").update({
        level: lv, exp,
        yeopjeon: Number(p.yeopjeon ?? 0) + yeop,
      }).eq("id", pid);
      if (lv > from) lvUp = { from, to: lv, cost_cap: costCap(lv) };
    }
  }

  await sb.from("explore_session").update({
    status: cleared ? "cleared" : "abandoned",
    updated_at: new Date().toISOString(),
  }).eq("id", sessionId);

  //  ★ 키 이름은 클라이언트 계약이다. rewardHtml() 이 exp · level_up.cost_cap 을 읽는다.
  return { materials: mats, cards: gained, yeopjeon: yeop, cleared,
           exp: expGain, level_up: lvUp };
}

// ── 유령 세션 청소기 ────────────────────────────────────────
//  앱을 끄고 사라진 세션이 active로 남아 다른 던전을 영영 못 들어가게 만든다.
//  updated_at 기준으로 오래된 것만 정산하고 닫는다.
async function sweepGhosts(m: any, pid: string) {
  try {
    const cutoff = new Date(Date.now() - RULE2.GHOST_TTL_H * 3600e3).toISOString();
    const { data: ghosts, error } = await sb.from("explore_session")
      .select("id, loot, dungeon_id").eq("player_id", pid).eq("status", "active")
      .lt("updated_at", cutoff).limit(5);
    if (error || !ghosts || !ghosts.length) return 0;

    let n = 0;
    for (const gs of ghosts) {
      const dun = m.dungeons.find((d: any) => d.id === gs.dungeon_id);
      const up = await sb.from("explore_session").update({ status: "abandoned" })
        .eq("id", gs.id).eq("player_id", pid);
      if (up.error) continue;
      try { await settle(pid, gs.id, gs.loot ?? [], false, dun); } catch (_) { /* 정산 실패가 청소를 막지는 않는다 */ }
      n++;
    }
    return n;
  } catch (_) { return 0; }
}

// ═══════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/[^/]+/, "");     // 함수명 제거
  const pid = req.headers.get("x-player") ?? "";
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  try {
    const m = await master();

    // ── 마스터 ─────────────────────────────────────────────
    if (path === "/master") {
      // 히든은 존재를 숨긴다. 해금 조건도, 스킬도 안 준다.
      const cards = m.cards.filter((c: any) => !c.hidden).map((c: any) => ({
        id: c.id, name: c.name, faction: c.faction, godhood: c.godhood, rarity: c.rarity,
        role: c.role, skill: c.skill, skill_type: c.skill_type, spd_mod: c.spd_mod,
        skill_rate: c.skill_rate, skill_coef: c.skill_coef, persona: c.persona,
        unique_skill: c.unique_skill, unique_effect: c.unique_effect,
        leader_bonus: c.leader_bonus, leader_effect: c.leader_effect,
        flavor: c.flavor, source: c.source, art_url: c.art_url, sinpyo_id: c.sinpyo_id,
        gacha_min_tier: c.gacha_min_tier, gacha_max_tier: c.gacha_max_tier,
      }));
      return ok({
        cards, dungeons: m.dungeons, tiers: m.tiers,
        rule: {
          cost_cap_formula: "60 + level * 2.0",
          gacha_rate: RULE2.GACHA.RATE, gacha_pity: RULE2.GACHA.PITY,
          evolve_rate: RULE2.EVOLVE.RATE, hyang_max: RULE2.HYANG_MAX,
          party_size: RULE2.PARTY_SIZE, explore_steps: RULE2.EXPLORE_STEPS,
          jeong: { material: RULE2.JEONG.MAT, yeop_per: RULE2.JEONG.YEOP_PER },
          node: RULE2.NODE.COST, node_gate: RULE2.NODE.LV_GATE, node_effect: RULE2.NODE.EFFECT,
          card_lv_cap_per_tier: RULE2.CARD_LV.CAP_PER_TIER,
        },
        hidden_count: m.cards.filter((c: any) => c.hidden).length,   // 몇 장 있는지만 알려준다
      });
    }

    // ── 플레이어 만들기 ────────────────────────────────────
    if (path === "/player/init" && req.method === "POST") {
      const nick = String(body.nickname ?? "").trim();
      if (!nick || nick.length > 12) return err("BAD_NICK", "이름은 1~12자여야 한다");

      const { data: p, error } = await sb.from("player").insert({ nickname: nick }).select().single();
      if (error) return err("DB", "플레이어 생성 실패", { detail: error.message }, 500);

      // 시작 카드: 1성 5장 (당 2 · 물 2 · 저승 1) — 파티 다섯 자리를 처음부터 채운다
      const starters = ["C001", "C005", "C041", "C046", "C081"];
      await sb.from("player_card").insert(starters.map(id => ({
        player_id: p.id, card_id: id, tier: 1, obtained_from: "start",
      })));
      await sb.from("player_album").insert(starters.map(id => ({
        player_id: p.id, card_id: id, max_tier_seen: 1,
      })));
      return ok({ player: p, starters });
    }

    if (!pid) return err("NO_PLAYER", "x-player 헤더가 없다", {}, 401);

    // ── 내 상태 ────────────────────────────────────────────
    if (path === "/player") {
      const { data: p, error } = await sb.from("player").select("*").eq("id", pid).maybeSingle();
      if (error || !p) return err("NO_PLAYER", "그런 플레이어가 없다", {}, 404);
      regenHyang(p);
      await sb.from("player").update({ hyang: p.hyang, hyang_updated_at: p.hyang_updated_at }).eq("id", pid);

      const [cards, mats, parties, tickets, unlocks, album, sess] = await Promise.all([
        sb.from("player_card").select("*").eq("player_id", pid).is("sacrificed_at", null),
        sb.from("player_material").select("*").eq("player_id", pid),
        sb.from("player_party").select("*").eq("player_id", pid),
        sb.from("player_ticket").select("*").eq("player_id", pid),
        sb.from("player_unlock").select("*").eq("player_id", pid),
        sb.from("player_album").select("*").eq("player_id", pid),
        sb.from("explore_session").select("*").eq("player_id", pid)
          .eq("status", "active").limit(1).maybeSingle(),
      ]);
      return ok({
        player: p, cost_cap: costCap(p.level),
        cards: cards.data ?? [], materials: mats.data ?? [],
        parties: parties.data ?? [], tickets: tickets.data ?? [],
        unlocks: unlocks.data ?? [], album: album.data ?? [],
        session: sess.data ?? null,          // 새로고침해도 던전에 갇히지 않게 같이 내려준다
      });
    }

    // ── 파티 저장 ──────────────────────────────────────────
    if (path === "/party" && req.method === "POST") {
      const { slot_no, card_ids, leader_idx = 0 } = body;
      if (!Array.isArray(card_ids) || card_ids.length < 1 || card_ids.length > RULE2.PARTY_SIZE)
        return err("BAD_PARTY", `파티는 1~${RULE2.PARTY_SIZE}명이다`);
      if (new Set(card_ids).size !== card_ids.length)
        return err("DUP_CARD", "같은 카드를 두 번 넣을 수 없다");

      const { data: p } = await sb.from("player").select("level").eq("id", pid).maybeSingle();
      const { data: pcs } = await sb.from("player_card").select("*")
        .eq("player_id", pid).in("id", card_ids).is("sacrificed_at", null);
      if (!pcs || pcs.length !== card_ids.length)
        return err("NOT_OWNED", "가지고 있지 않은 카드가 있다");

      const cost = pcs.reduce((s: number, pc: any) => s + tierOf(m, pc.tier).cost, 0);
      const cap = costCap(p!.level);
      if (cost > cap)
        return err("COST_OVER", `배틀 코스트 ${cost}이 상한 ${cap}을 넘는다`, { cost, cap });

      const { error } = await sb.from("player_party").upsert(
        { player_id: pid, slot_no: Number(slot_no ?? 1), card_ids, leader_idx },
        { onConflict: "player_id,slot_no" },
      );
      if (error) return err("DB", "파티 저장 실패", { detail: error.message }, 500);
      return ok({ saved: true, slot_no: Number(slot_no ?? 1), card_ids, leader_idx, cost, cap });
    }

    // ── 탐험 시작 ──────────────────────────────────────────
    if (path === "/explore/start" && req.method === "POST") {
      const dun = m.dungeons.find((d: any) => d.id === body.dungeon_id);
      if (!dun) return err("NO_DUNGEON", "그런 던전이 없다");

      // 먼저 유령을 치운다. 이걸 안 하면 예전 세션에 막혀 영영 못 들어간다.
      await sweepGhosts(m, pid);

      const { data: u } = await sb.from("explore_session").select("id")
        .eq("player_id", pid).eq("status", "active").limit(1).maybeSingle();
      if (u) return err("IN_PROGRESS", "이미 길 위에 있다", { session_id: u.id });

      const { data: p } = await sb.from("player").select("*").eq("id", pid).maybeSingle();
      if (!p) return err("NO_PLAYER", "그런 플레이어가 없다", {}, 404);
      regenHyang(p);

      if ((dun.level_req ?? 1) > p.level)
        return err("LOW_LEVEL", `격이 모자라다 (${p.level}/${dun.level_req})`, { have: p.level, need: dun.level_req });

      const { data: pt } = await sb.from("player_party").select("*")
        .eq("player_id", pid).eq("slot_no", Number(body.slot_no ?? 1)).maybeSingle();
      if (!pt || !pt.card_ids?.length) return err("NO_PARTY", "당(黨)을 먼저 세워야 한다");
      if (pt.card_ids.length < RULE2.PARTY_SIZE)
        return err("PARTY_SHORT", `다섯 위를 다 세워야 든다 (지금 ${pt.card_ids.length}위 · ${RULE2.PARTY_SIZE}위 필요)`);

      // 특별 던전은 입장권, 일반 던전은 향
      const cost = Number(dun.hyang_cost ?? 0);
      let ticketLeft: number | null = null;
      if (dun.kind === "special") {
        const { data: tk } = await sb.from("player_ticket").select("*")
          .eq("player_id", pid).eq("dungeon_id", dun.id).maybeSingle();
        const have = Number(tk?.tickets ?? 0);
        if (have < 1) return err("NO_TICKET", "오늘 들 수 있는 문이 닫혔다", { dungeon: dun.name });
        ticketLeft = have - 1;
        await sb.from("player_ticket").upsert(
          { player_id: pid, dungeon_id: dun.id, tickets: ticketLeft },
          { onConflict: "player_id,dungeon_id" },
        );
      } else if (cost > 0) {
        if (p.hyang < cost) return err("NO_HYANG", `향이 모자라다 (${p.hyang}/${cost})`, { have: p.hyang, need: cost });
        p.hyang -= cost;
      }
      await sb.from("player").update({ hyang: p.hyang, hyang_updated_at: p.hyang_updated_at }).eq("id", pid);

      const { data: pcs } = await sb.from("player_card").select("*")
        .eq("player_id", pid).in("id", pt.card_ids).is("sacrificed_at", null);
      if (!pcs || pcs.length !== pt.card_ids.length)
        return err("PARTY_BROKEN", "당에 세운 카드 중 사라진 것이 있다");

      // 저장한 순서를 지킨다. 리더가 맨 앞이어야 리더 보너스가 맞다.
      const ordered = pt.card_ids.map((id: any) => pcs.find((x: any) => String(x.id) === String(id))).filter(Boolean);
      const lead = ordered.splice(Number(pt.leader_idx ?? 0), 1)[0];
      const snap = [lead, ...ordered];

      const seed = Math.floor(Math.random() * 9007199254740991);
      const { data: s, error } = await sb.from("explore_session").insert({
        player_id: pid, dungeon_id: dun.id, seed,
        step: 0, progress: 0, bujeong: 0,
        party_snapshot: { cards: snap, leader_card_id: lead?.card_id ?? null },
        hp_state: snap.map((pc: any) => ({ uid: String(pc.id), hp: null, maxhp: null, alive: true })),
        loot: [], status: "active",
      }).select().single();
      if (error) return err("DB", "탐험을 시작하지 못했다", { detail: error.message }, 500);

      return ok({
        session: s, dungeon: dun, steps: dun.combat ? RULE2.EXPLORE_STEPS : RULE2.SSITGIM.STEPS,
        hyang: p.hyang, tickets_left: ticketLeft, seed,
      });
    }

    // ── 한 걸음 — 전투 ─────────────────────────────────────
    if (path === "/explore/step" && req.method === "POST") {
      const { data: t } = await sb.from("explore_session").select("*")
        .eq("player_id", pid).eq("status", "active").limit(1).maybeSingle();
      if (!t) return err("NO_SESSION", "진행 중인 탐험이 없다");

      const n = m.dungeons.find((w: any) => w.id === t.dungeon_id);
      if (!n) return err("NO_DUNGEON", "그런 던전이 없다");
      if (!n.combat) return err("NOT_COMBAT", "이곳은 싸우는 곳이 아니다. 씻김을 올려야 한다", { dungeon: n.name });

      const step = t.step + 1;
      const seed = Number(t.seed) + step * 1013904223;
      const rng = new RNG(BigInt(Math.abs(seed) % 9007199254740991));

      const snap = t.party_snapshot?.cards ?? [];
      const us = snap.map((pc: any) => toUnit(m, pc, "us"));

      // 지난 걸음의 상태를 이어받되, 걸음 사이에 숨을 고른다.
      //  기록(hp_state)은 전투 직후 그대로 남긴다 — 로그를 정직하게 두기 위해서다.
      //  회복은 다음 걸음에 "들어설 때" 규칙으로 적용한다.
      const RC = RULE2.STEP_RECOVER;
      const prev = new Map((t.hp_state ?? []).map((h: any) => [String(h.uid), h]));
      for (const u of us) {
        const h: any = prev.get(u.uid);
        if (!h || h.hp == null) continue;                 // 첫 걸음은 만전으로 시작한다
        if (h.alive) {
          u.hp = Math.min(u.maxhp, Number(h.hp) + u.maxhp * RC.HP);
          u.alive = u.hp > 0;
        } else if (RC.REVIVE > 0) {
          u.hp = u.maxhp * RC.REVIVE;                     // 쓰러진 넋을 다시 일으킨다
          u.alive = true;
        } else {
          u.hp = 0; u.alive = false;
        }
      }
      if (!us.some((u: Unit) => u.alive)) return err("ALL_DOWN", "일어설 수 있는 넋이 없다");

      const them = makeFoes(m, n, step, rng);
      const leadCard = t.party_snapshot?.leader_card_id ? card(m, t.party_snapshot.leader_card_id) : null;
      const tk = tickScaleFor(m, n, step);

      const R = battle(us, them, BigInt(Math.abs(seed) % 9007199254740991), leadCard?.leader_effect, tk);

      const won = R.result === "win";
      const buj = Math.min(RULE2.BUJEONG_MAX,
        t.bujeong + RULE2.BUJEONG_PER_STEP + (won ? 0 : RULE2.BUJEONG_ON_LOSE));

      const loot = [...(t.loot ?? [])];
      const drops: { mats: Record<string, number>; cards: any[] } = { mats: {}, cards: [] };
      const sinpyoNote: string[] = [];
      if (won) {
        const d = rollDrops(rng, n);
        loot.push({ step, ...d });
        Object.assign(drops.mats, d.mats);
        drops.cards.push(...d.cards);
        // 마지막 걸음(보스)을 이기면 신표가 나온다
        if (step >= RULE2.EXPLORE_STEPS) {
          const bossName = them[0]?.name ?? "";
          const sp = sinpyoFor(bossName, m, rng);
          loot.push({ step, mats: { [sp.material]: 1 }, cards: [] });
          drops.mats[sp.material] = (drops.mats[sp.material] ?? 0) + 1;
          if (sp.note) sinpyoNote.push(sp.note);
        }
      }

      const cleared = won && step >= RULE2.EXPLORE_STEPS;
      const forced = buj >= RULE2.BUJEONG_MAX || !us.some(u => u.alive);
      const done = cleared || forced;

      await sb.from("explore_session").update({
        updated_at: new Date().toISOString(),
        step, progress: Math.round(step / RULE2.EXPLORE_STEPS * 100),
        bujeong: buj, loot, hp_state: R.hp_state,
        status: done ? (cleared ? "cleared" : "abandoned") : "active",
      }).eq("id", t.id);

      await sb.from("battle_log").insert({
        player_id: pid, session_id: t.id, seed, is_pvp: false,
        party: us.map(u => ({ uid: u.uid, card_id: u.card_id, name: u.name, tier: u.tier })),
        enemies: them.map(w => ({ card_id: w.card_id, name: w.name, faction: w.faction, tier: w.tier })),
        result: R.result, turns: R.turns, log: R.log,
      });

      let R2: any = null;
      if (done) {
        R2 = await settle(pid, t.id, loot, cleared, n);
        if (R2) R2.party_exp = await partyExp(pid, t.id, cleared, n);
      }

      /* ★ 키 이름은 전부 클라이언트 계약이다. 바꾸면 화면이 조용히 빈다.
         hp_state · sinpyo_note · drops · reward · reason 을 그대로 지킨다. */
      const reason = !done ? null
        : cleared ? null
        : (!us.some(u => u.alive) ? "넋이 다 쓰러졌다. 길에서 물러난다."
                                  : "부정이 가득 찼다. 더는 못 걷는다.");

      return ok({
        step, of: RULE2.EXPLORE_STEPS,
        boss: step >= RULE2.EXPLORE_STEPS,
        result: R.result, turns: R.turns, log: R.log,
        hp_state: R.hp_state, bujeong: buj,
        enemies: them.map(w => ({ name: w.name, faction: w.faction, tier: w.tier })),
        drops, sinpyo_note: sinpyoNote,
        cleared, forced, reason,
        status: done ? (cleared ? "cleared" : "failed") : "active",
        reward: R2, tick_scale: tk, seed,
      });
    }

    // ── 물러난다 — 지금까지 주운 것은 챙긴다 ────────────────
    if (path === "/explore/leave" && req.method === "POST") {
      const { data: t } = await sb.from("explore_session").select("*")
        .eq("player_id", pid).eq("status", "active").limit(1).maybeSingle();
      if (!t) return err("NO_SESSION", "진행 중인 탐험이 없다");
      const n = m.dungeons.find((w: any) => w.id === t.dungeon_id);

      const a = await settle(pid, t.id, t.loot, false, n);
      if (a) a.party_exp = await partyExp(pid, t.id, false, n);
      return ok({ left: true, reward: a, note: "길에서 물러났다. 주운 것은 챙겼다" });
    }

    // ── 육성 · 가챠 · 씻김 ─────────────────────────────────
    if (path === "/gacha" && req.method === "POST")            return await gacha(sb, m, pid, body, ok, err);
    if (path === "/grow/evolve" && req.method === "POST")       return await evolve(sb, m, pid, body, ok, err);
    if (path === "/grow/awaken" && req.method === "POST")       return await awaken(sb, m, pid, body, ok, err);
    if (path === "/grow/unique" && req.method === "POST")       return await unlockUnique(sb, m, pid, body, ok, err);
    if (path === "/grow/jeong" && req.method === "POST")        return await growJeong(sb, m, pid, body, ok, err);
    if (path === "/grow/slot" && req.method === "POST")         return await growSlot(sb, m, pid, body, ok, err);
    if (path === "/grow/node" && req.method === "POST")         return await unlockMasteryNode(sb, m, pid, body, ok, err);
    if (path === "/grow/node_reset" && req.method === "POST")   return await resetMasteryNodes(sb, m, pid, body, ok, err);
    if (path === "/ssitgim" && req.method === "POST")           return await ssitgim(sb, m, pid, body, ok, err);

    // ── 일일 입장권 ────────────────────────────────────────
    if (path === "/cron/tickets" && req.method === "POST") {
      const key = req.headers.get("x-cron-key") ?? "";
      if (!key || key !== Deno.env.get("CRON_KEY")) return err("FORBIDDEN", "권한이 없다", {}, 403);

      let n = 0;
      const { data: players } = await sb.from("player").select("id");
      for (const dun of m.dungeons.filter((d: any) => d.kind === "special")) {
        const give = Number(dun.daily_entries ?? 1);
        const cap = Number(dun.ticket_stack_max ?? give);
        for (const p of players ?? []) {
          const { data: tk } = await sb.from("player_ticket").select("tickets")
            .eq("player_id", p.id).eq("dungeon_id", dun.id).maybeSingle();
          const next = Math.min(cap, Number(tk?.tickets ?? 0) + give);
          await sb.from("player_ticket").upsert(
            { player_id: p.id, dungeon_id: dun.id, tickets: next, last_grant_at: new Date().toISOString() },
            { onConflict: "player_id,dungeon_id" },
          );
          n++;
        }
      }
      return ok({ granted: n });
    }

    return err("NO_ROUTE", `그런 길은 없다: ${path}`, {}, 404);
  } catch (e) {
    return err("SERVER", "서버가 넘어졌다", { detail: String((e as any)?.message ?? e) }, 500);
  }
});
