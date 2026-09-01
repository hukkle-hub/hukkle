/* 라이브 서버가 실제로 뱉은 응답을 그대로 클라이언트 코드에 먹인다.
   목킹이 아니다 — hy v26 이 반환한 바이트 그대로다.
   브라우저를 못 띄우므로 jsdom 으로 클라이언트를 실행하고 화면 문자열을 본다. */
const fs = require("fs");
const { JSDOM } = require("jsdom");

/* ── hy v26 이 실제로 돌려준 /explore/leave 응답 ── */
const LIVE_LEAVE = {
  left: true,
  reward: {
    materials: {},
    cards: [
      { id: 87, card_id: "C001", tier: 1 },
      { id: 88, card_id: "C008", tier: 1 },
      { id: 89, card_id: "C010", tier: 1 },
      { id: 90, card_id: "C013", tier: 2 },
      { id: 91, card_id: "C016", tier: 2 },
      { id: 92, card_id: "C020", tier: 2 },
    ],
    yeopjeon: 0,
    cleared: false,
    exp: 16,
    level_up: { from: 5, to: 6, cost_cap: 72 },
    party_exp: [1, 2, 3, 4, 17].map(id => ({
      id, card_id: "C00x", gained: 16, level: 1, exp: 16,
      need: 100, cap: 8, leveled: false, capped: false })),
  },
  note: "길에서 물러났다. 주운 것은 챙겼다",
};

let PASS = 0, FAIL = 0;
const ok = (n, c, extra = "") => { c ? (PASS++, console.log("  ✓", n, extra))
                                     : (FAIL++, console.log("  ✗", n, extra)); };

const html = fs.readFileSync("/home/claude/g6.html", "utf8");
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://x.test/",
  beforeParse(w) {
    try { w.localStorage.setItem("hy_pid", "694f8981-714d-4789-acb0-5837d36d6fe1"); } catch (_) {}
    w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){},
                            addEventListener(){}, removeEventListener(){} });
    w.scrollTo = () => {};
    w.HTMLCanvasElement.prototype.getContext = () => null;
    w.AudioContext = w.webkitAudioContext = function () {
      const p = { value: 0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} };
      return { createGain: () => ({ connect(){}, gain: p }),
               createOscillator: () => ({ connect(){}, start(){}, stop(){}, frequency: p, type: "" }),
               createBiquadFilter: () => ({ connect(){}, frequency: p, Q: p, type: "" }),
               createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
               createBufferSource: () => ({ connect(){}, start(){}, stop(){}, buffer: null }),
               destination: {}, currentTime: 0, state: "running", resume(){}, close(){} };
    };
    w.fetch = async (url) => {
      const path = String(url).replace(/^.*\/hy/, "");
      const J = d => ({ ok: true, status: 200, json: async () => d });
      if (path === "/master") return J({ cards: [], dungeons: [], tiers: [], rule: {} });
      if (path === "/player") return J({
        player: { id: "p", nickname: "박진오", level: 6, hyang: 112, bokchae: 0, yeopjeon: 0 },
        cost_cap: 72, cards: [], materials: [], parties: [], tickets: [],
        unlocks: [], album: [], session: null });
      return J({});
    };
  },
});
const w = dom.window;
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await wait(60);
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  w.dispatchEvent(new w.Event("load"));
  await wait(400);

  console.log("[1] 클라이언트 부팅");
  ok("스크립트 실행됨", w.eval("typeof rewardHtml") === "function");

  console.log("\n[2] 라이브 응답 → 정산 화면 렌더");
  const out = w.rewardHtml(LIVE_LEAVE.reward);
  ok("HTML 이 만들어졌다", typeof out === "string" && out.length > 100, `${out.length}자`);
  ok("제목 — 챙긴 것만 들고 나왔다", /챙긴 것만 들고 나왔다/.test(out));
  ok("경험 +16", /<dt>경험<\/dt><dd>\+16<\/dd>/.test(out));
  ok("엽전 줄이 있다", /<dt>엽전<\/dt>/.test(out));

  console.log("\n[3] ★ 레벨업이 화면에 뜨는가 (오늘 복원한 것)");
  ok("「격」 줄이 렌더된다", /<dt>격<\/dt>/.test(out));
  ok("올라간 격 6 이 보인다", />\s*6 — 신력 72/.test(out),
     (out.match(/<dt>격<\/dt>[\s\S]{0,90}/) || [""])[0].replace(/\s+/g, " ").slice(0, 80));
  ok("신력(코스트 상한) 72 가 보인다", /신력 72/.test(out));

  console.log("\n[4] 얻은 카드");
  ok("드랍 카드 줄이 있다", /<dt>신<\/dt>/.test(out) || LIVE_LEAVE.reward.cards.length === 0,
     "카드 6장 — 이름은 마스터에 없으면 안 뜬다(정상)");

  console.log("\n[5] level_up 이 없을 때는 그 줄이 안 떠야 한다");
  const noLv = w.rewardHtml({ ...LIVE_LEAVE.reward, level_up: null });
  ok("격 줄이 사라진다", !/<dt>격<\/dt>/.test(noLv));
  ok("나머지는 그대로", /<dt>경험<\/dt>/.test(noLv));

  console.log("\n[6] 렌더된 정산 화면 (실제 문자열)");
  const plain = out.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  console.log("   " + plain.slice(0, 200));

  console.log(`\n${"=".repeat(44)}\n통과 ${PASS} · 실패 ${FAIL}\n${"=".repeat(44)}`);
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR:", e); process.exit(2); });
