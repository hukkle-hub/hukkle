// ═══════════════════════════════════════════════════════════
// 흥양기 — 2판 라우트
//   가챠 / 진화 / 각성 / 유니크 해금 / 씻김(解冤) + 고풀이
//   접신 슬롯 / 무신도 노드 / 정화 / 정성 들이기
//
// 원칙
//  · 확률은 전부 서버가 굴린다. seed를 progression_log에 남긴다.
//  · 실패해도 정성(精誠)이 쌓여 다음 확률이 오른다. 무한 실패로 지갑이 녹지 않는다.
//  · 재료는 성공했을 때만 소모한다. 실패하면 정성만 오른다.
// ═══════════════════════════════════════════════════════════
import { RNG } from "./engine.ts";
import { gachaRoll, growRate, jeongNeeded, RULE2, verifyGopuli, rollDrops } from "./rules.ts";

type SB = any;

const seedNow = () => Math.floor(Math.random() * 9007199254740991);

async function getMat(sb: SB, pid: string, id: string): Promise<number> {
  const { data } = await sb.from("player_material").select("qty")
    .eq("player_id", pid).eq("material_id", id).maybeSingle();
  return data?.qty ?? 0;
}
async function addMat(sb: SB, pid: string, id: string, delta: number) {
  const cur = await getMat(sb, pid, id);
  await sb.from("player_material").upsert(
    { player_id: pid, material_id: id, qty: Math.max(0, cur + delta) },
    { onConflict: "player_id,material_id" },
  );
}

// growth_meta 를 항상 같은 모양으로 만들어 준다. null·배열·문자열이 들어와도 안 깨진다.
export function growthMeta(pc: any) {
  const g = pc && pc.growth_meta;
  const m: any = (g && typeof g === "object" && !Array.isArray(g)) ? { ...g } : {};
  if (!Array.isArray(m.slots)) m.slots = [];
  if (!Array.isArray(m.nodes)) m.nodes = [];
  if (typeof m.split_count !== "number") m.split_count = 0;
  return m;
}

// ── 가챠 ───────────────────────────────────────────────────
export async function gacha(sb: SB, m: any, pid: string, body: any, ok: any, err: any) {
  const n = Math.max(1, Math.min(10, Number(body.count ?? 1)));
  const G = RULE2.GACHA;

  const { data: p } = await sb.from("player").select("*").eq("id", pid).maybeSingle();
  if (!p) return err("NO_PLAYER", "그런 플레이어가 없다", {}, 404);

  const cost = G.COST_BOKCHAE * n;
  if (p.bokchae < cost)
    return err("NO_BOKCHAE", `복채가 모자라다 (${p.bokchae}/${cost})`, { have: p.bokchae, need: cost });

  // 풀: 히든과 비활성 카드는 절대 안 나온다. gacha_max_tier ≤ 4 라 5성도 안 나온다.
  const pool = m.cards
    .filter((c: any) => !c.hidden && c.is_active && c.gacha_max_tier > 0)
    .map((c: any) => ({ id: c.id, min: c.gacha_min_tier, max: c.gacha_max_tier }));

  let pity = p.gacha_pity;
  const seed = seedNow();
  const rng = new RNG(BigInt(seed));
  const got: any[] = [];

  for (let i = 0; i < n; i++) {
    const r = gachaRoll(rng, pity, pool);
    if (!r) return err("EMPTY_POOL", "뽑을 카드가 없다", {}, 500);

    const { data: pc } = await sb.from("player_card").insert({
      player_id: pid, card_id: r.card, tier: r.tier, obtained_from: "gacha",
    }).select().single();

    const c = m.cards.find((x: any) => x.id === r.card);
    got.push({ id: pc?.id, card_id: r.card, name: c?.name, faction: c?.faction, tier: r.tier });

    await sb.from("gacha_log").insert({
      player_id: pid, banner_id: "standard", seed, cost_type: "복채",
      cost_amount: G.COST_BOKCHAE, result_card: r.card, result_tier: r.tier,
      pity_before: pity, pity_after: r.pity_after,
    });

    // 도감
    const { data: al } = await sb.from("player_album").select("max_tier_seen")
      .eq("player_id", pid).eq("card_id", r.card).maybeSingle();
    if (!al) await sb.from("player_album").insert({ player_id: pid, card_id: r.card, max_tier_seen: r.tier });
    else if (al.max_tier_seen < r.tier)
      await sb.from("player_album").update({ max_tier_seen: r.tier })
        .eq("player_id", pid).eq("card_id", r.card);

    pity = r.pity_after;
  }

  await sb.from("player").update({ bokchae: p.bokchae - cost, gacha_pity: pity }).eq("id", pid);

  return ok({
    cards: got, spent: cost, bokchae: p.bokchae - cost,
    pity, pity_at: G.PITY,
    rates: G.RATE,                       // 확률형 아이템 정보 표시 의무 — 뽑을 때마다 같이 내려준다
    note: pity >= G.PITY_SOFT ? `${G.PITY_SOFT}회를 넘겨 4성 확률이 오르고 있다` : null,
  });
}

// ── 진화 (성급) ────────────────────────────────────────────
export async function evolve(sb: SB, m: any, pid: string, body: any, ok: any, err: any) {
  const { player_card_id, feed_ids } = body;
  const E = RULE2.EVOLVE;

  const { data: pc } = await sb.from("player_card").select("*")
    .eq("id", player_card_id).eq("player_id", pid).is("sacrificed_at", null).maybeSingle();
  if (!pc) return err("NOT_OWNED", "그런 카드가 없다");
  if (pc.tier >= 5) return err("MAX_TIER", "이미 5성이다");

  const to = pc.tier + 1;
  const needFeed = E.FEED[to as 2 | 3 | 4 | 5];
  const needYeop = E.YEOP[to as 2 | 3 | 4 | 5];

  if (!Array.isArray(feed_ids) || feed_ids.length !== needFeed)
    return err("BAD_FEED", `${pc.tier}성 카드 ${needFeed}장이 필요하다`, { need: needFeed, got: feed_ids?.length ?? 0 });
  if (feed_ids.includes(player_card_id))
    return err("SELF_FEED", "자기 자신을 재료로 쓸 수 없다");

  const { data: feeds } = await sb.from("player_card").select("*")
    .eq("player_id", pid).in("id", feed_ids).is("sacrificed_at", null);
  if (!feeds || feeds.length !== needFeed)
    return err("NOT_OWNED", "재료 카드를 찾을 수 없다");
  if (feeds.some((f: any) => f.tier !== pc.tier))
    return err("BAD_FEED_TIER", `재료는 전부 ${pc.tier}성이어야 한다`);
  if (feeds.some((f: any) => f.locked))
    return err("LOCKED", "잠긴 카드는 재료로 못 쓴다");

  const { data: p } = await sb.from("player").select("yeopjeon").eq("id", pid).maybeSingle();
  if (Number(p!.yeopjeon) < needYeop)
    return err("NO_YEOP", `엽전이 모자라다 (${p!.yeopjeon}/${needYeop})`, { have: Number(p!.yeopjeon), need: needYeop });

  const rate = growRate(E.RATE[to as 2|3|4|5], E.JEONG[to as 2|3|4|5], pc.evo_jeongseong, E.CAP);
  const seed = seedNow();
  const win = new RNG(BigInt(seed)).chance(rate);

  const from = { tier: pc.tier, jeong: pc.evo_jeongseong };
  let toState: any = null;

  if (win) {
    // 성공 — 재료를 먹고 성급이 오른다. 정성은 초기화.
    await sb.from("player_card").update({ sacrificed_at: new Date().toISOString() }).in("id", feed_ids);
    await sb.from("player_card").update({ tier: to, evo_jeongseong: 0 }).eq("id", player_card_id);
    await sb.from("player").update({ yeopjeon: Number(p!.yeopjeon) - needYeop }).eq("id", pid);
    toState = { tier: to, jeong: 0 };

    const { data: al } = await sb.from("player_album").select("max_tier_seen")
      .eq("player_id", pid).eq("card_id", pc.card_id).maybeSingle();
    if (al && al.max_tier_seen < to)
      await sb.from("player_album").update({ max_tier_seen: to })
        .eq("player_id", pid).eq("card_id", pc.card_id);
  } else {
    // 실패 — 재료는 그대로 둔다. 엽전만 나가고 정성이 쌓인다.
    await sb.from("player_card").update({ evo_jeongseong: pc.evo_jeongseong + 1 }).eq("id", player_card_id);
    await sb.from("player").update({ yeopjeon: Number(p!.yeopjeon) - needYeop }).eq("id", pid);
    toState = { tier: pc.tier, jeong: pc.evo_jeongseong + 1 };
  }

  await sb.from("progression_log").insert({
    player_id: pid, player_card_id, action: "evolve",
    from_state: from, to_state: toState, success: win, seed,
    rate_used: rate, jeongseong: pc.evo_jeongseong,
    consumed: { feed_ids, yeopjeon: needYeop, feed_consumed: win },
  });

  const next = growRate(E.RATE[to as 2|3|4|5], E.JEONG[to as 2|3|4|5], toState.jeong, E.CAP);
  const c = m.cards.find((x: any) => x.id === pc.card_id);

  return ok({
    success: win, card: c?.name, from: pc.tier, to: win ? to : pc.tier,
    rate_used: Math.round(rate * 1000) / 10,
    jeongseong: toState.jeong,
    next_rate: Math.round(next * 1000) / 10,
    yeopjeon_spent: needYeop,
    feed_consumed: win,
    note: win ? null : "재료는 그대로다. 정성이 쌓여 다음이 쉬워진다",
    seed,                                   // 분쟁 나면 이 시드로 재현한다
  });
}

// ── 각성 (같은 카드를 먹인다) ───────────────────────────────
export async function awaken(sb: SB, m: any, pid: string, body: any, ok: any, err: any) {
  const { player_card_id, feed_id } = body;
  const A = RULE2.AWAKEN;

  const { data: pc } = await sb.from("player_card").select("*")
    .eq("id", player_card_id).eq("player_id", pid).is("sacrificed_at", null).maybeSingle();
  if (!pc) return err("NOT_OWNED", "그런 카드가 없다");
  if (pc.awaken >= 5) return err("MAX_AWAKEN", "이미 각성 5단계다");

  const to = pc.awaken + 1;
  const needSinmul = A.SINMUL[to];

  const { data: feed } = await sb.from("player_card").select("*")
    .eq("id", feed_id).eq("player_id", pid).is("sacrificed_at", null).maybeSingle();
  if (!feed) return err("NOT_OWNED", "재료 카드가 없다");
  if (feed.card_id !== pc.card_id)
    return err("BAD_FEED", "각성은 같은 카드만 먹인다", { need: pc.card_id, got: feed.card_id });
  if (feed.id === pc.id) return err("SELF_FEED", "자기 자신을 먹일 수 없다");
  if (feed.locked) return err("LOCKED", "잠긴 카드는 재료로 못 쓴다");

  const have = await getMat(sb, pid, "상급신물");
  if (have < needSinmul)
    return err("NO_SINMUL", `상급신물이 모자라다 (${have}/${needSinmul})`, { have, need: needSinmul });

  const rate = growRate(A.RATE[to], A.JEONG, pc.awaken_jeongseong, A.CAP);
  const seed = seedNow();
  const win = new RNG(BigInt(seed)).chance(rate);

  if (win) {
    await sb.from("player_card").update({ sacrificed_at: new Date().toISOString() }).eq("id", feed_id);
    await sb.from("player_card").update({ awaken: to, awaken_jeongseong: 0 }).eq("id", player_card_id);
    await addMat(sb, pid, "상급신물", -needSinmul);
  } else {
    await sb.from("player_card").update({ awaken_jeongseong: pc.awaken_jeongseong + 1 }).eq("id", player_card_id);
    await addMat(sb, pid, "상급신물", -Math.ceil(needSinmul / 2));   // 실패는 절반만 먹는다
  }

  await sb.from("progression_log").insert({
    player_id: pid, player_card_id, action: "awaken",
    from_state: { awaken: pc.awaken, jeong: pc.awaken_jeongseong },
    to_state: { awaken: win ? to : pc.awaken, jeong: win ? 0 : pc.awaken_jeongseong + 1 },
    success: win, seed, rate_used: rate, jeongseong: pc.awaken_jeongseong,
    consumed: { feed_id, "상급신물": win ? needSinmul : Math.ceil(needSinmul / 2), feed_consumed: win },
  });

  const c = m.cards.find((x: any) => x.id === pc.card_id);
  return ok({
    success: win, card: c?.name,
    from: pc.awaken, to: win ? to : pc.awaken,
    rate_used: Math.round(rate * 1000) / 10,
    jeongseong: win ? 0 : pc.awaken_jeongseong + 1,
    stat_bonus: `+${(win ? to : pc.awaken) * 6}%`,
    note: win ? null : "재료는 그대로다. 신물만 절반 나갔다",
    seed,
  });
}

// ── 유니크 해금 (5성 + 카드 전용 신표) ──────────────────────
export async function unlockUnique(sb: SB, m: any, pid: string, body: any, ok: any, err: any) {
  const { player_card_id } = body;
  const U = RULE2.UNIQUE;

  const { data: pc } = await sb.from("player_card").select("*")
    .eq("id", player_card_id).eq("player_id", pid).is("sacrificed_at", null).maybeSingle();
  if (!pc) return err("NOT_OWNED", "그런 카드가 없다");
  if (pc.tier < 5) return err("NOT_5STAR", "유니크는 5성부터 열린다", { tier: pc.tier });
  if (pc.unique_unlocked) return err("ALREADY", "이미 열려 있다");

  const c = m.cards.find((x: any) => x.id === pc.card_id);
  const sp = c.sinpyo_id;                    // SP_117 같은 카드 전용 신표
  const have = await getMat(sb, pid, sp);
  if (have < U.SINPYO)
    return err("NO_SINPYO", `${c.name}의 신표가 모자라다 (${have}/${U.SINPYO})`,
      { material: sp, have, need: U.SINPYO, hint: "특별 던전에서 해당 보스를 잡으면 나온다" });

  const rate = growRate(U.RATE, U.JEONG, pc.unique_jeongseong, U.CAP);
  const seed = seedNow();
  const win = new RNG(BigInt(seed)).chance(rate);

  if (win) {
    await sb.from("player_card").update({ unique_unlocked: true, unique_jeongseong: 0 }).eq("id", player_card_id);
    await addMat(sb, pid, sp, -U.SINPYO);
  } else {
    await sb.from("player_card").update({ unique_jeongseong: pc.unique_jeongseong + 1 }).eq("id", player_card_id);
    await addMat(sb, pid, sp, -1);           // 실패는 1개만 먹는다
  }

  await sb.from("progression_log").insert({
    player_id: pid, player_card_id, action: "unlock_unique",
    from_state: { unlocked: false, jeong: pc.unique_jeongseong },
    to_state: { unlocked: win, jeong: win ? 0 : pc.unique_jeongseong + 1 },
    success: win, seed, rate_used: rate, jeongseong: pc.unique_jeongseong,
    consumed: { [sp]: win ? U.SINPYO : 1 },
  });

  return ok({
    success: win, card: c.name,
    unique: win ? { name: c.unique_skill, effect: c.unique_effect } : null,
    rate_used: Math.round(rate * 1000) / 10,
    jeongseong: win ? 0 : pc.unique_jeongseong + 1,
    sinpyo_left: have - (win ? U.SINPYO : 1),
    note: win ? `【${c.unique_skill}】이 열렸다` : "신표 하나만 나갔다. 정성이 쌓인다",
    seed,
  });
}

// ── 정성 들이기 — 재료를 올려 게이지를 채운다 ────────────────
//  진화·각성·유니크 세 갈래 모두 같은 방식이다.
//  확률 공식은 건드리지 않는다. 정성을 "실패 말고 다른 길로도" 쌓게 할 뿐이다.
const JEONG_KIND: Record<string, { base: (pc: any) => number; per: (pc: any) => number; cap: number; col: string; label: string }> = {
  evolve: {
    base: (pc) => (RULE2.EVOLVE.RATE as any)[Math.min(5, (Number(pc.tier) || 1) + 1)] ?? 0,
    per:  (pc) => (RULE2.EVOLVE.JEONG as any)[Math.min(5, (Number(pc.tier) || 1) + 1)] ?? 0,
    cap: RULE2.EVOLVE.CAP, col: "evo_jeongseong", label: "진화",
  },
  awaken: {
    base: (pc) => RULE2.AWAKEN.RATE[Math.min(5, (Number(pc.awaken) || 0) + 1)] ?? 0,
    per:  () => RULE2.AWAKEN.JEONG,
    cap: RULE2.AWAKEN.CAP, col: "awaken_jeongseong", label: "각성",
  },
  unique: {
    base: () => RULE2.UNIQUE.RATE,
    per:  () => RULE2.UNIQUE.JEONG,
    cap: RULE2.UNIQUE.CAP, col: "unique_jeongseong", label: "유니크",
  },
};

export async function growJeong(sb: SB, _m: any, pid: string, body: any, ok: any, err: any) {
  const J = RULE2.JEONG;
  const { card_id, kind, qty } = body || {};
  const rule = JEONG_KIND[String(kind || "evolve")];
  if (!card_id) return err("BAD_REQUEST", "카드가 있어야 한다");
  if (!rule) return err("BAD_KIND", "진화·각성·유니크 중 하나여야 한다", { known: Object.keys(JEONG_KIND) });

  const want = Math.max(1, Math.min(J.MAX_AT_ONCE, Number(qty) || 1));

  const { data: pc } = await sb.from("player_card").select("*")
    .eq("player_id", pid).eq("id", card_id).is("sacrificed_at", null).maybeSingle();
  if (!pc) return err("NO_CARD", "그런 카드가 없다");

  if (kind === "evolve" && (Number(pc.tier) || 1) >= 5) return err("MAX_TIER", "더 오를 성급이 없다");
  if (kind === "awaken" && (Number(pc.awaken) || 0) >= 5) return err("MAX_AWAKEN", "더 오를 각성이 없다");
  if (kind === "unique" && pc.unique_unlocked) return err("ALREADY_UNIQUE", "이미 열린 유니크다");

  const base = rule.base(pc), per = rule.per(pc), cap = rule.cap;
  const have = Number(pc[rule.col]) || 0;
  const need = jeongNeeded(base, per, cap);
  const room = Math.max(0, need - have);
  const pct = (x: number) => Math.round(growRate(base, per, x, cap) * 1000) / 10;

  if (room <= 0)
    return err("JEONG_FULL", "정성이 다 찼다. 이제 올리면 된다",
      { jeongseong: have, rate: pct(have), cap: cap * 100, need });

  const take = Math.min(want, room);
  const costYeop = take * J.YEOP_PER;

  const { data: p } = await sb.from("player").select("yeopjeon").eq("id", pid).maybeSingle();
  const yeop = Number((p && p.yeopjeon) || 0);
  const sin = await getMat(sb, pid, J.MAT);

  if (sin < take) return err("NO_SINMUL", `${J.MAT}이 모자라다 (${sin}/${take})`, { have: sin, need: take });
  if (yeop < costYeop) return err("NO_YEOPJEON", `엽전이 모자라다 (${yeop}/${costYeop})`, { have: yeop, need: costYeop });

  const next = have + take;
  const up = await sb.from("player_card").update({ [rule.col]: next })
    .eq("id", card_id).eq("player_id", pid);
  if (up.error) return err("DB_ERROR", "정성이 닿지 않았다", { detail: up.error.message }, 500);

  await sb.from("player").update({ yeopjeon: yeop - costYeop }).eq("id", pid);
  await addMat(sb, pid, J.MAT, -take);

  await sb.from("progression_log").insert({
    player_id: pid, player_card_id: card_id, action: `jeong_${kind}`,
    from_state: { jeongseong: have, rate: pct(have) },
    to_state:   { jeongseong: next, rate: pct(next) },
    success: true, rate_used: growRate(base, per, next, cap), jeongseong: next,
    consumed: { [J.MAT]: take, "엽전": costYeop },
  });

  return ok({
    success: true, kind, card_id,
    jeongseong: next, added: take, need, full: next >= need,
    rate: pct(next), cap: Math.round(cap * 1000) / 10,
    spent: { [J.MAT]: take, "엽전": costYeop },
    remaining_sinmul: sin - take, remaining_yeop: yeop - costYeop,
    note: next >= need
      ? `정성이 다 닿았다. 이제 ${rule.label}를 올려도 된다`
      : `정성 ${next} — 지금 ${pct(next)}%`,
  });
}

// ── 접신(接神) — 카드에 넋을 옮겨 붙인다 ────────────────────
//  제물 카드의 역할·세력이 작용의 종류를 정한다. 되돌릴 수 없다.
export async function growSlot(sb: SB, m: any, pid: string, body: any, ok: any, err: any) {
  const { main_card_id, feed_card_id } = body || {};
  if (!main_card_id || !feed_card_id) return err("BAD_REQUEST", "주력 카드와 제물 카드가 있어야 한다");
  if (String(main_card_id) === String(feed_card_id)) return err("SAME_CARD", "자기 자신을 제물로 쓸 수 없다");

  const { data: main } = await sb.from("player_card").select("*")
    .eq("player_id", pid).eq("id", main_card_id).is("sacrificed_at", null).maybeSingle();
  const { data: feed } = await sb.from("player_card").select("*")
    .eq("player_id", pid).eq("id", feed_card_id).is("sacrificed_at", null).maybeSingle();
  if (!main) return err("NO_MAIN_CARD", "그런 카드가 없다");
  if (!feed) return err("NO_FEED_CARD", "제물로 바칠 카드가 없다");
  if (feed.locked) return err("LOCKED", "잠긴 카드는 제물로 못 쓴다");

  const meta = growthMeta(main);
  if (meta.slots.length >= RULE2.SLOT_MAX)
    return err("SLOTS_FULL", "접신 자리는 둘뿐이다. 이미 찼다", { have: meta.slots.length, max: RULE2.SLOT_MAX });

  const fm = m.cards.find((c: any) => c.id === feed.card_id);
  const role = (fm && fm.role) || "밸런스";
  const fac = (fm && fm.faction) || "";

  let op = "flat_stat", stat = "dp", val = 8 * (Number(feed.tier) || 1), desc = "방어가 오른다";
  if (role === "탱커")      { op = "start_gauge_flat";   stat = "special"; val = 15; desc = "개막에 기세를 먼저 얻는다"; }
  else if (fac === "당")    { op = "skill_rate_add";     stat = "special"; val = 5;  desc = "술법이 더 자주 터진다"; }
  else if (fac === "물")    { op = "dot_mitigation_flat";stat = "special"; val = 10; desc = "불씨를 씻어 덜 아프다"; }
  else if (fac === "저승")  { op = "faction_pierce_flat";stat = "special"; val = 20; desc = "상성에 눌려도 뚫는다"; }

  meta.slots.push({
    slot_no: meta.slots.length + 1, op, stat, val,
    source: (fm && fm.name) || feed.card_id, description: desc,
  });

  const up1 = await sb.from("player_card").update({ growth_meta: meta })
    .eq("id", main_card_id).eq("player_id", pid);
  if (up1.error) return err("DB_ERROR", "접신에 실패했다", { detail: up1.error.message }, 500);

  const up2 = await sb.from("player_card").update({ sacrificed_at: new Date().toISOString() })
    .eq("id", feed_card_id).eq("player_id", pid);
  if (up2.error) return err("DB_ERROR", "제물이 명부에서 지워지지 않았다", { detail: up2.error.message }, 500);

  return ok({
    success: true, main_card_id,
    added_slot: { op, stat, val, source: (fm && fm.name) || null, description: desc },
    growth_meta: meta,
  });
}

// ── 무신도 노드 — 격을 열어 능력을 붙인다 ────────────────────
export async function unlockMasteryNode(sb: SB, _m: any, pid: string, body: any, ok: any, err: any) {
  const N = RULE2.NODE;
  const { card_id, node_id } = body || {};
  const cost = N.COST[node_id];
  if (!card_id || !cost) return err("BAD_NODE", "그런 노드가 없다", { known: Object.keys(N.COST) });

  const { data: pc } = await sb.from("player_card").select("*")
    .eq("player_id", pid).eq("id", card_id).is("sacrificed_at", null).maybeSingle();
  if (!pc) return err("NO_CARD", "그런 카드가 없다");

  const meta = growthMeta(pc);
  if (meta.nodes.includes(node_id)) return err("ALREADY_UNLOCKED", "이미 열린 노드다");

  // 앞 단계를 하나라도 열어야 다음 단계가 열린다
  let reach = 1;
  if (meta.nodes.some((k: string) => String(k).startsWith("AP_"))) reach = 2;
  if (meta.nodes.some((k: string) => String(k).startsWith("DP_"))) reach = 3;
  if (cost.level > reach)
    return err("LOCKED_SEQUENCE", "앞 단계를 먼저 하나 열어야 한다", { need_level: cost.level, reach });

  const needLv = N.LV_GATE[cost.level] || 1;
  const haveLv = Number(pc.level) || 1;
  if (haveLv < needLv) return err("LOW_CARD_LEVEL", `격이 모자라다 (${haveLv}/${needLv})`, { have: haveLv, need: needLv });

  const { data: p } = await sb.from("player").select("yeopjeon").eq("id", pid).maybeSingle();
  const yeop = Number((p && p.yeopjeon) || 0);
  const hon = await getMat(sb, pid, N.HON);
  if (yeop < cost.yeop) return err("NO_YEOPJEON", `엽전이 모자라다 (${yeop}/${cost.yeop})`, { have: yeop, need: cost.yeop });
  if (hon < cost.hon) return err("NO_HON", `${N.HON}이 모자라다 (${hon}/${cost.hon})`, { have: hon, need: cost.hon });

  meta.nodes.push(node_id);
  const up = await sb.from("player_card").update({ growth_meta: meta })
    .eq("id", card_id).eq("player_id", pid);
  if (up.error) return err("DB_ERROR", "노드를 열지 못했다", { detail: up.error.message }, 500);

  await sb.from("player").update({ yeopjeon: yeop - cost.yeop }).eq("id", pid);
  await addMat(sb, pid, N.HON, -cost.hon);

  return ok({
    success: true, unlocked_node: node_id, cost,
    remaining_yeop: yeop - cost.yeop, remaining_hon: hon - cost.hon,
    growth_meta: meta,
  });
}

// ── 정화(淨化) — 열어둔 노드를 전부 씻어낸다 ─────────────────
export async function resetMasteryNodes(sb: SB, _m: any, pid: string, body: any, ok: any, err: any) {
  const N = RULE2.NODE;
  const { card_id } = body || {};
  if (!card_id) return err("BAD_REQUEST", "카드가 있어야 한다");

  const { data: pc } = await sb.from("player_card").select("*")
    .eq("player_id", pid).eq("id", card_id).is("sacrificed_at", null).maybeSingle();
  if (!pc) return err("NO_CARD", "그런 카드가 없다");

  const meta = growthMeta(pc);
  if (meta.nodes.length === 0) return err("NO_NODES", "정화할 노드가 없다");

  const { data: p } = await sb.from("player").select("yeopjeon").eq("id", pid).maybeSingle();
  const yeop = Number((p && p.yeopjeon) || 0);
  if (yeop < N.RESET_FEE)
    return err("NO_RESET_FEE", `정화 복채가 모자라다 (${yeop}/${N.RESET_FEE})`, { have: yeop, need: N.RESET_FEE });

  let refund = 0;
  for (const n of meta.nodes) { const c = N.COST[n]; if (c) refund += c.hon; }

  const cleared = meta.nodes.slice();
  meta.nodes = [];
  const up = await sb.from("player_card").update({ growth_meta: meta })
    .eq("id", card_id).eq("player_id", pid);
  if (up.error) return err("DB_ERROR", "정화에 실패했다", { detail: up.error.message }, 500);

  await sb.from("player").update({ yeopjeon: yeop - N.RESET_FEE }).eq("id", pid);
  await addMat(sb, pid, N.HON, refund);
  const hon = await getMat(sb, pid, N.HON);

  return ok({
    success: true, cleared, restored_hon: refund,
    remaining_yeop: yeop - N.RESET_FEE, remaining_hon: hon,
    growth_meta: meta,
    note: `노드를 씻어냈다. 엽전 ${N.RESET_FEE}이 나가고 ${N.HON} ${refund}이 돌아왔다`,
  });
}

// ── 씻김(解冤) — D15 소록도. 싸우지 않는다. ──────────────────
//  초가망석 → 넋올림 → 고풀이 → 씻김 → 길닦음
//  고풀이는 클라이언트가 매듭 타이밍을 보내고 서버가 사람인지 판정한다.
export async function ssitgim(sb: SB, m: any, pid: string, body: any, ok: any, err: any) {
  const S = RULE2.SSITGIM;
  const { knots } = body;

  const { data: s } = await sb.from("explore_session").select("*")
    .eq("player_id", pid).eq("status", "active").limit(1).maybeSingle();
  if (!s) return err("NO_SESSION", "진행 중인 탐험이 없다");

  const dun = m.dungeons.find((d: any) => d.id === s.dungeon_id);
  if (!dun) return err("NO_DUNGEON", "그런 던전이 없다");
  if (dun.combat) return err("NOT_RITUAL", "이곳은 의례 던전이 아니다", { dungeon: dun.name });

  // 고풀이 — 서버가 판정한다. 클라이언트를 믿지 않는다.
  const g = verifyGopuli(knots);
  if (!g.ok) {
    await sb.rpc("bump_stat", { p_player: pid, p_key: "gopuli:reject", p_by: 1 });
    return err("GOPULI_FAIL", "고를 제대로 풀지 못했다", {
      why: g.why, knot_min_ms: S.KNOT_MIN_MS, knots_need: S.KNOTS,
    });
  }

  // 정성: 매듭이 고르게 느릴수록 높다 (서두르지 않은 것)
  const avg = knots.reduce((a: number, b: number) => a + b, 0) / knots.length;
  const jeong = Math.min(5, Math.floor((avg - S.KNOT_MIN_MS) / 120));

  const rate = Math.min(0.95, S.BASE + S.PER_JEONG * jeong);
  const seed = seedNow();
  const rng = new RNG(BigInt(seed));
  const win = rng.chance(rate);

  // 부정을 씻는다
  const buj = Math.max(0, s.bujeong - (win ? S.CLEANSE : Math.floor(S.CLEANSE / 3)));
  const step = s.step + 1;
  const done = step >= S.STEPS;

  const loot = [...(s.loot as any[])];
  let unlocked: any = null;

  if (win && done) {
    const d = rollDrops(rng, dun);
    loot.push({ step, ...d });
    await sb.rpc("bump_stat", { p_player: pid, p_key: "ssitgim:success", p_by: 1 });

    // 씻김 100회 → 신칼 잡은 당골(C112) 해금
    const { data: st } = await sb.from("player_stat").select("value")
      .eq("player_id", pid).eq("stat_key", "ssitgim:success").maybeSingle();
    if ((st?.value ?? 0) >= 100) {
      const { data: exist } = await sb.from("player_unlock").select("card_id")
        .eq("player_id", pid).eq("card_id", "C112").maybeSingle();
      if (!exist) {
        await sb.from("player_unlock").insert({ player_id: pid, card_id: "C112" });
        unlocked = { card_id: "C112", name: "신칼 잡은 당골", how: "씻김을 백 번 올렸다" };
      }
    }
  }

  await sb.from("explore_session").update({
    step, bujeong: buj, loot,
    updated_at: new Date().toISOString(),
    progress: Math.round(step / S.STEPS * 100),
    status: done ? "cleared" : "active",
  }).eq("id", s.id);

  const STEP_NAME = ["초가망석", "넋올림", "고풀이", "씻김", "길닦음"];

  return ok({
    step, of: S.STEPS, name: STEP_NAME[step - 1] ?? "길닦음",
    success: win,
    gopuli: { ok: true, avg_ms: Math.round(avg), jeongseong: jeong },
    rate_used: Math.round(rate * 1000) / 10,
    bujeong: buj,
    cleared: done,
    unlocked,
    text: win
      ? (done ? "넋이 길을 떠난다. 원(冤)이 풀렸다." : `${STEP_NAME[step - 1]}을 마쳤다.`)
      : "손이 떨렸다. 넋이 아직 머문다.",
    seed,
  });
}
