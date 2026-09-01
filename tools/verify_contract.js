/* 서버 응답과 클라이언트가 읽는 필드가 맞는지 검사한다.
   오늘 index.ts 뒷부분을 재구성하면서 키 이름이 다섯 군데 어긋나 있었다.
   그건 서버도 클라이언트도 각자 멀쩡한데 화면만 조용히 비는 종류의 결함이다.
   그래서 "클라이언트가 실제로 읽는 필드"를 소스에서 뽑아 서버 응답과 대조한다. */
const fs = require("fs");

const html = fs.readFileSync("/home/claude/g6.html", "utf8");
const idx  = fs.readFileSync("/home/claude/api/index.ts", "utf8");

let PASS = 0, FAIL = 0;
const ok = (n, c, extra="") => { c ? (PASS++, console.log("  ✓", n, extra))
                                   : (FAIL++, console.log("  ✗", n, extra)); };

/* 서버 응답 블록에서 최상위 키를 뽑는다 */
function keysOf(marker, span = 9000) {
  const i = idx.indexOf(marker);
  if (i < 0) return null;
  const chunk = idx.slice(i, i + span);
  const j = chunk.indexOf("return ok({");
  if (j < 0) return null;

  // 여는 중괄호부터 짝이 맞는 닫는 중괄호까지 잘라낸다
  let p = j + "return ok(".length, depth = 0, endPos = -1;
  for (let k = p; k < chunk.length; k++) {
    const c = chunk[k];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") { depth--; if (depth === 0) { endPos = k; break; } }
  }
  if (endPos < 0) return null;
  const body = chunk.slice(p + 1, endPos);

  // 최상위 쉼표로만 쪼갠다
  const parts = [];
  let d = 0, buf = "", str = null;
  for (const c of body) {
    if (str) { buf += c; if (c === str) str = null; continue; }
    if (c === '"' || c === "'" || c === "`") { str = c; buf += c; continue; }
    if ("{[(".includes(c)) d++;
    if ("}])".includes(c)) d--;
    if (c === "," && d === 0) { parts.push(buf); buf = ""; continue; }
    buf += c;
  }
  parts.push(buf);

  const out = new Set();
  for (const raw of parts) {
    const t = raw.trim();
    if (!t) continue;
    const m = t.match(/^([a-zA-Z_]\w*)\s*(?::|$)/);
    if (m) out.add(m[1]);
  }
  return out;
}

console.log("[1] /explore/step — 클라이언트가 읽는 필드가 응답에 있나");
const stepKeys = keysOf('if (path === "/explore/step"', 9000);
const NEED_STEP = ["step","of","boss","result","turns","log","hp_state","bujeong",
                   "enemies","drops","sinpyo_note","status","reason","reward"];
for (const k of NEED_STEP) ok(`응답에 ${k}`, stepKeys?.has(k), stepKeys?.has(k) ? "" : "← 없음");

console.log("\n[2] 클라이언트가 실제로 그 이름으로 읽는가");
const reads = [
  ["r.hp_state",    /SESS\.hpBefore = r\.hp_state/],
  ["r.sinpyo_note", /r\.sinpyo_note/],
  ["r.drops.mats",  /r\.drops\?\.mats/],
  ["r.reason",      /r\.reason/],
  ["r.reward",      /rewardHtml\(r\.reward\)/],
  ["r.bujeong",     /SESS\.bujeong = r\.bujeong/],
  ["r.boss",        /if \(r\.boss\)/],
];
for (const [name, re] of reads) ok(`클라이언트가 ${name} 를 읽는다`, re.test(html));

console.log("\n[3] 옛 이름이 남아 있지 않은가 (남으면 화면이 조용히 빈다)");
for (const bad of ["hp:", "settle:", "player_exp:", "sinpyo,"]) {
  const present = stepKeys?.has(bad.replace(/[:,]/,""));
  ok(`옛 이름 ${bad.replace(/[:,]/,"")} 없음`, !present, present ? "← 아직 있다" : "");
}

console.log("\n[4] reward 안쪽 — rewardHtml() 이 읽는 필드");
const settleRet = idx.slice(idx.indexOf("return { materials: mats"), idx.indexOf("return { materials: mats") + 260);
for (const k of ["materials","cards","yeopjeon","cleared","exp","level_up"])
  ok(`settle 이 ${k} 를 돌려준다`, new RegExp(`\\b${k}\\s*[:,}]`).test(settleRet));
ok("level_up 에 cost_cap 이 있다", /cost_cap:\s*costCap\(lv\)/.test(idx));
ok("클라이언트가 level_up.cost_cap 을 읽는다", /level_up\.sinryeok \?\? w\.level_up\.cost_cap/.test(html));

console.log("\n[5] /explore/leave");
ok("leave 가 reward 로 내려준다", /return ok\(\{ left: true, reward: a/.test(idx));
ok("클라이언트가 leave 에서 r.reward 를 읽는다",
   /const r = await api\("\/explore\/leave"[\s\S]{0,220}rewardHtml\(r\.reward\)/.test(html));

console.log("\n[6] /ssitgim — 클라이언트 계약");
const ssKeys = keysOf('if (path === "/ssitgim"', 400) ?? new Set();
const ssSrc = fs.readFileSync("/home/claude/api/routes2.ts", "utf8");
for (const k of ["step","name","success","gopuli","rate_used","bujeong","cleared","text"])
  ok(`ssitgim 응답에 ${k}`, new RegExp(`\\b${k}\\s*[:,]`).test(ssSrc.slice(ssSrc.indexOf("return ok({\n    step, of: S.STEPS"))));

console.log(`\n${"=".repeat(44)}\n통과 ${PASS} · 실패 ${FAIL}\n${"=".repeat(44)}`);
process.exit(FAIL ? 1 : 0);
