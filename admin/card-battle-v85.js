/* Card presentation only. The dungeon owns turns, seven knots, saves and rewards.
 * v90 — 재대면은 그림자극으로 그린다 (2026-10-15 결정). 무대는 shadow-stage-v90.js가 그리고, 여기서는 신호만 넘긴다.
 *   막이 없는 환경(스크립트 누락 등)에서는 v89 층 구도로 물러선다.
 * v89 — 재대면은 층 구도로 그린다 (2026-10-14 결정 D1·D3).
 *   먼 띠 → 안개 → 중간 띠 → 보스(정지) → 합 공간 → 가까운 띠 → 안개 → 아인(뒷모습) · 동행자 → HUD
 *   보스는 움직이지 않는다. 맞으면 명멸만 한다. 효과는 구운 아틀라스(burst·framebreak·rise·fog)만 쓴다.
 *   첫 대면(얼굴 없는 기척)은 v85 카드 화면 그대로. */
(() => {
  'use strict';
  const art = '../assets/';
  const L = art + 'battle-v89/';
  /* 지역별 무대 — feet: 보스 발끝 위치(배경 그림 높이 비율), grade: 여행 배경을 밤 톤으로 누르는 보정.
   * 녹동항 외 4곳은 전투 전용 배경이 오기 전까지 여행 배경을 임시로 쓴다. */
  const STAGE = {
    nokdong:  { feet: .64, grade: 'none' },
    yeoja:    { feet: .74, grade: 'brightness(.46) saturate(.55) contrast(1.08)' },
    palyoung: { feet: .74, grade: 'brightness(.44) saturate(.55) contrast(1.08)' },
    geogeum:  { feet: .76, grade: 'brightness(.46) saturate(.55) contrast(1.08)' },
    naro:     { feet: .72, grade: 'brightness(.46) saturate(.55) contrast(1.08)' }
  };
  /* 배경 제거가 깔끔하게 된 7성 동행자 최종 그림 (v89에 동봉). 없으면 동행자는 컷인으로만 나온다. */
  const COMPANION_CUTS = new Set(window.HY_COMPANION_CUTS || []);
  const POSE = { idle: 0, guard: 1, strike: 2, block: 3, hit: 4, break: 5, any: 3 };
  const FX = { burst: [art + 'fx/burst.webp', 22, 224, 224], brk: [art + 'fx/framebreak.webp', 20, 112, 176], rise: [art + 'fx/rise.webp', 20, 128, 256] };
  const backgrounds = {
    yeoja: 'travel-v78/yeojaman-golden-road.webp', nokdong: 'battle-v82/nokdong-arena.png',
    palyoung: 'travel-v78/palyoung-eight-peaks.webp', geogeum: 'travel-v78/geogeum-bridge-coast.webp',
    naro: 'travel-v78/naro-space-harbor.webp'
  };
  class CardBattle {
    constructor(root) {
      this.root = root;
      this.game = root.closest('#game');
      this.running = false;
      this.failed = [];
      this.routes = new Set();
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.board = document.createElement('div');
      this.board.className = 'cb-board';
      this.board.innerHTML = '<div class="cb-landscape"></div><article class="cb-boss" aria-label="보스 카드"><img alt=""><div class="cb-boss-footer"><small>남은 매듭</small><b class="cb-knots">7 / 7</b><div class="cb-progress"><i></i></div></div></article><article class="cb-resolve" aria-hidden="true"><img alt=""><div><small></small><b></b></div></article><output class="cb-verdict" aria-live="polite"></output><section class="cb-cutin" aria-hidden="true"><img alt=""><div><small>일곱 번째 기록 · 최종 현현</small><h2></h2><p></p></div></section>';
      root.prepend(this.board);
      this.stage = document.createElement('div');
      this.stage.className = 'cb-stage';
      this.stage.innerHTML = '<div class="cb-l far"><img alt=""></div><div class="cb-fog back"></div><div class="cb-l mid"><img alt=""></div><div class="cb-bossfig"><img alt=""></div><div class="cb-clash"></div><div class="cb-l near"><img alt=""></div><div class="cb-fog front"></div><div class="cb-ain"><img alt="아인"></div><div class="cb-companion"><img alt=""></div><div class="cb-fx"></div>';
      this.board.prepend(this.stage);
      this.shadow = window.HYShadowStage ? new window.HYShadowStage(this.stage) : null;
      this.ro = new ResizeObserver(() => this.layout());
      this.ro.observe(this.board);
      this.challenge = document.createElement('article');
      this.challenge.className = 'cb-challenge';
      this.challenge.innerHTML = '<small></small><b></b><p></p>';
      this.board.append(this.challenge);
      this.controls = document.createElement('div');
      this.controls.className = 'cb-controls';
      this.controls.innerHTML = '<button type="button" class="cb-motion" aria-pressed="false">연출 간소화</button><button type="button" class="cb-exit">메인으로</button>';
      root.append(this.controls);
      this.controls.querySelector('.cb-motion').onclick = () => {
        this.reduced = !this.reduced;
        this.updateMotion();
      };
      this.controls.querySelector('.cb-exit').onclick = () => {
        this.stop();
        document.querySelector('#home5').click();
      };
      this.observer = new MutationObserver(() => {
        if (this.running && (this.game.dataset.phase !== 'boss' || !root.classList.contains('active'))) this.stop();
      });
      this.observer.observe(this.game, { attributes: true, attributeFilter: ['data-phase'] });
      this.observer.observe(root, { attributes: true, attributeFilter: ['class'] });
      addEventListener('pagehide', () => this.stop());
      this.updateMotion();
    }
    query(s) { return this.board.querySelector(s); }
    /* 띠 세 장을 한 장의 그림처럼 맞춘다. 그림은 가로 106%로 깔고, 화면비가 달라도 띠의 상대 위치는 그대로 둔다. */
    layout() {
      if (!this.layered) return;
      const W = this.board.clientWidth, H = this.board.clientHeight; if (!W || !H) return;
      const imgW = W * 1.06, imgH = imgW * 1080 / 1920, top = (H - imgH) * .55;
      const place = (sel, y0) => { const e = this.query(sel); e.style.top = `${top + y0 * imgH}px`; e.style.width = `${imgW}px`; e.style.left = `${-(imgW - W) / 2}px`; };
      place('.cb-l.far', 0); place('.cb-l.mid', .30); place('.cb-l.near', .58);
      const cfg = STAGE[this.region] || STAGE.nokdong, feet = top + cfg.feet * imgH, bh = Math.min(H * .58, feet * .92);
      const boss = this.query('.cb-bossfig'); boss.style.height = `${bh}px`; boss.style.top = `${feet - bh}px`;
      this.bossBox = { x: W * .56, y: feet - bh * .62 };
    }
    pose(name) { const i = this.query('.cb-ain img'); const n = POSE[name] ?? 0; i.src = `${L}ain-${n}.webp`; }
    point(el) { const r = el.getBoundingClientRect(), b = this.board.getBoundingClientRect(); return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top }; }
    atlas([url, frames, fw, fh], x, y, scale, ms, layer = '.cb-fx') {
      const e = document.createElement('div'), w = fw * scale, h = fh * scale;
      e.className = 'cb-atlas';
      Object.assign(e.style, { width: `${w}px`, height: `${h}px`, left: `${x - w / 2}px`, top: `${y - h / 2}px`, backgroundImage: `url("${url}")`, backgroundSize: `${w * frames}px ${h}px` });
      this.query(layer).append(e);
      e.animate([{ backgroundPosition: '0 0' }, { backgroundPosition: `-${w * frames}px 0` }], { duration: ms, easing: `steps(${frames})` }).finished.then(() => e.remove(), () => e.remove());
    }
    flyCard(html, cls, from, to, ms, spin) {
      const e = document.createElement('div'); e.className = `cb-fly ${cls}`; e.innerHTML = html;
      e.style.left = `${from.x}px`; e.style.top = `${from.y}px`; this.query('.cb-clash').append(e);
      const a = e.animate([{ transform: 'translate(-50%,-50%) scale(.55)', opacity: .15 }, { transform: `translate(calc(-50% + ${(to.x - from.x) * .3}px), calc(-50% + ${(to.y - from.y) * .3 - 40}px)) scale(1)`, opacity: 1, offset: .35 }, { transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(.92) rotate(${spin}deg)`, opacity: 1 }], { duration: ms, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
      return { e, done: a.finished };
    }
    updateMotion() {
      this.game.classList.toggle('cb-reduced', this.reduced);
      if (this.shadow) this.shadow.reduced = this.reduced;
      const b = this.controls.querySelector('.cb-motion');
      b.setAttribute('aria-pressed', String(this.reduced));
      b.textContent = this.reduced ? '전체 연출' : '연출 간소화';
    }
    picture(node, url, alt) {
      node.hidden = !url;
      node.alt = alt || '';
      node.onerror = () => { this.failed.push(url); node.hidden = true; };
      if (url) node.src = url;
    }
    async start({ region, companion, heat, motion, firstEncounter }) {
      this.stop();
      this.region = region;
      this.companion = companion;
      this.manifested = false;
      this.failed = [];
      this.routes.clear();
      this.running = true;
      this.game.classList.add('card-battle-v85');
      this.game.classList.toggle('cb-first-encounter', !!firstEncounter);
      if (motion === false) this.reduced = true;
      this.updateMotion();
      this.query('.cb-landscape').style.backgroundImage = `url("${art}${backgrounds[region] || backgrounds.yeoja}")`;
      this.layered = !firstEncounter;
      this.game.classList.toggle('cb-layered', this.layered);
      this.game.classList.toggle('cb-shadow', this.layered && !!this.shadow);
      if (this.layered && this.shadow) {
        await this.shadow.start({ region, bossName: document.querySelector('#battleBossName')?.textContent || '보스', companionId: companion?.id, reduced: this.reduced });
        this.failed.push(...this.shadow.failed);
      } else if (this.layered) {
        const cfg = STAGE[region] || STAGE.nokdong;
        for (const band of ['far', 'mid', 'near']) { const img = this.query(`.cb-l.${band} img`); this.picture(img, `${L}${region}-${band}.webp`, ''); img.style.filter = cfg.grade; }
        this.picture(this.query('.cb-bossfig img'), `${L}boss-${region}.webp`, document.querySelector('#battleBossName')?.textContent || '보스');
        this.pose('idle');
        this.query('.cb-ain img').onerror = () => this.failed.push('ain');
        const comp = this.query('.cb-companion'); comp.classList.remove('on', 'mirror'); comp.querySelector('img').removeAttribute('src');
        requestAnimationFrame(() => this.layout());
      }
      this.picture(this.query('.cb-boss>img'), firstEncounter ? `${art}${backgrounds[region] || backgrounds.yeoja}` : `${art}journey_v42/${region}_boss.jpg`, firstEncounter ? '아직 모습을 드러내지 않은 지역의 기척' : document.querySelector('#battleBossName').textContent);
      this.sync({ heat, knots: 7 });
      return true;
    }
    sync({ heat, knots, won, lost, busy }) {
      if (Number.isFinite(knots)) {
        this.query('.cb-knots').textContent = `${knots} / 7`;
        this.query('.cb-progress i').style.width = `${knots / 7 * 100}%`;
      }
      this.heat = heat;
      if (this.layered && this.shadow?.running) this.shadow.sync(window.hyPan?.state?.());
      this.game.classList.toggle('cb-finished', !!(won || lost));
      this.controls.querySelector('.cb-exit').disabled = !!busy;
    }
    async animate(kind, ms, impact) {
      this.cancelAnimation();
      const id = this.sequence = (this.sequence || 0) + 1;
      const duration = this.reduced ? 180 : ms;
      this.root.dataset.cardAction = kind;
      this.board.style.setProperty('--cb-duration', `${duration}ms`);
      this.game.classList.add('cb-animating');
      this.query(kind === 'manifest' ? '.cb-cutin' : '.cb-resolve').setAttribute('aria-hidden', 'false');
      await new Promise(resolve => {
        this.pending = resolve;
        this.impactTimer = setTimeout(() => {
          if (id !== this.sequence || !this.running) return;
          impact?.();
        }, duration * .48);
        this.timer = setTimeout(() => this.cancelAnimation(), duration);
      });
    }
    cancelAnimation() {
      clearTimeout(this.timer);
      clearTimeout(this.impactTimer);
      this.sequence = (this.sequence || 0) + 1;
      delete this.root.dataset.cardAction;
      this.query('.cb-boss').classList.remove('cb-hit');
      this.query('.cb-verdict').classList.remove('show', 'critical');
      this.query('.cb-cutin').setAttribute('aria-hidden', 'true');
      this.query('.cb-resolve').setAttribute('aria-hidden', 'true');
      this.game.classList.remove('cb-animating');
      const resolve = this.pending;
      this.pending = null;
      resolve?.();
    }
    async play(args) {
      if (!this.running) return;
      this.routes.add(args.route);
      if (this.layered && this.shadow?.running) return this.playShadow(args);
      if (this.layered) return this.playLayered(args);
      return this.playCards(args);
    }
    /* v90 그림자극: 카드가 막으로 날아가 부딪친다. 판정 문구와 상태 표시는 카드 화면과 같은 자리를 쓴다(검수·접근성). */
    async playShadow({ card, won, critical, intent, challenge, strong, block, ms, kind, companionCard }) {
      const dur = this.reduced ? 300 : (ms || 1300);
      this.root.dataset.cardAction = won ? 'win' : 'lose';
      this.challenge.querySelector('small').textContent = strong ? '보스가 낸 카드 · 강수' : '보스가 낸 카드';
      this.challenge.querySelector('b').textContent = intent || '';
      this.challenge.querySelector('p').textContent = challenge || '';
      const btn = card && document.querySelector(`#skillGrid [data-card="${card.id}"]`);
      const b = this.board.getBoundingClientRect(), r = btn?.getBoundingClientRect();
      const from = r ? { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top } : null;
      const verdict = this.query('.cb-verdict');
      const shown = setTimeout(() => {
        verdict.textContent = block ? '버티기 · 피해 ⅓' : won ? (critical ? '강수 반격 · 매듭' : '받아치기 · 매듭') : '공격 관통 · 결계 피격';
        verdict.classList.toggle('critical', won && !!critical); verdict.classList.add('show');
      }, dur * .4);
      await this.shadow.clash({ won, kind, block, companionCard, cardImg: block ? null : (card?.img || null), from, ms: dur });
      clearTimeout(shown); verdict.classList.remove('show', 'critical');
      delete this.root.dataset.cardAction;
    }
    async playLayered({ card, skill, won, critical, intent, challenge, strong, block, ms, kind, companionCard }) {
      const dur = this.reduced ? 260 : (ms || 1300);
      /* 카드 화면과 같은 상태 표시를 남긴다 (검수·접근성: 보스가 낸 수의 이름과 종류) */
      this.root.dataset.cardAction = won ? 'win' : 'lose';
      this.challenge.querySelector('small').textContent = strong ? '보스가 낸 카드 · 강수' : '보스가 낸 카드';
      this.challenge.querySelector('b').textContent = intent || '';
      this.challenge.querySelector('p').textContent = challenge || '';
      const W = this.board.clientWidth, H = this.board.clientHeight;
      const meet = { x: W * .39, y: H * .42 }, boss = this.bossBox || { x: W * .56, y: H * .32 }, ain = this.point(this.query('.cb-ain img'));
      const btn = card && document.querySelector(`#skillGrid [data-card="${card.id}"]`);
      const from = btn ? this.point(btn) : { x: ain.x, y: ain.y - H * .1 };
      this.pose(block ? 'block' : companionCard ? 'any' : ({ strike: 'strike', guard: 'guard', break: 'break' }[kind] || 'strike'));
      const comp = this.query('.cb-companion'), compImg = comp.querySelector('img'), compIdle = compImg.getAttribute('src');
      if (companionCard && this.companionCast) { compImg.src = this.companionCast; comp.classList.remove('cb-cast'); void comp.offsetWidth; comp.classList.add('cb-cast'); }
      const mine = this.flyCard(block ? '<b>버티기</b>' : `<img src="${card?.img || ''}" alt=""><b>${skill || ''}</b>`, block ? 'block' : 'mine', from, { x: meet.x - W * .035, y: meet.y }, dur * .45, -8);
      const theirs = this.flyCard(`<small>${strong ? '강수' : (challenge || '')}</small><b>${intent || ''}</b>`, 'theirs', boss, { x: meet.x + W * .035, y: meet.y }, dur * .45, 8);
      await Promise.all([mine.done, theirs.done]);
      if (!this.running) return;
      /* 접촉 — 모든 연출을 이 한 순간에 쓴다 */
      this.atlas(FX.burst, meet.x, meet.y, (H / 900) * (1.4 + (dur > 1100 ? .5 : 0)), this.reduced ? 200 : 820);
      this.board.classList.remove('cb-shake'); void this.board.offsetWidth; this.board.classList.add('cb-shake');
      const verdict = this.query('.cb-verdict');
      verdict.textContent = block ? '버티기 · 피해 ⅓' : won ? (critical ? '강수 반격 · 매듭' : '받아치기 · 매듭') : '공격 관통 · 결계 피격';
      verdict.classList.toggle('critical', won && !!critical); verdict.classList.add('show');
      const loser = won ? theirs.e : mine.e, winner = won ? mine.e : theirs.e;
      const lp = this.point(loser);
      this.atlas(FX.brk, lp.x, lp.y, H / 900 * 1.2, this.reduced ? 160 : 560); loser.remove();
      const target = won ? boss : ain, wp = this.point(winner);
      await winner.animate([{ transform: 'translate(-50%,-50%) scale(.92)', left: `${wp.x}px`, top: `${wp.y}px` }, { transform: 'translate(-50%,-50%) scale(.45)', left: `${target.x}px`, top: `${target.y}px`, opacity: .2 }], { duration: dur * .22, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
      winner.remove();
      if (won) {
        const f = this.query('.cb-bossfig'); f.classList.remove('cb-flicker'); void f.offsetWidth; f.classList.add('cb-flicker');
        this.atlas(FX.burst, boss.x, boss.y, H / 900, this.reduced ? 160 : 600);
      } else {
        this.pose('hit'); const a = this.query('.cb-ain'); a.classList.remove('cb-recoil'); void a.offsetWidth; a.classList.add('cb-recoil');
      }
      await new Promise(r => setTimeout(r, dur * .33));
      verdict.classList.remove('show', 'critical');
      if (companionCard && compIdle) compImg.src = compIdle;
      delete this.root.dataset.cardAction;
      if (this.running) this.pose('idle');
    }
    async playCards({ card, skill, route, won, critical, intent, response, firstEncounter, challenge, strong, block, ms }) {
      this.picture(this.query('.cb-resolve>img'), card?.img, card?.name || '아인');
      this.query('.cb-resolve small').textContent = card?.name || '아인 · 현장 대응';
      this.query('.cb-resolve b').textContent = skill || '기록의 수';
      this.challenge.querySelector('small').textContent = firstEncounter ? '단서 제시' : strong ? '보스가 낸 카드 · 강수' : '보스가 낸 카드';
      this.challenge.querySelector('b').textContent = firstEncounter ? '얼굴 없는 기척' : intent;
      this.challenge.querySelector('p').textContent = challenge != null ? challenge : ({strike:'기록으로 흔적에 맞서기',guard:'수호로 경계 지키기',break:'파훼로 흐름 끊기'}[response] || '기척에 대응하기');
      await this.animate(won ? 'win' : 'lose', ms || 1300, () => {
        this.query('.cb-boss').classList.toggle('cb-hit', won);
        const verdict = this.query('.cb-verdict');
        verdict.textContent = firstEncounter ? (won ? '단서 해석 · 매듭 −1' : '단서 미해석 · 다시 관찰') : block ? '버티기 · 피해 ⅓' : won ? (critical ? '강수 반격 · 매듭' : '받아치기 · 매듭') : '공격 관통 · 결계 피격';
        verdict.classList.toggle('critical', won && !!critical);
        verdict.classList.add('show');
      });
    }
    async manifest(card, label) {
      if (!this.running) return;
      this.manifested = true;
      this.picture(this.query('.cb-cutin>img'), card?.finalImg || card?.img, card?.name);
      this.query('.cb-cutin h2').textContent = card?.name || '현현 동행';
      this.query('.cb-cutin p').textContent = label || '일곱 별 현현';
      await this.animate('manifest', 1900);
      if (this.layered && this.shadow?.running) { this.shadow.descend(card?.id); return; }
      if (this.layered && this.running) {
        const id = String(card?.id || '').toUpperCase(), c = this.query('.cb-companion'), img = c.querySelector('img');
        const src = id === 'C075' ? `${L}dang-0.webp` : COMPANION_CUTS.has(id) ? `${L}companions/${id}.webp` : null;
        if (src) {
          this.picture(img, src, card?.name || '동행자'); c.classList.toggle('mirror', false); c.classList.add('on');
          const p = this.point(c); this.atlas(FX.rise, p.x, p.y, this.board.clientHeight / 900 * 2.2, this.reduced ? 200 : 1300);
        }
        this.companionCast = id === 'C075' ? `${L}dang-2.webp` : src;
      }
    }
    stop() {
      this.running = false;
      this.cancelAnimation();
      this.shadow?.stop();
      this.game.classList.remove('card-battle-v85', 'cb-finished', 'cb-first-encounter', 'cb-layered', 'cb-shadow');
      this.query('.cb-clash').innerHTML = ''; this.query('.cb-fx').innerHTML = '';
    }
    diagnostics() {
      const sh = this.layered && this.shadow?.running ? this.shadow.diagnostics() : null;
      return { version: '90.1.0', running: this.running, region: this.region, failed: [...this.failed],
        manifested: this.manifested, routes: [...this.routes], reduced: this.reduced, presentation: sh ? 'shadow' : this.layered ? 'layered' : 'cards',
        companionOnField: sh ? this.shadow.rv('comp') > .5 : !!this.query('.cb-companion.on'), shadow: sh ? { ...sh, companionShadow: this.shadow.companionShadow } : null };
    }
  }
  window.HYBattleDirector = CardBattle;
})();
