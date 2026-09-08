const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '..', 'incoming-recovery', 'expanded', 'handoff', 'card_manifest_v47.json');
const manifest = JSON.parse(fs.readFileSync(source, 'utf8'));
const availableArt = new Set(['C018', 'C034', 'C038', 'C045', 'C071', 'C075', 'C121']);
const cards = manifest.cards.map((card) => {
  const id = card.id.toLowerCase();
  const skills = card.forms.map((form) => ({
    star: form.star,
    name: form.new_skill,
    grade: form.skill_grade,
  }));
  return {
    id,
    sourceId: card.id,
    name: card.name,
    faction: card.faction,
    role: card.role,
    stars: 1,
    img: availableArt.has(card.id)
      ? (card.id === 'C075' ? 'assets/c075_base.webp' : `assets/${id}.jpg`)
      : 'assets/c075.jpg',
    finalImg: card.id === 'C075' ? 'assets/c075_final.webp' : null,
    skill: card.skill,
    skills,
    explore: `${card.name}의 기록과 지역 반응을 조사한다.`,
    desc: `${card.unique}의 성질을 전투와 탐험에 연결한다.`,
    source: '흥양기 카드 125종 통합 기록',
    route: card.route,
    bond: 0,
    finalName: `${card.name}의 최종현현`,
    specials: card.specials || [],
  };
});

let htmlPath = path.join(root, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const start = html.indexOf('const cards=[');
const filters = html.indexOf('const cardFilters=', start);
const end = html.lastIndexOf('];', filters);
if (start < 0 || end < 0) throw new Error('card data block not found');
html = html.slice(0, start) + `const cards=${JSON.stringify(cards)};\n` + html.slice(end + 3);
html = html.replaceAll(' / 124', ' / 125');
html = html.replace(
  /function route\(name,opts=\{\}\)\{[^\r\n]*/,
  "function route(name,opts={}){if(!document.querySelector(`[data-screen=\"${name}\"]`))return;if(name==='map'&&state.screen==='home'&&!opts.direct&&state.motion){return playCinematic('open',()=>route('map',{direct:true}))}screens.forEach(s=>s.classList.toggle('active',s.dataset.screen===name));state.screen=name;save();document.querySelectorAll('.nav').forEach(nav=>nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.route===name)));if(name==='map')setTimeout(()=>map&&map.invalidateSize(),80)}"
);
html = html.replace(
  '<div class="card-skill-v4"><b>${c.skill}</b><br>${c.desc}</div>',
  '<div class="card-skill-v4"><b>기본 스킬 ${isFinal?6:view}개</b><br>${c.skills.slice(0,isFinal?6:view).map(s=>`${s.star}성 · ${s.name} <small>[${s.grade}]</small>`).join(`<br>`)}</div>'
);
html = html.replace('<meta name="hy-version" content="42.0.0">', '<meta name="hy-version" content="57.0.0">');
html = html.replace(/<title>.*?<\/title>/, '<title>흥양기 v57 · 모바일 UI 안정화</title>');
html = html.replaceAll('&v=42.0&t=', '&v=57.0&t=');
html = html.replace(
  '</style>',
  `\n/* v57 mobile stabilization */\nhtml,body{width:100%;height:100%;overflow:hidden;background:#050607}#game{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;aspect-ratio:auto!important;margin:0!important;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)}.screen{transition:opacity .18s ease,transform .18s ease}.screen:not(.active){opacity:0;pointer-events:none;transform:translateY(5px)}.screen.active{opacity:1;transform:none}.title-start{z-index:30}.title-load{z-index:25;bottom:0;height:8.5%;padding:10px 18px 5px;pointer-events:none;transition:opacity .25s ease}.title-load.ready{opacity:0}.title-retry{pointer-events:auto}.cards-layout-v4{grid-template-columns:minmax(220px,28%) minmax(360px,44%) minmax(240px,28%)}.card-collection-grid{grid-template-columns:repeat(3,minmax(62px,1fr))}.panel,.card-detail-v4{min-width:0}.nav button,button{min-height:44px}@media(max-width:900px){.cards-layout-v4{grid-template-columns:26% 43% 31%;gap:7px}.card-browser-v4{padding:8px}.card-collection-grid{grid-template-columns:repeat(3,minmax(48px,1fr));gap:5px}.card-unit-v4 .meta small{display:none}.card-detail-v4{font-size:9px}.title-load{height:8%;padding:7px 11px 4px}}\n</style>`
);
html = html.replace('start.disabled=false;retry.classList.add(\'hidden\');update();', "start.disabled=false;retry.classList.add('hidden');update();setTimeout(()=>$('#titleLoad').classList.add('ready'),350);");
fs.writeFileSync(htmlPath, html, 'utf8');
fs.copyFileSync(source, path.join(root, 'card_manifest_v47.json'));
