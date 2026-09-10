/* dungeon-flow.html 개조 검증.
   작업헌장 #34: "node --check(문법)만 하고 올림 → 실행이 안된다 반복.
   반드시 스텁 런타임 실행까지." 그래서 jsdom 으로 실제 실행한다. */
const fs = require("fs");
const { JSDOM } = require("jsdom");

let P = 0, F = 0;
const ok = (n, c, x = "") => { c ? (P++, console.log("  ✓", n, x)) : (F++, console.log("  ✗", n, x)); };

const html = fs.readFileSync("/home/claude/df.html", "utf8");
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true,
  url: "https://x.test/admin/dungeon-flow.html?embedded=1&region=nokdong",
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){},
                            addEventListener(){}, removeEventListener(){} });
    w.scrollTo = () => {};
    w.HTMLMediaElement.prototype.play = () => Promise.resolve();
    w.HTMLMediaElement.prototype.pause = () => {};
    w.HTMLElement.prototype.animate = () => ({ finished: Promise.resolve(), cancel(){} });
  },
});
const w = dom.window;

setTimeout(() => {
  const errs = [];
  w.addEventListener("error", e => errs.push(String(e.message)));

  console.log("[1] 부팅");
  ok("스크립트 실행됨", typeof w.hyPlaySummon === "function");
  ok("런타임 에러 없음", errs.length === 0, errs.join(" | "));

  console.log("\n[2] 스킬 판정이 데이터를 읽는가");
  const E = s => w.eval(s);
  const H = w.hySkill || {};
  ok("effect→연출 표가 있다", typeof H.EFFECT === "object");
  ok("등급 표가 있다", typeof H.TIER === "object");
  ok("루트 추출 함수", typeof H.route === "function");
  ok("현재 스킬 선택 함수", typeof H.active === "function");

  /* 실제 매니페스트 형태의 카드로 판정을 시험한다 */
  const mk = (role, star, effect, grade, route) => ({
    role, stage: star, name: "시험", skills: [
      { star: 1, unlock_star: 1, effect, grade, motion_key: `MS_C001_${route}_1` },
      { star: star, unlock_star: star, effect, grade, motion_key: `MS_C001_${route}_${star}` },
    ],
  });
  const kind = c => H.kind(c, 0);
  ok("수호 effect → guard", kind(mk("밸런스", 3, "role_guard", "영웅", "수호")) === "guard",
     kind(mk("밸런스", 3, "role_guard", "영웅", "수호")));
  ok("파훼 effect → break", kind(mk("밸런스", 3, "role_break", "영웅", "심판")) === "break");
  ok("심판 effect → break", kind(mk("탱커", 3, "judge", "전설", "심판")) === "break",
     "역할이 탱커여도 스킬이 심판이면 break");
  ok("연쇄 effect → strike", kind(mk("탱커", 3, "role_chain", "일반", "기록")) === "strike",
     "역할 문자열에 안 끌려간다");

  console.log("\n[3] 등급이 연출 길이를 정하는가");
  const tier = c => H.tier(c);
  const t1 = tier(mk("밸런스", 1, "record", "일반", "기록"));
  const t5 = tier(mk("밸런스", 5, "extreme", "전설", "의례"));
  ok("일반은 짧다", t1.ms === 380, t1.ms + "ms");
  ok("전설은 길다", t5.ms === 1400, t5.ms + "ms");
  ok("일반은 배너 없음", t1.banner === false);
  ok("전설은 히트스톱 있음", t5.stop > 0, t5.stop + "ms");

  console.log("\n[4] 루트 추출");
  const route = c => H.route(H.active(c), c);
  ok("수호 루트", route(mk("밸런스", 3, "role_guard", "영웅", "수호")) === "수호");
  ok("해령 루트", route(mk("밸런스", 6, "water", "전설", "해령")) === "해령");
  ok("루트 CSS 6종", ["수호","기록","의례","해령","심판","넋"]
     .every(r => html.includes(`[data-route="${r}"]`)));

  console.log("\n[5] 현현 소환 연출");
  ok("소환 함수 노출", typeof w.hyPlaySummon === "function");
  ok("FX는 외부 에셋", /SUMMON_FX=\{brk:'\.\.\/assets\/fx\//.test(html));
  ok("base64 내장 아님", !/SUMMON_FX=\{brk:'data:/.test(html));
  const p = w.hyPlaySummon({ name: "오관대왕", img: "a.webp", finalImg: "b.webp" }, 300);
  const st = w.document.getElementById("summonStage");
  ok("무대가 생성됨", !!st);
  ok("무대가 켜짐", st && st.classList.contains("on"));
  const sh = st ? st.innerHTML : "";
  ok("기본 카드 그림", /class="base"[\s\S]{0,60}a\.webp/.test(sh));
  ok("최종진화 그림", /class="fin"[\s\S]{0,60}b\.webp/.test(sh));
  ok("프레임 파쇄 아틀라스", /class="brk"[^>]*framebreak\.webp/.test(sh));
  ok("신광 폭발 아틀라스", /class="bst"[^>]*burst\.webp/.test(sh));
  ok("상승 알갱이 아틀라스", /class="ris"[^>]*rise\.webp/.test(sh));
  ok("이름이 뜬다", /오관대왕/.test(sh));

  console.log("\n[6] 기존 것을 안 깨뜨렸나");
  ["playSkillFx","showSkillBanner","playSeventhSkillMotion","renderBattleDeck",
   "useBattleSkill","startBossBattle","finishBattle","manifestProfile"]
    .forEach(f => ok(`${f} 살아 있음`, new RegExp("function\\s+"+f+"\\s*\\(").test(html)));
  ok("히트스톱 CSS", html.includes("#game.hitstop *{animation-play-state:paused"));
  ok("등급이 흔들림 세기에 연결", html.includes("--shake-k"));

  p.then(() => {
    ok("연출이 끝나면 무대가 꺼진다", !st.classList.contains("on"));
    console.log("\n[7] 런타임 에러");
    ok("에러 없음", errs.length === 0, errs.join(" | "));
    console.log(`\n${"=".repeat(44)}\n통과 ${P} · 실패 ${F}\n${"=".repeat(44)}`);
    process.exit(F ? 1 : 0);
  });
}, 900);
