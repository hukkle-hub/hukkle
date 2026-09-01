/* 흥양기 클라이언트 검증 — jsdom.
   브라우저 다운로드가 막혀 있어 Playwright 대신 jsdom으로 붙인다.
   목표: 부팅 · 정성 게이지 · /grow/jeong 왕복 · 성급별 그림 · 진화 연출. */
const fs = require("fs");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync("g6.html", "utf8");
let PASS = 0, FAIL = 0;
const ok  = (n, c, extra="") => { c ? (PASS++, console.log("  ✓", n, extra))
                                    : (FAIL++, console.log("  ✗", n, extra)); };

/* ── 서버 응답 흉내 (라이브 hy v23 규격 그대로) ── */
const CALLS = [];
const MASTER = {
  cards: [{ id:"C121", name:"오관대왕", faction:"저승", godhood:"상위신", rarity:"레어",
            role:"밸런스", skill:"염병", skill_type:"single", skill_rate:12, skill_coef:1.3,
            sinpyo_id:"SP_121", unique_skill:"업경대", unique_effect:{text:"죄를 비춘다"},
            leader_effect:{text:"저승 공격 +8%"} }],
  dungeons: [], tiers: [1,2,3,4,5].map(t=>({tier:t, cost:12*t, ap:100*t, dp:80*t, hp:600*t, spd_base:100})),
  rule: {}
};
let PLAYER = {
  player: { id:"p1", nickname:"박진오", level:5, hyang:120, bokchae:3000, yeopjeon:10000 },
  cost_cap: 70,
  cards: [{ id:1, card_id:"C121", tier:2, level:1, exp:0, awaken:0,
            evo_jeongseong:0, awaken_jeongseong:0, unique_jeongseong:0,
            unique_unlocked:false, growth_meta:null },
          { id:2, card_id:"C121", tier:2, level:1, exp:0, awaken:0, growth_meta:null },
          { id:3, card_id:"C121", tier:2, level:1, exp:0, awaken:0, growth_meta:null }],
  materials: [{ material_id:"하급신물", qty:9 }, { material_id:"영험한혼", qty:0 }],
  parties: [], tickets: [], unlocks: [], album: [], session: null
};

const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://x.test/",
  beforeParse(w){
    try{ w.localStorage.setItem("hy_pid","p1"); }catch(_){}
    w.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){},
                            addEventListener(){}, removeEventListener(){} });
    w.scrollTo = () => {};
    w.HTMLCanvasElement.prototype.getContext = () => null;
    w.AudioContext = w.webkitAudioContext = function(){
      return { createGain:()=>({connect(){},gain:{value:0,setValueAtTime(){},
                 linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}}),
               createOscillator:()=>({connect(){},start(){},stop(){},frequency:{value:0,
                 setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},type:""}),
               createBiquadFilter:()=>({connect(){},frequency:{value:0,setValueAtTime(){}},Q:{value:0},type:""}),
               createBuffer:()=>({getChannelData:()=>new Float32Array(8)}),
               createBufferSource:()=>({connect(){},start(){},stop(){},buffer:null}),
               destination:{}, currentTime:0, state:"running", resume(){}, close(){} };
    };
    w.fetch = async (url, opt={}) => {
      const path = String(url).replace(/^.*\/hy/, "");
      CALLS.push({ path, body: opt.body ? JSON.parse(opt.body) : null });
      const J = d => ({ ok:true, status:200, json: async()=>d, text: async()=>JSON.stringify(d) });
      if (path === "/master") return J(MASTER);
      if (path === "/player") return J(PLAYER);
      if (path === "/grow/jeong") {
        const b = JSON.parse(opt.body);
        const card = PLAYER.cards.find(c=>c.id===b.card_id);
        const need = 6;                                   // 2→3성: base65 per5 cap95 → 6
        const take = Math.min(b.qty, need - card.evo_jeongseong,
                              PLAYER.materials[0].qty,
                              Math.floor(PLAYER.player.yeopjeon/1500));
        card.evo_jeongseong += take;
        PLAYER.materials[0].qty -= take;
        PLAYER.player.yeopjeon -= take*1500;
        return J({ success:true, kind:b.kind, card_id:b.card_id,
                   jeongseong:card.evo_jeongseong, added:take, need,
                   full:card.evo_jeongseong>=need, rate:Math.min(95,65+5*card.evo_jeongseong),
                   cap:95, remaining_sinmul:PLAYER.materials[0].qty,
                   remaining_yeop:PLAYER.player.yeopjeon });
      }
      if (path === "/grow/evolve") {
        const b = JSON.parse(opt.body);
        const card = PLAYER.cards.find(c=>c.id===b.player_card_id);
        card.tier += 1; card.evo_jeongseong = 0;
        PLAYER.cards = PLAYER.cards.filter(c=>!b.feed_ids.includes(c.id));
        return J({ success:true, card:"오관대왕", from:2, to:3, rate_used:95,
                   jeongseong:0, feed_consumed:true, seed:1 });
      }
      return J({});
    };
  }
});
const w = dom.window;

const wait = ms => new Promise(r=>setTimeout(r, ms));
/* 최상위 const 는 window 에 안 붙는다. 전역 스코프에서 꺼내 쓴다. */
const E = expr => w.eval(expr);

(async () => {
  await wait(60);
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", {bubbles:true}));
  w.dispatchEvent(new w.Event("load"));
  await wait(400);

  const errs = [];
  w.addEventListener("error", e => errs.push(String(e.message)));

  console.log("\n[1] 부팅");
  ok("스크립트 실행됨", E("typeof artOf") === "function");
  ok("에러 없음", errs.length === 0, errs.join(" | "));
  ok("/master 호출", CALLS.some(c=>c.path==="/master"));

  console.log("\n[2] 성급별 그림 (tierArt)");
  const C = MASTER.cards[0];
  ok("1성 → t1", E("artOf")(C,1) === "redraw/C121_t1.webp", E("artOf")(C,1));
  ok("4성 → t4", E("artOf")(C,4) === "redraw/C121_t4.webp", E("artOf")(C,4));
  ok("성급 없으면 대표 그림", E("artOf")(C) === "redraw/C121.webp", String(E("artOf")(C)));
  ok("빠진 단계는 아래로 내려감", E("tierArt")("C121", 5) === "redraw/C121_t5.webp");
  ok("모르는 카드는 null", E("tierArt")("C999", 3) === null);

  console.log("\n[3] 정성 게이지");
  await w.refresh();                      // /player 를 실제로 받아 ME 를 채운다
  await wait(80);
  ok("ME 채워짐", E("!!ME && ME.cards.length===3"), "cards="+E("ME?ME.cards.length:0"));
  w.growOpen("evolve", 1);
  let h = w.document.querySelector("#growIn").innerHTML;
  ok("게이지가 그려진다", /class="jeong/.test(h));
  const need0 = (h.match(/<i class="[^"]*"><\/i>/g)||[]).length;
  ok("칸 수 = 상한까지 필요한 횟수(6)", need0 === 6, "칸 "+need0);
  ok("0/6 으로 시작", /0 \/ 6/.test(h));
  ok("현재 확률 65% 표시", /성공 <b>65%<\/b>/.test(h), (h.match(/성공 <b>\d+%<\/b>/)||[])[0]);
  ok("신물 보유 9 표시", /하급신물 <b class="">9<\/b>/.test(h));
  ok("버튼 살아 있음", /onclick="jeongRun\(1\)"/.test(h) && /jeongRun\(6\)/.test(h));

  console.log("\n[4] 신물 투입 → /grow/jeong");
  await w.jeongRun(2);
  await wait(120);
  const call = CALLS.filter(c=>c.path==="/grow/jeong").pop();
  ok("서버 호출됨", !!call);
  ok("body 규격 맞음", call && call.body.card_id===1 && call.body.kind==="evolve" && call.body.qty===2,
     call && JSON.stringify(call.body));
  h = w.document.querySelector("#growIn").innerHTML;
  ok("게이지 2/6", /2 \/ 6/.test(h));
  ok("확률 75%로 오름", /성공 <b>75%<\/b>/.test(h), (h.match(/성공 <b>\d+%<\/b>/)||[])[0]);
  ok("켜진 칸 2개", (h.match(/<i class="on"><\/i>/g)||[]).length === 2);
  ok("신물 7로 줄어듦", /하급신물 <b class="">7<\/b>/.test(h));

  console.log("\n[5] 가득 채우기 → 상한");
  await w.jeongRun(4);
  await wait(120);
  h = w.document.querySelector("#growIn").innerHTML;
  ok("6/6", /6 \/ 6/.test(h));
  ok("상한 95%", /성공 <b>95%<\/b>/.test(h), (h.match(/성공 <b>\d+%<\/b>/)||[])[0]);
  const gEl = w.document.querySelector("#growIn .jeong");
  ok("full 표시", !!gEl && gEl.classList.contains("full"),
     gEl ? gEl.className : "없음");
  ok("투입 직후 불이 붙는다(lit)", !!gEl && gEl.classList.contains("lit"));
  ok("다 차면 투입 버튼이 사라진다", !/jeongRun\(/.test(h));
  ok("문구 바뀜", /정성이 다 닿았다/.test(h));

  console.log("\n[6] 진화 연출");
  const made = w.evoScene("C121", 2, 3);
  ok("연출이 뜬다", made === true);
  const ov = w.document.querySelector("#evoOv");
  ok("오버레이 on", ov && ov.classList.contains("on"));
  ok("이전 성급 그림", ov && /redraw\/C121_t2\.webp/.test(ov.innerHTML));
  ok("다음 성급 그림", ov && /redraw\/C121_t3\.webp/.test(ov.innerHTML));
  ok("별 3개", ov && /class="tr">★★★</.test(ov.innerHTML));
  ok("단계 그림 없는 카드는 연출 안 함", w.evoScene("C999", 1, 2) === false);
  ok("같은 그림이면 연출 안 함", w.evoScene("C121", 5, 5) === false);

  console.log("\n[7] 신격상세 — 승인본 언어가 실제로 렌더되나");
  w.NAV = ["C121"];
  w.detail("C121");
  const cd = w.document.querySelector("#ovIn").innerHTML;
  ok("무령 원륜", /class="muryeong"/.test(cd));
  ok("방울 코어", /class="bell"/.test(cd));
  ok("금 능화 네 모서리", (cd.match(/class="neunghwa/g)||[]).length === 4,
     (cd.match(/class="neunghwa/g)||[]).length + "개");
  ok("세로 격패", /class="stele"/.test(cd));
  ok("인주 인장", /class="seal"/.test(cd));
  ok("한자 부수 攻防命格", /攻/.test(cd) && /防/.test(cd) && /命/.test(cd) && /格/.test(cd));
  ok("밑줄 농담(--w)", /--w:\d+%/.test(cd));
  ok("격 게이지", /class="kgauge"/.test(cd));
  ok("옛 후광(.hl) 사라짐", !/class="hl"/.test(cd));
  ok("이름이 격패에", /오관대왕/.test(cd));
  const S = w.eval("statOf")(MASTER.cards[0], PLAYER.cards[0]);
  ok("능력치를 서버 공식으로 계산", !!S && S.ap > 0 && S.dp > 0,
     S ? `공격 ${S.ap} 방어 ${S.dp} 치명 ${S.crit}%` : "null");

  console.log("\n[8] 진화 실행 (제물 2장 → 3성)");
  w.growOpen("evolve", 1);
  w.growPick(2); w.growPick(3);
  await w.growRun();
  await wait(200);
  const ev = CALLS.filter(c=>c.path==="/grow/evolve").pop();
  ok("서버 호출됨", !!ev);
  ok("제물 2장 전달", ev && ev.body.feed_ids.length === 2, ev && JSON.stringify(ev.body.feed_ids));
  ok("성급 올라감", PLAYER.cards.find(c=>c.id===1).tier === 3);
  const ov2 = w.document.querySelector("#evoOv");
  ok("진화 연출 재생됨", ov2 && ov2.classList.contains("on") &&
     /C121_t3\.webp/.test(ov2.innerHTML));
  ok("결과 화면 표시", /이루었다/.test(w.document.querySelector("#growIn").innerHTML));

  console.log("\n[9] 런타임 에러");
  ok("에러 없음", errs.length === 0, errs.join(" | "));

  console.log(`\n${"=".repeat(40)}\n통과 ${PASS} · 실패 ${FAIL}\n${"=".repeat(40)}`);
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR:", e); process.exit(2); });
