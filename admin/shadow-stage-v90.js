/* v90 — 재대면 보스전 그림자극 무대 (2026-10-15 결정).
 * 보스는 막 너머의 그림자로만 있다. 아인도 앞쪽 등에 비친 그림자로 같은 막에 선다(그림자 대 그림자).
 * 빛 규칙: 빛~막 거리를 1로 두면, 빛에서 d만큼 떨어진 인물의 그림자는 크기 1/d, 번짐 S·(1−d)/d.
 * 지역 변주: 녹동항 = 창호 미닫이, 나로도 = 오방색 두 등, 나머지 = 삼베 휘장.
 * 결계는 막 아래 등잔 일곱 개로 보인다. 효과는 구운 그림(아틀라스·질감)만 쓰고 프레임마다 셰이더를 돌리지 않는다. */
(() => {
  'use strict';
  const A = '../assets/battle-v90/', P = '../assets/battle-v89/';
  const W = 1600, H = 900;
  const ATLAS = { 'fx-gold':[20,256,256], 'fx-shock':[16,256,256], 'fx-dark':[20,256,256] };
  const WORD_KIND = { '힘':'strike', '부름':'guard', '환영':'break' };
  const POSE = { strike:2, guard:1, break:0 };
  const AIN = { idle:0, ready:1, strike:2, block:3, guard:4, break:5, any:3 };
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  class ShadowStage {
    constructor(host) {
      this.host = host;
      this.cv = document.createElement('canvas'); this.cv.className = 'sh-canvas'; this.cv.setAttribute('aria-hidden', 'true');
      host.append(this.cv);
      this.ctx = this.cv.getContext('2d');
      this.back = document.createElement('canvas'); this.back.width = 800; this.back.height = 450; this.bctx = this.back.getContext('2d');
      this.tmp = document.createElement('canvas'); this.tmp.width = 800; this.tmp.height = 450; this.tctx = this.tmp.getContext('2d');
      this.img = {}; this.cache = {}; this.failed = []; this.running = false; this.frames = 0;
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host);
    }
    /* ── 그림 불러오기 ── */
    load(map) {
      return Promise.all(Object.entries(map).map(([k, src]) => this.img[k] ? null : new Promise(r => { const i = new Image(); i.onload = () => { this.img[k] = i; r(); }; i.onerror = () => { this.failed.push(src); r(); }; i.src = src; })));
    }
    resize() {
      const r = this.host.getBoundingClientRect(); if (!r.width || !r.height) return;
      const dpr = Math.min(1.25, devicePixelRatio || 1);
      this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
      this.scale = Math.max(r.width / W, r.height / H) * dpr; // 무대를 덮도록(cover)
      this.offX = (this.cv.width - W * this.scale) / 2; this.offY = (this.cv.height - H * this.scale) / 2;
      this.dpr = dpr;
    }
    toStage(px, py) { return { x: (px * this.dpr - this.offX) / this.scale, y: (py * this.dpr - this.offY) / this.scale }; }
    async start({ region, bossName, companionId, reduced }) {
      this.stop();
      this.region = region; this.bossName = bossName; this.reduced = !!reduced;
      this.variant = region === 'nokdong' ? 'lattice' : region === 'naro' ? 'lamps' : 'duel';
      this.companionShadow = String(companionId || '').toUpperCase() === 'C075' ? 'dang-5' : null;
      const map = {
        hemp0:A + 'hemp0.webp', hemp1:A + 'hemp1.webp', hanji0:A + 'hanji0.webp', hanji1:A + 'hanji1.webp', lattice:A + 'lattice.webp',
        jj0:A + 'jj0.webp', jj1:A + 'jj1.webp', jj3:A + 'jj3.webp', jj4:A + 'jj4.webp', grain:A + 'grain.webp',
        'glow-warm':A + 'glow-warm.webp', 'glow-cold':A + 'glow-cold.webp', 'glow-red':A + 'glow-red.webp', ember:A + 'ember.webp',
        'fx-gold':A + 'fx-gold.webp', 'fx-dark':A + 'fx-dark.webp', 'fx-shock':A + 'fx-shock.webp',
        rope:A + 'rope.webp', knot:A + 'knot.webp', tassel:A + 'tassel.webp', candle:A + 'candle.webp', shadow:A + 'shadow.webp', fog:P + 'fog.webp',
        b0:`${A}shade-${region}-0.webp`, b1:`${A}shade-${region}-1.webp`, b2:`${A}shade-${region}-2.webp`,
        face: region === 'yeoja' ? A + 'face-yeoja.webp' : `${P}boss-${region}.webp`
      };
      for (let i = 0; i < 6; i++) map['ain' + i] = `${P}ain-${i}.webp`;
      map['dang-5'] = P + 'dang-5.webp';
      for (const k of ['b0', 'b1', 'b2', 'face']) { delete this.img[k]; }
      for (const key in this.cache) if (/^b[012]|face/.test(key)) delete this.cache[key];
      await this.load(map);
      this.T = {}; this.fx = []; this.parts = []; this.drops = []; this.holes = []; this.flying = null;
      this.st = 0; this.stop_ = 0; this.trauma = 0; this.flash = 0; this.zoom = 1;
      this.knots = 7; this.hp = 100; this.intentName = null; this.pose = 'b0'; this.alt = null; this.ain = 'ain0';
      this.done = null;
      const base = this.variant === 'lattice' ? .86 : .8;
      for (const [k, v] of Object.entries({ d:base, split:0, ripple:0, press:0, cold:0, lift:0, face:0, candle:1, gone:0, comp:0, aD:.85, red:1, blue:1, apart:.35, rattle:0, pung:0, open:0, eye:0 })) this.set(k, v);
      for (let i = 0; i < 7; i++) this.set('L' + i, 1);
      this.resize(); this.running = true; this.last = performance.now();
      cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(t => this.loop(t));
      return true;
    }
    stop() { this.running = false; cancelAnimationFrame(this.raf); }
    /* 램프 값 */
    set(k, v) { this.T[k] = { v, to:v, sp:2 }; }
    ramp(k, to, sp = 2) { const r = this.T[k] || (this.T[k] = { v:to, to, sp }); r.to = to; r.sp = sp; }
    rv(k) { return this.T[k] ? this.T[k].v : 0; }
    flick(s) { const t = this.st; return .84 + .09 * Math.sin(t * 9.1 + s) + .05 * Math.sin(t * 23.7 + s * 2) + .04 * Math.sin(t * 3.3 + s); }
    tinted(key, color, blur = 0) {
      const id = key + color + blur; if (this.cache[id]) return this.cache[id]; const im = this.img[key]; if (!im) return null;
      const pad = blur * 3, c = document.createElement('canvas'); c.width = im.width + pad * 2; c.height = im.height + pad * 2;
      const g = c.getContext('2d'); if (blur) g.filter = `blur(${blur}px)`;
      const t = document.createElement('canvas'); t.width = im.width; t.height = im.height; const tg = t.getContext('2d');
      tg.drawImage(im, 0, 0); tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = color; tg.fillRect(0, 0, im.width, im.height);
      g.drawImage(t, pad, pad); c.pad = pad; return this.cache[id] = c;
    }
    lightSprite(color) {
      const id = 'L' + color; if (this.cache[id]) return this.cache[id];
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, `rgba(${color},1)`); gr.addColorStop(.35, `rgba(${color},.55)`); gr.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return this.cache[id] = c;
    }
    glow(key, x, y, w, h, a) { const im = this.img[key]; if (!im || a <= 0) return; const c = this.ctx; c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, a); c.drawImage(im, x - w / 2, y - h / 2, w, h); c.restore(); }
    shade(a, x = 0, y = 0, w = W, h = H, col = '2,3,6') { if (a <= 0) return; this.ctx.fillStyle = `rgba(${col},${a})`; this.ctx.fillRect(x, y, w, h); }
    vgrad(y0, y1, a0, a1, col = '0,0,0') { const c = this.ctx, g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, `rgba(${col},${a0})`); g.addColorStop(1, `rgba(${col},${a1})`); c.fillStyle = g; c.fillRect(-100, y0, W + 200, y1 - y0); }

    /* ── 빛과 그림자: 막 뒤를 반 해상도에 굽는다 ── */
    cast(lights, figs, ambient) {
      const b = this.bctx, k = .5, BL = [0, 3, 7, 13, 22];
      b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over'; b.globalAlpha = 1; b.fillStyle = ambient; b.fillRect(0, 0, 800, 450);
      for (const Lt of lights) {
        if (Lt.i <= .01) continue;
        const t = this.tctx; t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1; t.clearRect(0, 0, 800, 450);
        t.globalAlpha = Math.min(1, Lt.i); t.drawImage(this.lightSprite(Lt.c), (Lt.x - Lt.r) * k, (Lt.y - Lt.r) * k, Lt.r * 2 * k, Lt.r * 2 * k);
        for (const F of figs) {
          const im = this.img[F.key]; if (!im || F.a <= .01) continue;
          const s = 1 / F.d, blur = (Lt.S || 6) * (1 - F.d) / F.d * k;
          const h = F.h * s, w = h * im.width / im.height, cx = Lt.x + (F.x - Lt.x) * s, fy = Lt.y + (F.feet - Lt.y) * s;
          let bi = 0; while (bi < BL.length - 1 && BL[bi + 1] <= blur) bi++;
          const c = this.tinted(F.key, '#000', this.reduced ? 0 : BL[bi]), p = c.pad * (w * k) / im.width;
          t.globalCompositeOperation = 'destination-out'; t.globalAlpha = F.a;
          t.drawImage(c, (cx - w / 2) * k - p, (fy - h) * k - p, w * k + 2 * p, h * k + 2 * p);
        }
        b.globalCompositeOperation = 'lighter'; b.drawImage(this.tmp, 0, 0);
      }
      b.globalCompositeOperation = 'source-over';
    }
    screen(o) {
      const c = this.ctx, st = this.st;
      const { x0, y0, w, h, panels = 7, tex = ['hemp0', 'hemp1'], N = 12, wave = this.reduced ? 0 : 1, ripple = 0, press = 0, rigid = false, tint = '#ffae70', tintA = .5, glowA = .35, lift = 0, shakeX = 0 } = o;
      const pw = w / panels, sw = pw / N, bottom = y0 + h - lift;
      for (let p = 0; p < panels; p++) {
        const d = this.drops.find(d => d.p === p), off = d ? d.t : 0; if (off >= 1.6) continue;
        const fall = off * off * 520, rot = off * (p < panels / 2 ? -.18 : .18), T = this.img[tex[p % tex.length]];
        for (let s = 0; s < N; s++) {
          const gx = x0 + p * pw + s * sw, cxn = (gx + sw / 2 - 800) / 800;
          const wv = rigid ? 0 : (Math.sin(st * 1.1 + gx * .012) * 6 + Math.sin(st * 2.3 + gx * .03) * 2) * wave;
          const rp = ripple * Math.sin(st * 6 - Math.abs(cxn) * 18) * 10 * Math.exp(-Math.abs(cxn) * 2);
          const bulge = press * Math.exp(-(cxn * cxn) * 9);
          const dy = (rigid ? 0 : Math.sin(st * .9 + gx * .02) * 4 * wave) + fall + bulge * 18;
          const dx = gx + wv + rp + (gx - 800) * bulge * .04 + shakeX, top = y0 + dy, hh = (bottom - y0) * (1 + bulge * .03);
          c.save();
          if (rot) { c.translate(dx + sw / 2, top); c.rotate(rot * (s / N)); c.translate(-(dx + sw / 2), -top); }
          const al = clamp(1.6 - off, 0, 1);
          c.globalAlpha = al; c.drawImage(this.back, gx * .5, y0 * .5, sw * .5, (bottom - y0) * .5, dx, top, sw + 1, hh);
          if (T) { c.globalCompositeOperation = 'multiply'; c.drawImage(T, s * T.width / N, 0, T.width / N, T.height, dx, top, sw + 1, hh); }
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = al * glowA; c.drawImage(this.back, gx * .5, y0 * .5, sw * .5, (bottom - y0) * .5, dx, top, sw + 1, hh);
          c.globalCompositeOperation = 'source-over';
          if (!rigid && wave) { c.globalAlpha = al * (.08 + .08 * Math.sin(st * 1.1 + gx * .012 + 1.6)); c.fillStyle = '#000'; c.fillRect(dx, top, sw + 1, hh); }
          c.restore();
        }
        if (panels > 1 && !rigid) { c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(x0 + p * pw - 1, y0, 2, h + fall); }
      }
      if (tint) { c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = tint; c.globalAlpha = tintA; c.fillRect(x0 - 20, y0, w + 40, bottom - y0); c.restore(); }
      for (const d of this.drops) { if (d.t < .5) continue; const gx = x0 + d.p * pw; c.save(); c.globalAlpha = clamp((d.t - .5) * 1.5, 0, 1) * .9; c.drawImage(this.back, gx * .5, y0 * .5, pw * .5, h * .5, gx, y0, pw, h); c.restore(); }
    }
    /* 앞(관객 쪽) 등에 비친 그림자: 아인·동행자. 막 앞면에 찬빛 그늘로 곱한다. */
    front(key, cx, feet, h, d, a) {
      const im = this.img[key]; if (!im || a <= .01) return;
      const s = 1 / d, hh = h * s, ww = hh * im.width / im.height, lx = 300, ly = 900;
      const x = lx + (cx - lx) * s, y = ly + (feet - ly) * s, bl = this.reduced ? 0 : Math.min(22, Math.round(10 * (1 - d) / d));
      const cnv = this.tinted(key, '#0a1424', bl), p = cnv.pad * ww / im.width, c = this.ctx;
      c.save(); c.globalCompositeOperation = 'multiply'; c.globalAlpha = a; c.drawImage(cnv, x - ww / 2 - p, y - hh - p, ww + 2 * p, hh + 2 * p); c.restore();
    }
    knotRow(x0, x1, y, scale = 1) {
      const c = this.ctx, rope = this.img.rope; if (!rope) return;
      c.drawImage(rope, x0 - 40, y - 15 * scale, x1 - x0 + 80, 30 * scale);
      for (let i = 0; i < 7; i++) {
        if (i < 7 - this.knots) continue;
        const x = lerp(x0, x1, i / 6), sway = Math.sin(this.st * 1.2 + i * .7) * .03;
        c.save(); c.translate(x, y + 12 * scale); c.rotate(sway); c.drawImage(this.img.tassel, -11 * scale, 0, 22 * scale, 78 * scale); c.restore();
        c.drawImage(this.img.knot, x - 24 * scale, y - 22 * scale, 48 * scale, 48 * scale);
      }
    }
    /* 결계 = 막 아래 등잔 일곱 */
    lamps(y = 862) {
      const c = this.ctx, lit = Math.ceil(clamp(this.hp, 0, 100) / 100 * 7);
      for (let i = 0; i < 7; i++) {
        const x = 260 + i * 180; this.ramp('L' + i, i < lit ? 1 : 0, 2.5);
        const v = this.rv('L' + i); c.fillStyle = '#2a1a0e'; c.fillRect(x - 16, y - 6, 32, 9);
        if (v > .02) { const f = v * this.flick(i * 1.7); this.glow('glow-warm', x, y - 20, 36 * f, 54 * f, f); this.glow('glow-warm', x, y - 12, 200 * f, 80 * f, .35 * f); }
      }
    }
    jijeon(side, strength = 1, wind = 0) {
      const c = this.ctx, keys = ['jj0', 'jj1', 'jj3', 'jj4'];
      for (let i = 0; i < 3; i++) {
        const key = keys[(i + (side > 0 ? 2 : 0)) % 4], im = this.img[key]; if (!im) continue;
        const x = side < 0 ? 18 + i * 46 : W - 18 - i * 46, len = 520 + (i % 2) * 120, w = 66;
        const ang = (Math.sin(this.st * (1.1 + i * .23) + i * 2) * .035 + wind * .25) * strength;
        const bl = this.tinted(key, 'rgba(0,0,0,0)', 0), dk = this.tinted(key, '#07080c', this.reduced ? 0 : 5), p = dk.pad * w / im.width;
        c.save(); c.translate(x, -20 - (i % 2) * 30); c.rotate(ang); c.globalAlpha = .85; c.drawImage(im, -w / 2, 0, w, len); c.globalAlpha = .5 + i * .12; c.drawImage(dk, -w / 2 - p, -p, w + 2 * p, len + 2 * p); c.restore();
      }
    }
    candle(x, base, s, seed) {
      const c = this.ctx, im = this.img.candle; if (!im) return; const w = im.width * s, h = im.height * s, cl = this.rv('candle');
      c.drawImage(this.img.shadow, x - w * 1.3, base - 10, w * 2.6, 22); c.drawImage(im, x - w / 2, base - h, w, h);
      const f = cl * this.flick(seed); this.glow('glow-warm', x, base - h + 4 * s, 120 * s * f, 210 * s * f, f); this.glow('glow-warm', x, base - h + 8 * s, 40 * s * f, 90 * s * f, f * 1.2); this.glow('glow-warm', x, base - 30, 900 * s, 420 * s, .25 * f);
    }
    fog(a) { const c = this.ctx, im = this.tinted('fog', 'rgba(255,214,160,1)'); if (!im || this.reduced) return; for (let k = 0; k < 2; k++) { const off = (this.st * (10 + k * 7)) % 2400; c.save(); c.globalAlpha = a; c.drawImage(im, -off, 520 + k * 120, 2400, 300); c.drawImage(im, 2400 - off, 520 + k * 120, 2400, 300); c.restore(); } }
    faceReveal(fa) {
      if (fa <= .01) return; const c = this.ctx, im = this.img.face; if (!im) return;
      this.glow('glow-red', 800, 520, 1100, 900, .35 * fa);
      const h = 860, w = h * im.width / im.height; c.save(); c.globalAlpha = fa; c.drawImage(im, 800 - w / 2, 110 + (1 - fa) * 40, w, h); c.restore(); this.vgrad(620, 900, 0, 1);
    }
    bossPose() { return this.alt ? (Math.floor(this.st * 1.6) % 2 ? this.pose : 'b' + POSE[this.alt]) : this.pose; }

    /* ── 판에서 오는 신호 ── */
    sync(s) {
      if (!this.running || !s) return;
      if (s.intent && s.intent.name !== this.intentName && !s.won && !s.lost) { this.intentName = s.intent.name; this.telegraph(s.intent); }
      if (Number.isFinite(s.knotsRemaining)) { while (this.knots > s.knotsRemaining) { this.knots--; this.untie(6 - this.knots); } }
      if (Number.isFinite(s.playerHp)) { if (s.playerHp < this.hp - .5) this.hurt(); this.hp = s.playerHp; }
      if (s.won && !this.done) { this.done = 'won'; this.finale(); }
      if (s.lost && !this.done) { this.done = 'lost'; this.defeat(); }
    }
    telegraph(m) {
      const kind = m.kind; this.pose = 'b' + (POSE[kind] ?? 0);
      const words = String(m.label || '').replace('?', '').split('또는').map(w => WORD_KIND[w.trim()]).filter(Boolean);
      this.alt = !m.recorded && words.length === 2 ? words.find(w => w !== kind) || null : null;
      this.ain = 'ain' + AIN.ready;
      const v = this.variant;
      if (v === 'lattice') { this.ramp('d', kind === 'strike' ? .97 : .82, 1.5); this.ramp('rattle', kind === 'strike' ? 1 : 0, 2); this.ramp('pung', kind === 'guard' ? 1 : 0, 2); this.ramp('split', kind === 'break' ? 1 : 0, 1.4); }
      else if (v === 'lamps') { this.ramp('red', kind === 'strike' ? 1.6 : .9, 1.5); this.ramp('blue', kind === 'guard' ? 1.6 : .9, 1.5); this.ramp('apart', kind === 'break' ? 1 : .35, 1.2); this.ramp('d', kind === 'strike' ? .64 : .8, 1.3); this.ramp('ripple', kind === 'guard' ? .6 : 0, 2); }
      else { this.ramp('d', kind === 'strike' ? .62 : .8, 1.3); this.ramp('ripple', kind === 'guard' ? 1 : 0, 2); this.ramp('press', kind === 'strike' ? .6 : 0, 1.5); this.ramp('split', kind === 'break' ? 1 : 0, 1.4); }
    }
    settle() { for (const k of ['split', 'ripple', 'press', 'rattle', 'pung']) this.ramp(k, 0); this.ramp('red', 1); this.ramp('blue', 1); this.ramp('apart', .35); this.ramp('d', this.variant === 'lattice' ? .86 : .82, 1.2); this.ramp('aD', .85, 1.5); this.ain = 'ain' + AIN.idle; this.flying = null; }
    async clash({ won, kind, block, companionCard, cardImg, from, ms = 1300 }) {
      if (!this.running) return;
      const dur = this.reduced ? 300 : ms;
      this.ain = 'ain' + (block ? AIN.block : companionCard ? AIN.any : AIN[kind] ?? AIN.strike);
      if (!block) this.ramp('aD', .62, 4);
      let card = null;
      if (cardImg) { card = this.cache['card' + cardImg]; if (!card) { card = new Image(); card.src = cardImg; this.cache['card' + cardImg] = card; } }
      const f = from ? this.toStage(from.x, from.y) : { x:800, y:900 };
      this.flying = { img:card, x0:f.x, y0:f.y, x1:this.variant === 'lattice' ? 800 : 820, y1:460, t:0, ms:dur * .4, burn:0, dark:0 };
      await sleep(dur * .4); if (!this.running) return;
      this.stop_ = this.reduced ? 0 : .13; this.zoom = 1.07; this.trauma = Math.min(1, this.trauma + (won ? .35 : .6));
      this.atlas(won ? 'fx-gold' : 'fx-dark', 810, 450, won ? 480 : 540, 900, won, .9);
      this.flash = won ? .24 : .3; this.flashC = won ? '#ffd9a0' : '#0a1220';
      if (won) { if (this.flying) this.flying.burnT = 1; this.ramp('d', .92, 2.5); this.ramp('press', 0, 3); }
      else { if (this.flying) this.flying.dark = 1; setTimeout(() => { if (this.flying) this.flying.burnT = 1; }, 300); this.ramp('d', .52, 3); this.ramp('aD', .95, 3); if (this.variant === 'lattice') this.ramp('rattle', 1.6, 6); }
      await sleep(dur * .6);
      this.settle();
    }
    untie(i) {
      const order = [3, 2, 4, 1, 5, 0, 6], p = order[clamp(i, 0, 6)];
      if (this.variant === 'lattice') { const panes = [[2, 4], [5, 3], [1, 6], [6, 2], [3, 1], [0, 5], [4, 7]]; const [cc, r] = panes[clamp(i, 0, 6)]; this.holes.push({ c:cc, r, t:this.st }); const pr = this.paneRect(cc, r); for (let n = 0; n < 14; n++) this.ember(pr.x + Math.random() * pr.w, pr.y + pr.h / 2, 10); }
      else { this.drops.push({ p, t:0 }); for (let n = 0; n < 14; n++) this.ember(241 + p * 223 + (Math.random() - .5) * 200, 120 + Math.random() * 600); }
      const x = this.variant === 'lattice' ? 400 + i * 133 : 241 + p * 223;
      this.parts.push({ type:'fall', x, y:this.variant === 'lattice' ? 22 : 46, vx:(Math.random() - .5) * 60, vy:-60, rot:0, vr:(Math.random() - .5) * 3, life:2.4 });
      this.atlas('fx-shock', x, this.variant === 'lattice' ? 22 : 46, 190, 600);
    }
    hurt() { this.ramp('candle', clamp(.35 + .65 * this.hp / 100, .2, 1), 3); }
    /* 강신: 내려온 카드로 동행 그림자를 정한다(시작 때 동행 정보가 없을 수도 있다). 해신 당골만 전용 실루엣이 있다. */
    async descend(cardId) {
      if (!this.running) return;
      if (String(cardId || '').toUpperCase() === 'C075') this.companionShadow = 'dang-5';
      this.ramp('cold', 1, 1.2); this.ramp('comp', 1, 1.2); this.ramp('d', .95, 1.2); this.flash = .35; this.flashC = '#cfeaff';
    }
    async finale() { this.ramp('gone', 1, .9); this.ramp('open', 1, .7); this.atlas('fx-gold', 800, 420, 1000, 1400); this.flash = .25; this.flashC = '#ffe6b8'; this.ain = 'ain' + AIN.break; }
    async defeat() { this.ramp('candle', .05, 1.5); this.ramp('d', .45, 2); await sleep(1100); if (!this.running) return; this.ramp('lift', 1, .7); this.ramp('open', 1, .9); await sleep(1200); if (!this.running) return; this.ramp('face', 1, .8); this.flash = .15; this.flashC = '#ff9a7a'; }
    atlas(name, x, y, s, ms, add = true, alpha = 1) { this.fx.push({ name, x, y, s, ms, t:0, add, alpha }); }
    ember(x, y, s) { this.parts.push({ type:'ember', x, y, vx:(Math.random() - .5) * 40, vy:-40 - Math.random() * 60, life:.8 + Math.random() * 1.2, s:s || 8 + Math.random() * 12 }); }
    paneRect(cc, r) { const X0 = 260, Y0 = 50, dw = 540, door = cc < 4 ? 0 : 1, k = cc % 4, dx0 = door ? 800 : X0, cw = (dw - 44) / 4, ch = (820 - 48) / 9; return { x:dx0 + 22 + k * cw + 4, y:Y0 + 22 + r * ch + 4, w:cw - 8, h:ch - 8 }; }

    /* ── 그리기 ── */
    drawDuel() {
      const c = this.ctx, cl = this.rv('candle') * this.flick(1.1), gone = 1 - this.rv('gone'), sp = this.rv('split');
      const lights = [{ x:1000 + Math.sin(this.st * .6) * 30, y:640, r:1150, i:cl * 1.3, c:'255,165,90', S:12 }];
      if (sp > .05) lights.push({ x:700, y:640, r:900, i:sp * .9 * cl, c:'255,150,80', S:10 }, { x:1400, y:640, r:900, i:sp * .9 * cl, c:'255,150,80', S:10 });
      this.cast(lights, [{ key:this.bossPose(), x:1040, feet:930, h:820, d:this.rv('d'), a:gone }], 'rgb(30,16,8)');
      c.fillStyle = '#030305'; c.fillRect(0, 0, W, H);
      this.screen({ x0:130, y0:40, w:1431, h:790, ripple:this.rv('ripple'), press:this.rv('press'), lift:this.rv('lift') * 900 });
      this.players(130, 40, 1431, 790);
      this.shade(.92, 0, 0, W, 44, '6,5,4'); this.knotRow(241, 241 + 6 * 223, 40);
      this.vgrad(790, 900, 0, .9, '4,3,2'); this.lamps(); this.glow('glow-cold', 160, 860, 500, 260, .3);
      this.fog(.15); this.jijeon(-1, 1 + this.rv('ripple') * 2, this.rv('ripple') * Math.sin(this.st * 3)); this.jijeon(1, 1 + this.rv('ripple') * 2, this.rv('ripple') * Math.sin(this.st * 3 + 1));
      this.faceReveal(this.rv('face'));
    }
    drawLamps() {
      const c = this.ctx, ap = this.rv('apart'), gone = 1 - this.rv('gone'), shrink = (7 - this.knots) / 7;
      const lights = [
        { x:800 - 480 * ap + Math.sin(this.st * .8) * 20, y:620, r:1100, i:this.rv('red') * .95 * this.flick(1) * this.rv('candle'), c:'255,60,40', S:10 },
        { x:800 + 480 * ap + Math.sin(this.st * .6 + 1) * 20, y:560, r:1150, i:this.rv('blue') * .95 * this.rv('candle'), c:'50,120,255', S:6 },
        { x:800, y:300, r:1300, i:.3 + .6 * this.rv('cold'), c:'255,240,210', S:30 }];
      this.cast(lights, [{ key:this.bossPose(), x:800, feet:930, h:820 * (1 - shrink * .15), d:this.rv('d'), a:gone }], 'rgb(8,6,10)');
      c.fillStyle = '#030305'; c.fillRect(0, 0, W, H);
      this.screen({ x0:130, y0:40, w:1431, h:790, ripple:this.rv('ripple'), tex:['hanji0', 'hanji1'], tint:null, glowA:.45, lift:this.rv('lift') * 900 });
      this.players(130, 40, 1431, 790);
      this.shade(.92, 0, 0, W, 44, '6,5,4'); this.knotRow(241, 241 + 6 * 223, 40);
      this.vgrad(790, 900, 0, .9, '4,3,2'); this.lamps();
      this.glow('glow-red', 800 - 480 * ap, 860, 600, 200, .35 * this.rv('red')); this.glow('glow-cold', 800 + 480 * ap, 860, 600, 200, .35 * this.rv('blue'));
      this.fog(.1); this.faceReveal(this.rv('face'));
    }
    drawLattice() {
      const c = this.ctx, cl = this.rv('candle') * this.flick(2.2), sp = this.rv('split'), op = this.rv('open');
      const lights = [{ x:900 + Math.sin(this.st * .9) * 25, y:520, r:900, i:cl * 1.1 * (1 - op), c:'255,160,80', S:16 }, { x:600, y:150, r:1400, i:.55, c:'150,180,255', S:2 }];
      if (sp > .05) lights.push({ x:300, y:600, r:900, i:.7 * sp, c:'255,190,120', S:12 }, { x:1300, y:600, r:900, i:.7 * sp, c:'255,190,120', S:12 });
      this.cast(lights, [{ key:this.bossPose(), x:820, feet:900, h:740, d:this.rv('d'), a:1 - op }], 'rgb(10,12,22)');
      c.fillStyle = '#050608'; c.fillRect(0, 0, W, H);
      const shake = this.rv('rattle') > .05 && !this.reduced ? Math.sin(this.st * 60) * 3 * this.rv('rattle') : 0;
      if (op > .01) { this.glow('glow-cold', 800, 450, 1400, 900, .5 * op); }
      for (const door of [0, 1]) {
        const dx = (door ? 1 : -1) * op * 560;
        c.save(); c.beginPath(); c.rect(door ? 800 : 260, 50, 540, 820); c.clip(); c.translate(dx + shake, 0);
        this.screen({ x0:door ? 800 : 260, y0:50, w:540, h:820, panels:1, tex:['hanji0', 'hanji1'], N:10, rigid:true, tint:'#ffcc99', tintA:.35, glowA:.4 });
        this.players(door ? 800 : 260, 50, 540, 820);
        for (const ho of this.holes) {
          if ((ho.c < 4 ? 0 : 1) !== door) continue; const p = this.paneRect(ho.c, ho.r), k = Math.min(1, (this.st - ho.t) * 3);
          c.beginPath(); for (let a = 0; a < 18; a++) { const ang = a / 18 * 6.283, j = .78 + .22 * Math.sin(a * 7.3 + ho.c * 3) * Math.cos(a * 2.1 + ho.r); c.lineTo(p.x + p.w / 2 + Math.cos(ang) * p.w * .5 * k * j, p.y + p.h / 2 + Math.sin(ang) * p.h * .5 * k * j); } c.closePath();
          c.fillStyle = '#060a14'; c.fill(); c.strokeStyle = 'rgba(250,240,220,.85)'; c.lineWidth = 2.5; c.stroke();
        }
        c.restore();
      }
      const lat = this.img.lattice;
      if (lat) {
        c.save(); c.translate(shake, 0);
        for (const door of [0, 1]) { const dx = (door ? 1 : -1) * op * 560; c.save(); c.beginPath(); c.rect(door ? 800 : 260, 0, 540, 900); c.clip(); c.drawImage(lat, door ? 800 : 260, 0, 540, 900, (door ? 800 : 260) + dx, 0, 540, 900); c.restore(); }
        c.restore();
        c.drawImage(lat, 0, 0, 262, 900, 0, 0, 262, 900); c.drawImage(lat, 1338, 0, 262, 900, 1338, 0, 262, 900);
      }
      this.shade(.35, 0, 0, 262, 900); this.shade(.35, 1338, 0, 262, 900);
      const pung = this.rv('pung'), hj = this.img.hanji0;
      if (hj) for (let k = 0; k < 14; k++) { const y = 70 + k * 56, x = k % 2 ? 1340 : 798, a = Math.sin(this.st * (8 + pung * 18) + k) * (2 + pung * 9); c.save(); c.translate(x, y); c.rotate(a * .02); c.globalAlpha = .7; c.drawImage(hj, 0, 0, 40, 200, 0, 0, 10, 46); c.restore(); }
      this.knotRow(400, 1200, 22, .8);
      this.vgrad(760, 900, 0, .95, '3,3,4'); this.lamps(890);
      this.candle(170, 900, .8, 1); this.candle(1430, 900, .8, 2);
      this.faceReveal(this.rv('face'));
    }
    /* 아인과 동행자의 그림자 (앞쪽 찬 등) */
    players(x, y, w, h) {
      const c = this.ctx; c.save(); c.beginPath(); c.rect(x, y, w, h - this.rv('lift') * 900); c.clip();
      this.glow('glow-cold', 300, 700, 1200, 900, .2);
      if (this.companionShadow && this.rv('comp') > .01) this.front(this.companionShadow, 330, 840, 560, .62, .7 * this.rv('comp'));
      this.front(this.ain, 470 + (.85 - this.rv('aD')) * 300, 840, 330, this.rv('aD'), .82);
      c.restore();
    }
    drawFlying(dt) {
      const f = this.flying; if (!f || !f.img || !f.img.complete || f.gone) return; const c = this.ctx;
      f.t += dt * 1000; const t = Math.min(1, f.t / f.ms), e = 1 - Math.pow(1 - t, 3);
      const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(t * Math.PI) * 90, w = lerp(150, 120, e), h = w * 1.5;
      c.save(); c.translate(x, y); c.rotate((1 - e) * -.14); c.globalAlpha = 1 - f.burn; c.drawImage(f.img, -w / 2, -h / 2, w, h);
      if (f.dark) { c.globalAlpha = f.dark * .65 * (1 - f.burn); c.fillStyle = '#05080c'; c.fillRect(-w / 2, -h / 2, w, h); }
      c.restore();
      if (f.burnT) { f.burn = Math.min(1, f.burn + dt * 1.4); if (Math.random() < .8) this.ember(x + (Math.random() - .5) * w, y + (Math.random() - .5) * h); if (f.burn >= 1) f.gone = true; }
    }
    drawParts(dt) {
      const c = this.ctx;
      for (const p of this.parts) {
        p.life -= dt;
        if (p.type === 'ember') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx += Math.sin(this.st * 3 + p.y * .02) * 10 * dt; this.glow('ember', p.x, p.y, p.s, p.s, Math.min(1, p.life)); }
        else if (p.type === 'fall' && this.img.tassel) { p.vy += 400 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; c.save(); c.globalAlpha = clamp(p.life, 0, 1); c.translate(p.x, p.y); c.rotate(p.rot); c.drawImage(this.img.tassel, -11, 0, 22, 78); c.restore(); }
      }
      this.parts = this.parts.filter(p => p.life > 0);
    }
    drawFx(dt) {
      const c = this.ctx;
      for (const f of this.fx) { f.t += dt * 1000; const a = ATLAS[f.name], im = this.img[f.name]; if (!a || !im) continue; const fr = Math.min(a[0] - 1, Math.floor(f.t / f.ms * a[0])), w = f.s, h = f.s * a[2] / a[1]; c.save(); if (f.add) c.globalCompositeOperation = 'lighter'; c.globalAlpha = f.alpha; c.drawImage(im, fr * a[1], 0, a[1], a[2], f.x - w / 2, f.y - h / 2, w, h); c.restore(); }
      this.fx = this.fx.filter(f => f.t < f.ms);
    }
    loop(now) {
      if (!this.running) return;
      const rdt = Math.min(.05, (now - this.last) / 1000); this.last = now; let dt = rdt;
      if (this.stop_ > 0) { this.stop_ -= rdt; dt = 0; }
      this.st += dt; this.frames++;
      for (const k in this.T) { const r = this.T[k]; r.v += (r.to - r.v) * Math.min(1, rdt * r.sp); }
      for (const d of this.drops) d.t = Math.min(1.6, d.t + dt * .9);
      this.zoom += (1 - this.zoom) * Math.min(1, rdt * 3); this.trauma = Math.max(0, this.trauma - rdt * 1.4);
      const c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, this.cv.width, this.cv.height);
      c.setTransform(this.scale, 0, 0, this.scale, this.offX, this.offY);
      const sh = this.reduced ? 0 : this.trauma * this.trauma * 22, z = this.zoom * (1 + (this.reduced ? 0 : .006 * Math.sin(now / 1000 * .23)));
      c.save(); c.translate(W / 2 + (Math.random() - .5) * sh, H / 2 + (Math.random() - .5) * sh); c.scale(z, z); c.translate(-W / 2, -H / 2);
      try {
        if (this.variant === 'lattice') this.drawLattice(); else if (this.variant === 'lamps') this.drawLamps(); else this.drawDuel();
        this.drawFlying(dt); this.drawParts(dt); this.drawFx(dt);
      } catch (e) { this.error = String(e); }
      c.restore();
      const v = c.createRadialGradient(W / 2, H * .46, H * .32, W / 2, H * .5, H * 1.02); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.7)'); c.fillStyle = v; c.fillRect(-W, -H, W * 3, H * 3);
      const g = this.img.grain; if (g && !this.reduced) { const f = (this.frames >> 1) % 4; c.save(); c.globalAlpha = .5; for (let x = 0; x < W; x += 256) for (let y = 0; y < H; y += 256) c.drawImage(g, f * 256, 0, 256, 256, x, y, 256, 256); c.restore(); }
      if (this.flash > 0) { c.fillStyle = this.flashC; c.globalAlpha = Math.min(1, this.flash); c.fillRect(-W, -H, W * 3, H * 3); c.globalAlpha = 1; this.flash = Math.max(0, this.flash - rdt * 1.8); }
      this.raf = requestAnimationFrame(t => this.loop(t));
    }
    diagnostics() { return { variant:this.variant, running:this.running, failed:[...this.failed], frames:this.frames, knots:this.knots, error:this.error || null, telegraph:this.intentName, pose:this.pose, done:this.done }; }
  }
  window.HYShadowStage = ShadowStage;
})();
