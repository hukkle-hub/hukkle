const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('const cards=') + 'const cards='.length;
const end = html.indexOf('];', start) + 1;
if (start < 'const cards='.length || end <= start) throw new Error('카드 데이터를 찾을 수 없습니다.');
const cards = JSON.parse(html.slice(start, end));

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const average = (values) => Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
const groupStats = (key) => Object.fromEntries(
  [...new Set(cards.map((card) => card[key]))].map((value) => {
    const group = cards.filter((card) => card[key] === value);
    return [value, { count: group.length, avgPower: average(group.map((c) => c.basePower)), avgHp: average(group.map((c) => c.baseHp)) }];
  })
);

assert(cards.length === 125, `카드 수 ${cards.length}/125`);
assert(new Set(cards.map((c) => c.id)).size === 125, '카드 ID 중복');
assert(new Set(cards.map((c) => c.img)).size === 125, '기본 원화 경로 중복');
assert(new Set(cards.map((c) => c.finalImg)).size === 125, '최종진화 원화 경로 중복');

for (const card of cards) {
  assert(fs.existsSync(path.join(root, card.img)), `${card.id} 기본 원화 누락`);
  assert(fs.existsSync(path.join(root, card.finalImg)), `${card.id} 최종진화 원화 누락`);
  assert(card.skills?.length === 6, `${card.id} 스킬 단계 ${card.skills?.length || 0}/6`);
  assert(card.forms?.length === 6, `${card.id} 진화 단계 ${card.forms?.length || 0}/6`);
  assert(card.specials?.length >= 5, `${card.id} 최종진화 특수기 부족`);
  for (let i = 1; i < (card.skills?.length || 0); i++) {
    assert(card.skills[i].power >= card.skills[i - 1].power, `${card.id} 스킬 위력 역전 ★${i}->★${i + 1}`);
    assert(card.skills[i].break >= card.skills[i - 1].break, `${card.id} BREAK 역전 ★${i}->★${i + 1}`);
  }
  for (let i = 1; i < (card.forms?.length || 0); i++) {
    assert(card.forms[i].atk > card.forms[i - 1].atk, `${card.id} 공격 성장 정체 ★${i}->★${i + 1}`);
    assert(card.forms[i].hp > card.forms[i - 1].hp, `${card.id} 체력 성장 정체 ★${i}->★${i + 1}`);
    assert(card.forms[i].coinCost > card.forms[i - 1].coinCost, `${card.id} 성장 비용 역전 ★${i}->★${i + 1}`);
  }
}

const roles = groupStats('role');
const factions = groupStats('faction');
assert(roles['암살자'].avgPower > roles['밸런스'].avgPower, '암살자 공격 우위가 없음');
assert(roles['탱커'].avgHp > roles['밸런스'].avgHp && roles['탱커'].avgHp > roles['암살자'].avgHp, '탱커 체력 우위가 없음');
const factionPowers = Object.values(factions).map((x) => x.avgPower);
const factionHps = Object.values(factions).map((x) => x.avgHp);
assert(Math.max(...factionPowers) / Math.min(...factionPowers) < 1.08, '세력별 평균 공격 편차가 8% 이상');
assert(Math.max(...factionHps) / Math.min(...factionHps) < 1.08, '세력별 평균 체력 편차가 8% 이상');

assert(html.includes('const pageSize=30'), '30장 단위 페이지 설정 누락');
assert(html.includes('loading="lazy"'), '카드 원화 지연 로딩 누락');
assert(!html.includes("[1,2,3,4,5,6,'final']"), '1~6성/최종진화를 한꺼번에 표시함');

const report = {
  version: '63.0.0',
  passed: failures.length === 0,
  cards: cards.length,
  uniqueBaseArt: new Set(cards.map((c) => c.img)).size,
  uniqueFinalArt: new Set(cards.map((c) => c.finalImg)).size,
  skills: cards.reduce((sum, c) => sum + c.skills.length, 0),
  finalSpecials: cards.reduce((sum, c) => sum + c.specials.length, 0),
  roles,
  factions,
  catalog: { pageSize: 30, lazyImages: true, visibleEvolutionStages: 2 },
  failures
};
fs.writeFileSync(path.join(root, 'CARD_BALANCE_QA_v63.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
