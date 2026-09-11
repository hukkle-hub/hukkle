/* 흥양기 v81 — 판(板) 보스전 프로토타입
 * 기존 dungeon-flow.html의 데이터/에셋/저장 구조를 그대로 쓰고,
 * 전투 루프만 합 → 7매듭 → 판의 기세 → 강신 구조로 교체한다.
 */
(() => {
  'use strict';

  const PAN_VERSION = '81.0.0';
  const KNOTS = 7;
  const HEAT_MAX = 4;
  const TEMPO = [1, .93, .85, .77, .68];
  const START_HEAT = { yeoja: 0, nokdong: 1, geogeum: 0, naro: 3, palyoung: 1 };
  const HEAT_COPY = ['판이 가라앉아 있다', '호흡이 붙기 시작한다', '판이 달아오른다', '몰아치기 시작한다', '강신 직전'];
  const CUES = {
    break: ['익숙한 길이 한 겹 더 겹쳐 보인다.', '경계의 모양이 조금씩 어긋난다.', '무언가가 자리를 바꾸고 있다.'],
    guard: ['누군가 대답을 기다리고 있다.', '시선이 멈춘 채 답을 재촉한다.', '기척이 가까이 와 말을 건다.'],
    strike: ['주변의 무게가 한쪽으로 쏠린다.', '거리감이 갑자기 틀어진다.', '한 점으로 힘이 모이기 시작한다.']
  };

  const q = (s) => document.querySelector(s);
  const qq = (s) => [...document.querySelectorAll(s)];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  const original = {
    startBossBattle,
    renderBattle,
    useBattleSkill,
    finishBattle
  };

  function panCue(intent) {
    const kind = intent?.[2] || 'strike';
    const list = CUES[kind] || CUES.strike;
    const idx = Math.max(0, ((battle?.turn || 1) - 1) % list.length);
    return list[idx];
  }

  function panInitialHeat() {
    return clamp(START_HEAT[current] ?? 0, 0, HEAT_MAX);
  }

  function panSyncLegacy() {
    if (!battle) return;
    battle.knotsRemaining = clamp(Number.isFinite(battle.knotsRemaining) ? battle.knotsRemaining : KNOTS, 0, KNOTS);
    battle.heat = clamp(Number.isFinite(battle.heat) ? battle.heat : panInitialHeat(), 0, HEAT_MAX);
    // 기존 저장/연출 코드가 참조하므로 값은 호환용으로만 유지한다.
    battle.bossBreak = Math.round((KNOTS - battle.knotsRemaining) / KNOTS * 100);
    battle.resolve = Math.round(battle.heat / HEAT_MAX * 100);
  }

  function panTempoScale() {
    return TEMPO[clamp(battle?.heat ?? 0, 0, HEAT_MAX)] || 1;
  }

  function panApplyTempo() {
    const game = q('#game');
    if (!game || !battle) return;
    const scale = panTempoScale();
    game.style.setProperty('--pan-tempo', String(scale));
    game.dataset.panHeat = String(battle.heat);
    game.classList.add('pan-system-active');
  }

  function panEnsureUI() {
    const game = q('#game');
    if (!game || game.dataset.panUi === PAN_VERSION) return;
    game.dataset.panUi = PAN_VERSION;

    const style = document.createElement('style');
    style.id = 'panSystemStyles';
    style.textContent = `
      #game.pan-system-active{--pan-tempo:1}
      #game.pan-system-active .battle-presence .meter.hp,
      #game.pan-system-active .battle-presence .meter.break{display:none!important}
      #game.pan-system-active .battle-presence{width:min(480px,40vw)!important;padding:8px 12px 10px!important}
      #game.pan-system-active .boss-identity span{position:static!important;margin-left:8px}
      #game.pan-system-active .battle-intent{top:17%!important;width:min(420px,38vw)!important}
      #game.pan-system-active .battle-intent b{color:#f1d9a1}
      #game.pan-system-active .battle-intent span{color:#d6d0c5}

      /* 3층 구도 — 보스(상단 60%) / 아인·동행자(하단층) / 손패(최하단) */
      #game.pan-system-active .battle-actors{left:50%!important;right:auto!important;bottom:25%!important;width:30%!important;height:39%!important;translate:-50% 0;transform:none!important}
      #game.pan-system-active .ain-actor{left:50%!important;right:auto!important;width:48%!important;height:100%!important;translate:-50% 0;z-index:2!important}
      #game.pan-system-active .manifest-actor{left:-36%!important;right:auto!important;width:66%!important;height:94%!important;bottom:0!important;z-index:1!important;transform:translateX(-8%) scale(.94)!important}
      #game.pan-system-active .manifest-actor.active{opacity:.9!important;transform:none!important}
      #game.pan-system-active .skill-grid{left:18%!important;right:18%!important;bottom:max(8px,env(safe-area-inset-bottom))!important;height:23%!important;z-index:28!important}
      #game.pan-system-active .raid-rail{display:none!important}
      #game.pan-system-active .combat-log{right:max(12px,env(safe-area-inset-right))!important;bottom:27%!important;top:auto!important;width:min(285px,24vw)!important}
      #game.pan-system-active .player-hud{width:min(300px,27vw)!important}

      /* 숫자 BREAK 대신 실제 7매듭 */
      #game.pan-system-active .knot-hud{left:max(16px,env(safe-area-inset-left))!important;right:auto!important;top:12%!important;bottom:auto!important;z-index:31!important;padding:8px 11px!important;border-radius:999px;background:rgba(3,7,9,.82)!important;backdrop-filter:blur(8px)}
      #game.pan-system-active .knot-hud>b{font-size:12px!important}
      #game.pan-system-active .knot-gauge i{width:14px!important;height:14px!important;transition:transform .35s ease,opacity .35s ease,filter .35s ease!important}
      #game.pan-system-active .knot-gauge i.bound{border-color:#d4a557!important;background:#835a28!important;box-shadow:0 0 8px rgba(231,168,72,.55),inset 0 0 4px #f3d18c!important}
      #game.pan-system-active .knot-gauge i.released{border-color:#7e8b8e!important;background:transparent!important;box-shadow:none!important;opacity:.42;transform:rotate(45deg) scale(.66)!important}

      /* 현현 0/100을 판의 기세 5단계로 교체 */
      #game.pan-system-active .meter.resolve .meter-track{height:6px!important}
      #game.pan-system-active .meter.resolve .meter-track i{background:linear-gradient(90deg,#9b7137,#f1d28a)!important;transition:width calc(.42s * var(--pan-tempo)) ease!important}
      #game.pan-system-active .meter.resolve .meter-head b{letter-spacing:.08em}

      /* 장단이 올라갈수록 실제 연출 속도가 빨라진다 */
      #game.pan-system-active[data-route="수호"] .skill-fx.play{animation-duration:calc(.62s * var(--pan-tempo))!important}
      #game.pan-system-active[data-route="기록"] .skill-fx.play{animation-duration:calc(.70s * var(--pan-tempo))!important}
      #game.pan-system-active[data-route="의례"] .skill-fx.play{animation-duration:calc(.90s * var(--pan-tempo))!important}
      #game.pan-system-active[data-route="해령"] .skill-fx.play{animation-duration:calc(.80s * var(--pan-tempo))!important}
      #game.pan-system-active[data-route="심판"] .skill-fx.play{animation-duration:calc(.55s * var(--pan-tempo))!important}
      #game.pan-system-active[data-route="넋"] .skill-fx.play{animation-duration:calc(1s * var(--pan-tempo))!important}
      #game.pan-system-active .skill-fx.strike i{animation-duration:calc(.58s * var(--pan-tempo))!important}
      #game.pan-system-active .skill-fx.break i{animation-duration:calc(.70s * var(--pan-tempo))!important}
      #game.pan-system-active .skill-fx.guard i{animation-duration:calc(.72s * var(--pan-tempo))!important}
      #game.pan-system-active .damage-float.play{animation-duration:calc(.80s * var(--pan-tempo))!important}
      #game.pan-system-active .hit-flash.play{animation-duration:calc(.48s * var(--pan-tempo))!important}
      #game.pan-system-active .battle-shell.shake{animation-duration:calc(.34s * var(--pan-tempo))!important}
      #game.pan-system-active .skill-banner.play{animation-duration:calc(1.1s * var(--pan-tempo))!important}

      /* 합 — 보스 자체는 움직이지 않고, 양쪽 기술만 중앙에서 충돌한다. */
      .pan-clash{position:absolute;z-index:110;inset:0;display:none;pointer-events:none;isolation:isolate}
      .pan-clash.play{display:block}
      .pan-clash:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 46%,rgba(0,0,0,.08),rgba(0,0,0,.52) 72%);animation:panVeil calc(var(--pan-clash-ms,760ms) * .72) ease both}
      .pan-clash-side{position:absolute;top:39%;width:min(240px,22vw);height:26%;display:grid;place-items:center;gap:7px;opacity:0}
      .pan-clash-player{left:10%;animation:panPlayerIn var(--pan-clash-ms,760ms) cubic-bezier(.18,.78,.2,1) both}
      .pan-clash-enemy{right:10%;animation:panEnemyIn var(--pan-clash-ms,760ms) cubic-bezier(.18,.78,.2,1) both}
      .pan-clash-player img{width:min(112px,9vw);height:min(150px,19vh);object-fit:cover;border-radius:9px;border:1px solid rgba(241,217,161,.55);box-shadow:0 8px 24px #000}
      .pan-clash-side b{padding:5px 10px;border-radius:999px;background:rgba(3,7,10,.84);border:1px solid rgba(241,217,161,.22);font:800 12px "Noto Serif KR",serif;text-align:center}
      .pan-clash-enemy b{border-color:rgba(197,106,94,.42);color:#f0bbb3}
      .pan-clash-burst{position:absolute;z-index:4;left:50%;top:48%;translate:-50% -50%;width:min(230px,24vw);opacity:0;filter:drop-shadow(0 0 20px rgba(255,223,152,.78));animation:panBurst var(--pan-clash-ms,760ms) ease-out both}
      .pan-clash-call{position:absolute;z-index:5;left:50%;top:48%;translate:-50% -50%;opacity:0;padding:7px 15px;border-radius:999px;background:rgba(2,5,8,.84);border:1px solid rgba(241,217,161,.46);font:900 clamp(20px,3vw,40px) "Noto Serif KR",serif;letter-spacing:.06em;text-shadow:0 3px 12px #000;animation:panCall var(--pan-clash-ms,760ms) ease-out both}
      .pan-clash.win .pan-clash-call{color:#ffe3a1}
      .pan-clash.lose .pan-clash-call{color:#efaaa0;border-color:rgba(197,106,94,.55)}
      @keyframes panPlayerIn{0%{opacity:0;transform:translateX(-42%) scale(.86)}20%{opacity:1}48%{opacity:1;transform:translateX(115%) scale(1)}67%,100%{opacity:0;transform:translateX(115%) scale(.94)}}
      @keyframes panEnemyIn{0%{opacity:0;transform:translateX(42%) scale(.94)}20%{opacity:1}48%{opacity:1;transform:translateX(-115%) scale(1)}67%,100%{opacity:0;transform:translateX(-115%) scale(.94)}}
      @keyframes panBurst{0%,42%{opacity:0;transform:scale(.25)}51%{opacity:1;transform:scale(1.1)}78%,100%{opacity:0;transform:scale(1.75)}}
      @keyframes panCall{0%,47%{opacity:0;transform:scale(.6)}57%,76%{opacity:1;transform:none}100%{opacity:0;transform:scale(1.12)}}
      @keyframes panVeil{from{opacity:0}22%,80%{opacity:1}to{opacity:0}}

      @media(max-width:900px){
        #game.pan-system-active .battle-actors{bottom:27%!important;width:34%!important;height:35%!important}
        #game.pan-system-active .skill-grid{left:14%!important;right:14%!important;height:24%!important}
        #game.pan-system-active .knot-hud{top:11%!important}
        .pan-clash-side{width:24vw}.pan-clash-player{left:7%}.pan-clash-enemy{right:7%}
      }
      @media(prefers-reduced-motion:reduce){.pan-clash-side,.pan-clash-burst,.pan-clash-call,.pan-clash:before{animation-duration:.24s!important}}
    `;
    document.head.appendChild(style);

    const clash = document.createElement('div');
    clash.id = 'panClash';
    clash.className = 'pan-clash';
    clash.innerHTML = `
      <div class="pan-clash-side pan-clash-player"><img id="panClashCard" alt=""><b id="panClashSkill">카드 기술</b></div>
      <div class="pan-clash-side pan-clash-enemy"><b id="panClashIntent">보스 행동</b></div>
      <img class="pan-clash-burst" src="../assets/fx/burst.webp" alt="">
      <strong class="pan-clash-call" id="panClashCall">합</strong>`;
    q('#battleShell')?.appendChild(clash);
  }

  function panRenderKnots() {
    const remaining = clamp(battle.knotsRemaining, 0, KNOTS);
    qq('#knotGauge i').forEach((k, i) => {
      const bound = i < remaining;
      k.classList.toggle('bound', bound);
      k.classList.toggle('released', !bound);
      k.classList.remove('lit');
      k.setAttribute('aria-label', bound ? `매듭 ${i + 1} 묶임` : `매듭 ${i + 1} 풀림`);
    });
    const title = q('.knot-hud>b');
    if (title) title.textContent = remaining ? '매듭을 푼다' : '일곱 매듭 해원';
  }

  function panRenderBattle(log) {
    if (!battle) return;
    panEnsureUI();
    panSyncLegacy();
    panApplyTempo();

    const intent = battleIntent();
    const player = clamp(Math.round(battle.playerHp), 0, 100);
    const heat = clamp(battle.heat, 0, HEAT_MAX);

    q('#battleTurn').textContent = `TURN ${battle.turn}`;
    q('#battlePhase').textContent = battle.firstEncounter ? '첫 대면 · 명분' : HEAT_COPY[heat];
    q('#bossIntent').textContent = '다음 기척';
    q('#bossIntentHint').textContent = panCue(intent);

    // HP/BREAK는 판 시스템의 승패 조건이 아니다. 기존 값은 호환만 유지하고 화면에서는 숨긴다.
    if (q('#bossHpText')) q('#bossHpText').textContent = '—';
    if (q('#bossHpBar')) q('#bossHpBar').style.width = '100%';
    if (q('#bossBreakText')) q('#bossBreakText').textContent = '—';
    if (q('#bossBreakBar')) q('#bossBreakBar').style.width = '0%';

    const resolveMeter = q('#resolveText')?.closest('.meter');
    if (resolveMeter) {
      const name = resolveMeter.querySelector('.meter-head span');
      if (name) name.textContent = '판의 기세';
    }
    if (q('#resolveText')) q('#resolveText').textContent = `${'●'.repeat(heat)}${'○'.repeat(HEAT_MAX - heat)}`;
    if (q('#resolveBar')) q('#resolveBar').style.width = `${heat / HEAT_MAX * 100}%`;
    if (q('#playerHpText')) q('#playerHpText').textContent = battle.firstEncounter ? '첫 대면 · 공격 없음' : `${player} / 100`;
    if (q('#playerHpBar')) q('#playerHpBar').style.width = `${player}%`;

    panRenderKnots();
    if (log) q('#combatLog').innerHTML = log;

    const manifest = q('#manifestSkill');
    const ready = !!parentCtx.companionManifested && heat >= HEAT_MAX && !battle.manifestUsed && !battle.busy;
    if (manifest) {
      manifest.disabled = !ready;
      manifest.classList.toggle('ready', ready);
      const label = manifest.querySelector('b');
      const note = manifest.querySelector('span');
      if (label) label.textContent = battle.manifestUsed ? '✦ 강신 완료' : '✦ 7성 강신';
      if (note) note.textContent = !parentCtx.companionManifested ? '최종현현 필요' : battle.manifestUsed ? '동행자가 판에 남아 있습니다' : ready ? '판이 최고조입니다' : '판의 기세가 더 필요합니다';
    }
    qq('#skillGrid .battle-skill:not(.manifest)').forEach(b => b.disabled = !!battle.busy);
  }

  async function panPlayClash(card, intent, won) {
    panEnsureUI();
    const root = q('#panClash');
    const tier = kindTier(card);
    const base = clamp(Math.round((tier.ms || 920) * .62 + 260), 520, 980);
    const duration = Math.round(base * panTempoScale());
    root.style.setProperty('--pan-clash-ms', `${duration}ms`);
    root.className = `pan-clash play ${won ? 'win' : 'lose'}`;
    q('#panClashCard').src = card?.img || parentCtx.companionImg || '../assets/cards-v63/C075.webp';
    q('#panClashSkill').textContent = activeSkill(card || {})?.name || card?.skill || '기록의 수';
    q('#panClashIntent').textContent = intent?.[0] || '이면의 기척';
    q('#panClashCall').textContent = won ? '합 · 받아쳤다' : '합 · 밀렸다';
    void root.offsetWidth;
    await sleep(duration + 40);
    root.className = 'pan-clash';
  }

  function kindTier(card) {
    try { return skillTier(card || {}); }
    catch { return { ms: 920, stop: 45, banner: true }; }
  }

  function panSkillNumbers(kind, card) {
    const stage = card?.manifested ? 7 : Math.max(1, Number(card?.stage || battle.stage || 1));
    const power = 1 + (stage - 1) * .07;
    if (kind === 'break') return { damage: 17 * power, heal: 0 };
    if (kind === 'guard') return { damage: 9 * power, heal: 7 };
    return { damage: 30 * power, heal: 0 };
  }

  function panSetHeat(next) {
    battle.heat = clamp(next, 0, HEAT_MAX);
    panSyncLegacy();
    panApplyTempo();
  }

  async function panManifest(card = null, auto = false) {
    if (!battle || battle.manifestUsed || !parentCtx.companionManifested || battle.heat < HEAT_MAX) return false;
    battle.manifestUsed = true;
    battle.lastSkill = 'manifest';
    card = manifestationCard(card);
    const label = parentCtx.companionManifest || `${card?.name || parentCtx.companionName || '동행자'} · 강신`;
    await playSummon(card);
    await playManifestCine(card);
    const actor = q('#manifestActor');
    if (actor) actor.classList.add('active');
    if (q('#manifestActorName')) q('#manifestActorName').textContent = `${card?.name || parentCtx.companionName || '동행자'} · 강신`;
    playSkillFx('manifest', 92 * (1 + ((card?.stage || 7) - 1) * .07), true, label, card);
    battle.busy = false;
    panRenderBattle(`<b>${label}</b> · 판이 최고조에 닿자 카드의 경계가 사라지고 동행자가 내려왔습니다.${auto ? ' 강신은 턴을 소모하지 않습니다.' : ''}`);
    return true;
  }

  async function panUseBattleSkill(kind, card = null) {
    if (!battle || battle.busy || battle.won || battle.lost) return;

    if (kind === 'manifest') {
      if (!parentCtx.companionManifested) return toast('최종현현을 마친 7성 동행 카드가 필요합니다.');
      if (battle.heat < HEAT_MAX) return toast('판의 기세가 아직 최고조에 닿지 않았습니다.');
      if (battle.manifestUsed) return toast('동행자는 이미 판에 내려와 있습니다.');
      battle.busy = true;
      panRenderBattle();
      await panManifest(card, false);
      return;
    }

    const intent = battleIntent();
    const won = kind === intent[2];
    const skill = activeSkill(card || {});
    const label = skill?.name || card?.skill || (kind === 'guard' ? '금기 수호진' : kind === 'break' ? '이면 흔적 파훼' : '기록 베기');
    const nums = panSkillNumbers(kind, card);
    const critical = !!card?.manifested || (kind !== 'guard' && battle.turn % 3 === 0);
    const damage = nums.damage * (critical ? 1.65 : 1);

    battle.busy = true;
    battle.lastCard = card?.id || null;
    battle.lastSkill = kind;
    battle.critical = critical;
    panRenderBattle();

    await panPlayClash(card, intent, won);

    let log = '';
    if (won) {
      // 합에서 이긴 쪽 기술만 남는다.
      battle.clashWins = Number(battle.clashWins || 0) + 1;
      battle.knotsRemaining = Math.max(0, battle.knotsRemaining - 1);
      panSetHeat(battle.heat + 1);
      battle.bossHp = Math.max(1, battle.bossHp - damage); // 호환용. 승리는 HP가 아니라 7매듭이다.
      if (nums.heal) battle.playerHp = Math.min(100, battle.playerHp + nums.heal);
      playSkillFx(kind, damage, critical, label, card);

      const call = q('#breakCallout');
      if (call) {
        call.textContent = '매듭 풀림';
        call.classList.remove('play'); void call.offsetWidth; call.classList.add('play');
        setTimeout(() => { call.classList.remove('play'); call.textContent = 'BREAK'; }, Math.round(900 * panTempoScale()));
      }
      log = `<b>${card?.name ? card.name + ' · ' : ''}${label}</b>이 <b>${intent[0]}</b>과 맞부딪혀 이겼습니다. 보스의 행동은 부서지고 매듭 하나가 풀렸습니다.`;

      // 최고조에 닿으면 7성 동행자는 자동으로 내려온다. 별도 턴을 먹지 않는다.
      if (battle.heat >= HEAT_MAX && parentCtx.companionManifested && !battle.manifestUsed) {
        await sleep(Math.round(260 * panTempoScale()));
        await panManifest(card, true);
        battle.busy = true; // 아래 턴 정리를 계속한다.
      }

      if (battle.knotsRemaining <= 0) {
        battle.bossHp = 0;
        return finishBattle(true, `${log} <b>일곱 매듭이 모두 풀렸습니다. 판이 결착됩니다.</b>`);
      }
    } else {
      // 합에서 진 기술은 부서진다. 플레이어 피해는 반복전부터 실제로 들어온다.
      battle.clashLosses = Number(battle.clashLosses || 0) + 1;
      panSetHeat(battle.heat - 1);
      const raw = intent[1] * (battle.knotsRemaining <= 3 ? 1.12 : 1);
      const enemyDamage = battle.firstEncounter ? 0 : Math.max(1, Math.round(raw));
      if (enemyDamage) battle.playerHp = Math.max(0, battle.playerHp - enemyDamage);
      log = `<b>${card?.name ? card.name + ' · ' : ''}${label}</b>이 합에서 밀려 부서졌습니다. <b>${intent[0]}</b>${battle.firstEncounter ? '은 첫 대면이라 공격하지 않고 판을 거두었습니다.' : `이 관통해 결계 피해 ${enemyDamage}.`} 매듭은 풀리지 않고 판의 기세가 식었습니다.`;
      if (battle.playerHp <= 0) return finishBattle(false, log);
    }

    battle.turn += 1;
    battle.busy = false;
    panSyncLegacy();
    panRenderBattle(log);
  }

  function panStartBossBattle() {
    const firstEncounter = !rstate().battle?.completed;
    original.startBossBattle();
    if (!battle) return;
    battle.knotsRemaining = KNOTS;
    battle.heat = panInitialHeat();
    battle.firstEncounter = firstEncounter;
    battle.manifestUsed = false;
    battle.clashWins = 0;
    battle.clashLosses = 0;
    panSyncLegacy();
    panEnsureUI();
    // 7성 동행자도 강신 전에는 카드 경계를 벗어나지 않는다.
    q('#manifestActor')?.classList.remove('active');
    panRenderBattle(firstEncounter
      ? `<b>${refs[current].boss.name}</b>과 처음 마주합니다. 이 대면에서 보스는 반격하지 않습니다. 기척을 읽고 맞는 수로 합을 이겨 매듭을 풀어보세요.`
      : `<b>${refs[current].boss.name}</b>과 판을 엽니다. 기척은 성격만 드러납니다. 맞는 수로 합을 이기면 매듭이 풀리고 판이 달아오릅니다.`);
  }

  function panFinishBattle(won, log) {
    original.finishBattle(won, log);
    if (!q('#battleResult')) return;
    if (won) {
      q('#battleResultTitle').textContent = `${refs[current].boss.name} · 일곱 매듭 해원`;
      q('#battleResultCopy').textContent = '보스의 체력을 소진한 것이 아니라, 합을 이겨 일곱 매듭을 모두 풀고 판을 결착했습니다. 지역보스 보상은 기존 규칙대로 회수됩니다.';
    } else {
      q('#battleResultTitle').textContent = '판이 식었습니다';
      q('#battleResultCopy').textContent = '정확한 기술명은 미리 보이지 않습니다. 기척의 성격을 읽고 카드의 역할을 골라 합을 이겨야 합니다.';
    }
  }

  // 전역 바인딩을 교체한다. 기존 UI 이벤트는 실행 시점에 이 함수를 참조한다.
  renderBattle = panRenderBattle;
  useBattleSkill = panUseBattleSkill;
  startBossBattle = panStartBossBattle;
  finishBattle = panFinishBattle;

  panEnsureUI();

  // 이미 보스전이 열린 상태에서 주입된 경우도 프로토타입 상태를 보강한다.
  if (typeof battle !== 'undefined' && battle && q('#battleShell')?.classList.contains('active')) {
    battle.knotsRemaining ??= KNOTS;
    battle.heat ??= panInitialHeat();
    battle.firstEncounter ??= !rstate().battle?.completed;
    battle.manifestUsed ??= false;
    q('#manifestActor')?.classList.remove('active');
    panRenderBattle('<b>판 시스템 v81</b>이 현재 전투에 적용되었습니다.');
  }

  window.hyPan = {
    version: PAN_VERSION,
    config: { knots: KNOTS, heatMax: HEAT_MAX, tempo: [...TEMPO], startHeat: { ...START_HEAT } },
    state: () => battle ? ({
      turn: battle.turn,
      knotsRemaining: battle.knotsRemaining,
      heat: battle.heat,
      firstEncounter: battle.firstEncounter,
      manifestUsed: battle.manifestUsed,
      wins: battle.clashWins || 0,
      losses: battle.clashLosses || 0
    }) : null,
    cue: panCue,
    original
  };

  console.info(`[흥양기] 판 보스전 시스템 v${PAN_VERSION} 적용`);
})();
