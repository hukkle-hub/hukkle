// ═══════════════════════════════════════════════════════════
// 흥양기 — 신표(信標) 매핑
// ═══════════════════════════════════════════════════════════

//  ★ 보스 이름 = 카드명 으로 매칭하면 S3가 깨진다.
//    보스 "여덟 신령" ≠ 카드명 "팔령(八靈)". 같은 존재인데 이름이 다르다.
//    이름 매칭에 기대면 조용히 틀린 신표가 들어간다. 그래서 명시적으로 못 박는다.
export const BOSS_SINPYO: Record<string, string | null> = {
  // S1 나락 시왕 10전 — 시왕 10명 중 카드가 있는 건 6명뿐이다
  "진광대왕":     "C113",
  "초강대왕":     "C114",
  "송제대왕":     "C115",
  "염라대왕":     "C117",
  "태산대왕":     "C118",
  "오도전륜대왕": "C119",
  "오관대왕":     null,   // 카드 없음 → 신표 대신 영험한혼
  "변성대왕":     null,
  "평등대왕":     null,
  "도시대왕":     null,

  // S3 — 이름이 다르다. 하드 매핑이 필요한 유일한 이유.
  "여덟 신령":    "C039",  // 팔령(八靈)

  // S4
  "개양할미":     "C076",

  // S2 / S5 — 보스가 카드가 아니다. 대신(大神) 중 무작위로 준다.
  "문을 여는 자":   "*대신",
  "통천문을 연 것": "*대신",
};

// 매핑에 없는 보스가 나오면 조용히 넘어가지 않는다. 영험한혼으로 대체하고 로그를 남긴다.
export function sinpyoFor(boss: string, m: any, rng: any): { material: string; note?: string } {
  const hit = BOSS_SINPYO[boss];

  if (hit === undefined) {
    // 매핑 누락. 던전 데이터가 바뀌었는데 여기를 안 고친 것이다.
    return { material: "영험한혼", note: `보스 "${boss}"의 신표 매핑이 없다. BOSS_SINPYO를 고쳐야 한다.` };
  }
  if (hit === null) {
    return { material: "영험한혼", note: `${boss}은 카드가 없다. 신표 대신 혼을 준다.` };
  }
  if (hit === "*대신") {
    const daesin = m.cards.filter((c: any) => c.godhood === "대신");
    const c = rng.pick(daesin);
    return { material: c.sinpyo_id, note: `${c.name}의 신표` };
  }
  const c = m.cards.find((x: any) => x.id === hit);
  if (!c) return { material: "영험한혼", note: `카드 ${hit}을 못 찾았다` };
  return { material: c.sinpyo_id, note: `${c.name}의 신표` };
}
