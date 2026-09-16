/* Card presentation only. The dungeon owns turns, seven knots, saves and rewards. */
(() => {
  'use strict';
  const art = '../assets/';
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
    updateMotion() {
      this.game.classList.toggle('cb-reduced', this.reduced);
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
    async play({ card, skill, route, won, critical, intent, response, firstEncounter }) {
      if (!this.running) return;
      this.routes.add(route);
      this.picture(this.query('.cb-resolve>img'), card?.img, card?.name || '아인');
      this.query('.cb-resolve small').textContent = card?.name || '아인 · 현장 대응';
      this.query('.cb-resolve b').textContent = skill || '기록의 수';
      this.challenge.querySelector('small').textContent = firstEncounter ? '단서 제시' : '보스가 낸 카드';
      this.challenge.querySelector('b').textContent = firstEncounter ? '얼굴 없는 기척' : intent;
      this.challenge.querySelector('p').textContent = {strike:'기록으로 흔적에 맞서기',guard:'수호로 경계 지키기',break:'파훼로 흐름 끊기'}[response] || '기척에 대응하기';
      await this.animate(won ? 'win' : 'lose', 1300, () => {
        this.query('.cb-boss').classList.toggle('cb-hit', won);
        const verdict = this.query('.cb-verdict');
        verdict.textContent = firstEncounter ? (won ? '단서 해석 · 매듭 −1' : '단서 미해석 · 다시 관찰') : won ? (critical ? '치명 반격 · 매듭 −1' : '받아치기 · 매듭 −1') : '공격 관통 · 결계 피격';
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
    }
    stop() {
      this.running = false;
      this.cancelAnimation();
      this.game.classList.remove('card-battle-v85', 'cb-finished', 'cb-first-encounter');
    }
    diagnostics() {
      return { version: '85.0.0', running: this.running, region: this.region, failed: [...this.failed],
        manifested: this.manifested, routes: [...this.routes], reduced: this.reduced, presentation: 'cards' };
    }
  }
  window.HYBattleDirector = CardBattle;
})();
