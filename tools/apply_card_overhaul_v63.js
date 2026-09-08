const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'card_manifest_v47.json'), 'utf8'));
let html = fs.readFileSync(htmlPath, 'utf8').replace(/\r\n/g, '\n');

const cardsStart = html.indexOf('const cards=[');
const filtersStart = html.indexOf('const cardFilters', cardsStart);
const cardsEnd = filtersStart < 0 ? -1 : html.lastIndexOf('];', filtersStart);
if (cardsStart < 0 || cardsEnd < 0) throw new Error('card data block not found');
const oldCards = JSON.parse(html.slice(cardsStart + 'const cards='.length, cardsEnd + 1));
const oldById = new Map(oldCards.map(c => [c.sourceId, c]));

const cards = manifest.cards.map(m => {
  const old = oldById.get(m.id) || {};
  const skills = m.skills.map(s => ({
    star: s.star,
    name: s.name,
    grade: s.grade,
    cost: s.energy_cost,
    power: s.power,
    break: s.break,
    effect: s.effect,
    counter: s.counter,
    desc: s.desc,
  }));
  return {
    ...old,
    id: m.id.toLowerCase(),
    sourceId: m.id,
    name: m.name,
    faction: m.faction,
    role: m.role,
    route: m.route,
    stars: 1,
    img: `assets/cards-v63/${m.id}.webp`,
    finalImg: `assets/cards-v63/${m.id}-final.webp`,
    skill: m.skill,
    skills,
    basePower: m.base_power,
    baseHp: m.base_hp,
    forms: m.forms.map(f => ({
      star: f.star,
      stage: f.stage,
      levelCap: f.level_cap,
      atk: f.atk_multiplier,
      hp: f.hp_multiplier,
      break: f.break_multiplier,
      coinCost: f.evolution_coin_cost,
      memoryCost: f.evolution_memory_cost,
    })),
    finalName: `${m.name}의 최종현현`,
    finalBuff: m.final_evolution.battle_buff,
    specials: m.final_evolution.special_skill_pool.map(s => ({
      id: s.id,
      name: s.name,
      grade: s.grade,
      power: s.power,
      break: s.break,
      desc: s.description,
    })),
  };
});

html = html.slice(0, cardsStart) + `const cards=${JSON.stringify(cards)};` + html.slice(cardsEnd + 2);

html = html.replace(
  "document.querySelectorAll('#cardFilters button').forEach(b=>b.onclick=()=>{state.cardFilter=b.dataset.f;renderCards()});",
  "document.querySelectorAll('#cardFilters button').forEach(b=>b.onclick=()=>{state.cardFilter=b.dataset.f;state.cardPage=1;renderCards()});"
);

const oldListBlock = "const list=cards.filter(c=>state.cardFilter==='전체'||c.faction===state.cardFilter||c.role.includes(state.cardFilter));if(!list.some(c=>c.id===state.selectedCard))state.selectedCard=(list[0]||cards[0]).id;\n document.getElementById('cardCount').textContent=`${cards.length} / 125`;\n document.getElementById('cardGrid').innerHTML=list.map(c=>`<button class=\"card-unit-v4 ${state.selectedCard===c.id?'selected':''}\" data-id=\"${c.id}\"><img src=\"${c.img}\" alt=\"${c.name}\"><span class=\"owned-stage\">${cardStageOf(c)}성</span>${state.companionCard===c.id?'<i class=\"companion-dot\"></i>':''}<div class=\"meta\"><b>${c.name}</b><small>${c.faction} · ${c.role}</small></div></button>`).join('');document.querySelectorAll('#cardGrid .card-unit-v4').forEach(b=>b.onclick=()=>{state.selectedCard=b.dataset.id;state.cardViewStage=cardStageOf(cards.find(x=>x.id===b.dataset.id));renderCards()});";
const newListBlock = "const list=cards.filter(c=>state.cardFilter==='전체'||c.faction===state.cardFilter||c.role.includes(state.cardFilter));if(!list.some(c=>c.id===state.selectedCard))state.selectedCard=(list[0]||cards[0]).id;\n state.cardPage=Math.max(1,state.cardPage||1);const pageSize=30,visibleList=list.slice(0,state.cardPage*pageSize);\n document.getElementById('cardCount').textContent=`${list.length}종 · ${visibleList.length}장 표시`;\n document.getElementById('cardGrid').innerHTML=visibleList.map(c=>`<button class=\"card-unit-v4 ${state.selectedCard===c.id?'selected':''}\" data-id=\"${c.id}\"><img src=\"${c.img}\" alt=\"${c.name}\" loading=\"lazy\" decoding=\"async\"><span class=\"owned-stage\">${cardStageOf(c)}성</span>${state.companionCard===c.id?'<i class=\"companion-dot\"></i>':''}<div class=\"meta\"><b>${c.name}</b><small>${c.faction} · ${c.role}</small></div></button>`).join('')+(visibleList.length<list.length?`<button class=\"card-load-more\" id=\"cardLoadMore\">다음 카드 ${Math.min(pageSize,list.length-visibleList.length)}장 보기</button>`:'');document.querySelectorAll('#cardGrid .card-unit-v4').forEach(b=>b.onclick=()=>{state.selectedCard=b.dataset.id;state.cardViewStage=cardStageOf(cards.find(x=>x.id===b.dataset.id));renderCards()});const more=document.getElementById('cardLoadMore');if(more)more.onclick=()=>{state.cardPage++;renderCards()};";
if (!html.includes(oldListBlock)) throw new Error('card list block not found');
html = html.replace(oldListBlock, newListBlock);

html = html.replace(
  "let view=state.cardViewStage==='final'?'final':Math.max(1,Math.min(6,+state.cardViewStage||current));if(view==='final'&&!cardFinalUnlocked(c))view=current;state.cardViewStage=view;",
  "let view=state.cardViewStage==='final'&&cardFinalUnlocked(c)?'final':current;state.cardViewStage=view;"
);

html = html.replace(
  "document.getElementById('cardStage').className=`card-stage-v4 stage-${isFinal?'final':view}`;",
  "document.getElementById('cardStage').className=`card-stage-v4 stage-${isFinal?'final':view} faction-${c.faction} route-${c.route}`;"
);

const oldStrip = "document.getElementById('evolutionStrip').innerHTML=[1,2,3,4,5,6,'final'].map(st=>{const unlocked=st==='final'?cardFinalUnlocked(c):st<=current;return `<button class=\"evo-step ${String(view)===String(st)?'active':''} ${!unlocked?'locked':''}\" data-stage=\"${st}\" ${!unlocked?'disabled':''}>${st==='final'?'✦ 최종':`${st}성`}</button>`}).join('');document.querySelectorAll('#evolutionStrip .evo-step').forEach(b=>b.onclick=()=>{state.cardViewStage=b.dataset.stage==='final'?'final':+b.dataset.stage;renderCards()});";
const newStrip = "const stageChoices=[current];if(current<6)stageChoices.push(current+1);else if(cardFinalUnlocked(c))stageChoices.push('final');document.getElementById('evolutionStrip').innerHTML=stageChoices.map(st=>{const unlocked=st==='final'?cardFinalUnlocked(c):st<=current;const label=st==='final'?'✦ 최종현현':(st===current?`${st}성 · 현재`:`${st}성 · 다음`);return `<button class=\"evo-step ${String(view)===String(st)?'active':''} ${!unlocked?'locked':''}\" data-stage=\"${st}\" ${!unlocked?'disabled':''}>${label}</button>`}).join('');document.querySelectorAll('#evolutionStrip .evo-step').forEach(b=>b.onclick=()=>{state.cardViewStage=b.dataset.stage==='final'?'final':current;renderCards()});";
if (!html.includes(oldStrip)) throw new Error('evolution strip block not found');
html = html.replace(oldStrip, newStrip);

html = html.replace(
  "document.getElementById('cardStageNote').textContent=isFinal?`최종진화 · ${c.finalName}`:'1~6성은 동일 원화에 프레임·입자·현신 깊이만 달라집니다.';",
  "document.getElementById('cardStageNote').textContent=isFinal?`최종진화 · ${c.finalName} · 카드 경계 해방`:`${current}성 ${c.forms[current-1].stage} · 다음 단계만 표시됩니다.`;"
);

const oldDetailNeedle = "<div class=\"card-skill-v4\"><b>기본 스킬 ${isFinal?6:view}개</b><br>${c.skills.slice(0,isFinal?6:view).map(s=>`${s.star}성 · ${s.name} <small>[${s.grade}]</small>`).join(`<br>`)}</div>";
const newDetailNeedle = "<div class=\"card-skill-v4\"><b>${isFinal?'최종현현 핵심기':`${current}성 활성 스킬`}</b><br>${(()=>{const s=c.skills[isFinal?5:current-1];return `${s.name} <small>[${s.grade}]</small><br><span>위력 ${s.power.toFixed(2)} · BREAK ${s.break.toFixed(2)} · 기력 ${s.cost}</span><br><small>${s.desc}</small>`})()}${isFinal&&c.specials?.length?`<br><b>현현 특수기</b> ${c.specials[0].name} <small>[${c.specials[0].grade}]</small>`:''}</div>";
if (!html.includes(oldDetailNeedle)) throw new Error('skill detail block not found');
html = html.replace(oldDetailNeedle, newDetailNeedle);

html = html.replace(
  "const evolve=document.getElementById('cardEvolve');if(current<6){const cost=current*2400;",
  "const evolve=document.getElementById('cardEvolve');if(current<6){const nextForm=c.forms[current],cost=nextForm.coinCost;"
);

const css = `
/* v63: Korean folklore art set, progressive catalog, and authored evolution frames. */
.card-collection-grid{grid-auto-rows:max-content}.card-unit-v4 img,.living-card img{object-position:center center!important}.card-load-more{grid-column:1/-1;min-height:38px;border:1px solid rgba(221,184,111,.28);border-radius:10px;background:linear-gradient(90deg,rgba(221,184,111,.06),rgba(92,167,191,.08));color:var(--gold2);font-size:9px}.evolution-strip-v4{display:flex;justify-content:center;gap:8px}.evolution-strip-v4 .evo-step{width:min(180px,42%);flex:0 1 180px}.living-card{padding:8px;border-radius:20px;background:conic-gradient(from 215deg,#211b15,#857056,#2b3438,#b89a61,#211b15);box-shadow:inset 0 0 0 1px rgba(255,245,215,.58),inset 0 0 0 5px rgba(0,0,0,.52),0 16px 42px rgba(0,0,0,.72)}.living-card:before{inset:10px;border:1px solid rgba(255,244,207,.38);border-radius:12px;box-shadow:inset 0 0 0 2px rgba(0,0,0,.5)}.stage-1 .living-card{--frame-glow:#7a6b58;background:linear-gradient(145deg,#171512,#5c5143 28%,#26231f 55%,#8b7962 78%,#171512)}.stage-2 .living-card{--frame-glow:#b26b3d;background:linear-gradient(145deg,#27140d,#a65c32 26%,#392018 53%,#cd8550 78%,#1b100b)}.stage-3 .living-card{--frame-glow:#bac7ce;background:linear-gradient(145deg,#283037,#aebbc3 24%,#37464e 54%,#d7e0e4 78%,#20272b)}.stage-4 .living-card{--frame-glow:#5eb7d2;background:linear-gradient(145deg,#092a36,#4298b4 24%,#153f4d 52%,#84d0e4 78%,#09222c)}.stage-5 .living-card{--frame-glow:#deb45d;background:linear-gradient(145deg,#33230a,#c69136 24%,#594319 52%,#f0ca73 78%,#291d0b)}.stage-6 .living-card{--frame-glow:#f4d47e;background:conic-gradient(from 210deg,#183944,#d9ae4f,#2f7586,#fff0a8,#315d68,#d9ae4f,#183944);box-shadow:inset 0 0 0 1px rgba(255,250,220,.8),inset 0 0 0 5px rgba(0,0,0,.5),0 0 32px color-mix(in srgb,var(--frame-glow) 34%,transparent),0 18px 46px #000}.faction-당 .card-aura{background:radial-gradient(circle,rgba(222,174,82,.34),rgba(135,92,44,.08) 46%,transparent 70%)}.faction-물 .card-aura{background:radial-gradient(circle,rgba(72,174,205,.38),rgba(34,83,112,.08) 46%,transparent 70%)}.faction-저승 .card-aura{background:radial-gradient(circle,rgba(157,86,116,.38),rgba(55,35,66,.1) 46%,transparent 70%)}.stage-final .living-card{padding:3px;opacity:.72;background:linear-gradient(145deg,rgba(255,235,165,.7),rgba(64,146,174,.72),rgba(255,235,165,.66));box-shadow:0 0 40px rgba(106,190,218,.34)}.stage-final .card-nameplate{opacity:.72}.card-skill-v4 span{color:#d8caa9}.card-skill-v4 small{color:#9faeb2}
`;
if (!html.includes('/* v63: Korean folklore art set')) html = html.replace('</style>', css + '\n</style>');

html = html.replace(/<title>[^<]*<\/title>/, '<title>흥양기 v63 · 한국 설화 카드 전면개편</title>');
fs.writeFileSync(htmlPath, html, 'utf8');
console.log(JSON.stringify({cards: cards.length, uniqueArt: new Set(cards.map(c => c.img)).size, finals: cards.filter(c => c.finalImg).length}, null, 2));
