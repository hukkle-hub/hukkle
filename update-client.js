(() => {
  'use strict';

  const META_VERSION = document.querySelector('meta[name="hy-version"]')?.content || '0.0.0';
  const META_BUILD = document.querySelector('meta[name="hy-build"]')?.content || 'source';
  const VERSION_URL = new URL('./version.json', location.href);
  const BUILD_URL = new URL('./build-info.json', location.href);
  const STORAGE = {
    dismissed: 'hy_update_dismissed',
    backup: 'hy_update_save_backup',
    lastCheck: 'hy_update_last_check',
    appliedBuild: 'hy_update_applied_build',
  };

  let registration = null;
  let remote = null;
  let checking = false;
  let reloading = false;
  let timer = null;
  let autoApplyTimer = null;

  const state = {
    currentVersion: META_VERSION,
    currentBuild: META_BUILD,
    remoteVersion: null,
    remoteBuild: null,
    online: navigator.onLine,
    serviceWorker: 'unsupported',
    updateAvailable: false,
    maintenance: false,
    forceUpdate: false,
    lastError: null,
  };

  const parseVersion = (value) => String(value || '0')
    .split(/[.+-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);

  const compareVersion = (a, b) => {
    const av = parseVersion(a);
    const bv = parseVersion(b);
    for (let i = 0; i < 3; i += 1) {
      if (av[i] > bv[i]) return 1;
      if (av[i] < bv[i]) return -1;
    }
    return 0;
  };

  const noStore = async (url) => {
    const target = new URL(url);
    target.searchParams.set('_hy', String(Date.now()));
    const response = await fetch(target, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) throw new Error(`${target.pathname}: HTTP ${response.status}`);
    return response.json();
  };

  function createUi() {
    if (document.getElementById('hy-update-root')) return;
    const root = document.createElement('div');
    root.id = 'hy-update-root';
    root.innerHTML = `
      <style>
        #hy-update-root{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:Pretendard,"Noto Sans KR","Apple SD Gothic Neo",system-ui,sans-serif;color:#f5efe2}
        #hy-update-chip{position:absolute;right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));min-height:38px;padding:0 12px;border:1px solid rgba(255,226,160,.22);border-radius:999px;background:rgba(5,8,9,.72);backdrop-filter:blur(16px);box-shadow:0 10px 30px rgba(0,0,0,.28);display:flex;align-items:center;gap:8px;color:#dcd3c1;font-size:11px;font-weight:750;pointer-events:auto;cursor:pointer;opacity:.82;transition:.2s}
        #hy-update-chip:hover{opacity:1;transform:translateY(-1px)}
        #hy-update-chip i{display:block;width:7px;height:7px;border-radius:50%;background:#6bb8a1;box-shadow:0 0 10px currentColor}
        #hy-update-chip.offline i{background:#a59d8d}#hy-update-chip.update i{background:#ffe2a0;animation:hy-update-pulse 1s infinite alternate}#hy-update-chip.error i{background:#d54a45}
        #hy-update-panel{position:absolute;right:max(12px,env(safe-area-inset-right));top:max(58px,calc(env(safe-area-inset-top) + 58px));width:min(390px,calc(100vw - 24px));max-height:min(620px,calc(100vh - 80px));overflow:auto;border:1px solid rgba(255,226,160,.2);border-radius:22px;background:linear-gradient(155deg,rgba(19,23,24,.97),rgba(5,8,9,.98));box-shadow:0 28px 80px rgba(0,0,0,.58);padding:18px;pointer-events:auto;opacity:0;visibility:hidden;transform:translateY(-8px) scale(.98);transition:.22s}
        #hy-update-panel.open{opacity:1;visibility:visible;transform:none}
        #hy-update-panel h2{font-family:"Noto Serif KR",serif;font-size:20px;margin:4px 0 5px}#hy-update-panel p{color:#aaa394;font-size:11px;line-height:1.65;margin:0}
        .hy-up-kicker{font-size:9px;color:#ddb86f;letter-spacing:.16em;font-weight:850}.hy-up-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:15px 0}.hy-up-stat{padding:11px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.025)}.hy-up-stat small{display:block;color:#8f887d;font-size:8px}.hy-up-stat b{display:block;margin-top:5px;font-size:11px;word-break:break-all}
        .hy-up-notes{margin:12px 0 0;padding:0;list-style:none;display:grid;gap:6px}.hy-up-notes li{padding:9px 11px;border-radius:12px;background:rgba(255,255,255,.025);color:#c7bfaf;font-size:10px;line-height:1.5}.hy-up-notes li:before{content:"·";color:#ddb86f;margin-right:7px}
        .hy-up-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:15px}.hy-up-btn{min-height:42px;padding:0 15px;border-radius:999px;border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.045);color:#f5efe2;font-size:10px;font-weight:850;cursor:pointer}.hy-up-btn.primary{background:linear-gradient(#f0d28c,#b9843e);color:#171006;border:0}.hy-up-btn:disabled{opacity:.45;cursor:wait}
        #hy-update-modal{position:absolute;inset:0;background:rgba(1,3,4,.82);backdrop-filter:blur(18px);display:grid;place-items:center;padding:18px;pointer-events:auto;opacity:0;visibility:hidden;transition:.25s}#hy-update-modal.open{opacity:1;visibility:visible}.hy-up-dialog{width:min(520px,100%);border:1px solid rgba(255,226,160,.22);border-radius:26px;background:linear-gradient(150deg,#171b1c,#07090a);box-shadow:0 35px 100px #000;padding:24px}.hy-up-dialog h1{font-family:"Noto Serif KR",serif;font-size:28px;margin:8px 0 10px}.hy-up-dialog p{color:#aaa394;font-size:12px;line-height:1.7}.hy-up-progress{height:5px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:15px}.hy-up-progress i{display:block;width:35%;height:100%;background:linear-gradient(90deg,#6bb8a1,#ffe2a0);animation:hy-up-load 1.1s ease-in-out infinite alternate}
        @keyframes hy-update-pulse{to{transform:scale(1.4);box-shadow:0 0 17px #ffe2a0}}@keyframes hy-up-load{to{transform:translateX(185%)}}
        @media(max-width:700px){#hy-update-chip{top:auto;bottom:max(10px,env(safe-area-inset-bottom));right:10px;min-height:34px}#hy-update-panel{top:auto;bottom:max(54px,calc(env(safe-area-inset-bottom) + 54px));right:10px}.hy-up-grid{grid-template-columns:1fr 1fr}}
        @media(prefers-reduced-motion:reduce){#hy-update-root *{animation:none!important;transition:none!important}}
      </style>
      <button id="hy-update-chip" type="button" aria-label="업데이트 상태 열기"><i></i><span>서버 확인 중</span></button>
      <section id="hy-update-panel" aria-label="흥양기 업데이트 상태">
        <span class="hy-up-kicker">LIVE UPDATE</span><h2>배포 상태</h2><p id="hy-up-summary">서버에서 최신 빌드를 확인하고 있습니다.</p>
        <div class="hy-up-grid">
          <div class="hy-up-stat"><small>현재 클라이언트</small><b id="hy-up-current">-</b></div>
          <div class="hy-up-stat"><small>서버 최신 버전</small><b id="hy-up-remote">-</b></div>
          <div class="hy-up-stat"><small>현재 빌드</small><b id="hy-up-current-build">-</b></div>
          <div class="hy-up-stat"><small>서버 빌드</small><b id="hy-up-remote-build">-</b></div>
        </div>
        <ul id="hy-up-notes" class="hy-up-notes"></ul>
        <div class="hy-up-actions"><button class="hy-up-btn primary" id="hy-up-apply" hidden>지금 적용</button><button class="hy-up-btn" id="hy-up-check">다시 확인</button><button class="hy-up-btn" id="hy-up-later" hidden>나중에</button></div>
      </section>
      <section id="hy-update-modal"><div class="hy-up-dialog"><span class="hy-up-kicker" id="hy-up-modal-kicker">UPDATE</span><h1 id="hy-up-modal-title">새 기록을 불러오는 중</h1><p id="hy-up-modal-copy">진행 기록을 보존하고 새 클라이언트를 적용합니다.</p><div class="hy-up-progress"><i></i></div><div class="hy-up-actions" id="hy-up-modal-actions"></div></div></section>`;
    (document.body || document.documentElement).appendChild(root);

    root.querySelector('#hy-update-chip').addEventListener('click', () => {
      root.querySelector('#hy-update-panel').classList.toggle('open');
    });
    root.querySelector('#hy-up-check').addEventListener('click', () => checkForUpdate(true));
    root.querySelector('#hy-up-apply').addEventListener('click', () => applyUpdate());
    root.querySelector('#hy-up-later').addEventListener('click', () => {
      if (remote?.build) localStorage.setItem(STORAGE.dismissed, remote.build);
      root.querySelector('#hy-update-panel').classList.remove('open');
      render();
    });
  }

  function render() {
    createUi();
    const root = document.getElementById('hy-update-root');
    const chip = root.querySelector('#hy-update-chip');
    const chipText = chip.querySelector('span');
    chip.classList.remove('offline', 'update', 'error');

    if (!state.online) {
      chip.classList.add('offline');
      chipText.textContent = '오프라인';
    } else if (state.lastError) {
      chip.classList.add('error');
      chipText.textContent = '서버 재확인';
    } else if (state.updateAvailable) {
      chip.classList.add('update');
      chipText.textContent = state.forceUpdate ? '필수 업데이트' : '새 업데이트';
    } else {
      chipText.textContent = `온라인 · v${state.currentVersion}`;
    }

    root.querySelector('#hy-up-current').textContent = state.currentVersion;
    root.querySelector('#hy-up-remote').textContent = state.remoteVersion || '-';
    root.querySelector('#hy-up-current-build').textContent = shortBuild(state.currentBuild);
    root.querySelector('#hy-up-remote-build').textContent = shortBuild(state.remoteBuild);
    root.querySelector('#hy-up-summary').textContent = state.maintenance
      ? (remote?.maintenance_message || '서버 점검 중입니다.')
      : state.updateAvailable
        ? `${remote?.release_name || '새 빌드'}를 적용할 수 있습니다.`
        : state.lastError
          ? `업데이트 서버에 연결하지 못했습니다. 현재 버전으로 계속 플레이할 수 있습니다.`
          : '현재 클라이언트가 서버의 최신 빌드와 같습니다.';

    const notes = root.querySelector('#hy-up-notes');
    const releaseNotes = Array.isArray(remote?.release_notes) ? remote.release_notes : [];
    notes.innerHTML = releaseNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('');

    const apply = root.querySelector('#hy-up-apply');
    const later = root.querySelector('#hy-up-later');
    apply.hidden = !state.updateAvailable;
    later.hidden = !state.updateAvailable || state.forceUpdate;

    if (state.maintenance) showMaintenance();
    else if (state.forceUpdate && state.updateAvailable) showForcedUpdate();
    scheduleAutoApply();
  }


  function isSafeToAutoApply() {
    if (document.body?.dataset.hyUpdateLock) return false;
    if (typeof window.HYGame?.isSafeForUpdate === 'function') {
      try { return Boolean(window.HYGame.isSafeForUpdate()); } catch { return false; }
    }
    return true;
  }

  function scheduleAutoApply() {
    clearTimeout(autoApplyTimer);
    autoApplyTimer = null;
    if (!state.updateAvailable || state.forceUpdate || state.maintenance) return;
    if (remote?.auto_apply !== 'safe' || !isSafeToAutoApply()) return;
    if (remote?.build && localStorage.getItem(STORAGE.dismissed) === remote.build) return;
    const delay = Math.max(3, Number(remote?.auto_apply_delay_seconds) || 5);
    const summary = document.getElementById('hy-up-summary');
    if (summary) summary.textContent = `안전한 화면에서 ${delay}초 뒤 새 빌드를 자동 적용합니다. 진행 기록은 보존됩니다.`;
    autoApplyTimer = setTimeout(() => {
      if (isSafeToAutoApply() && state.updateAvailable && !state.forceUpdate && !state.maintenance) applyUpdate();
    }, delay * 1000);
  }

  const shortBuild = (value) => {
    const text = String(value || '-');
    return text.length > 14 ? text.slice(0, 12) : text;
  };

  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function showMaintenance() {
    const modal = document.getElementById('hy-update-modal');
    modal.classList.add('open');
    modal.querySelector('#hy-up-modal-kicker').textContent = 'MAINTENANCE';
    modal.querySelector('#hy-up-modal-title').textContent = '고흥의 길을 정비하고 있습니다';
    modal.querySelector('#hy-up-modal-copy').textContent = remote?.maintenance_message || '잠시 뒤 다시 확인해 주세요.';
    modal.querySelector('.hy-up-progress').hidden = true;
    modal.querySelector('#hy-up-modal-actions').innerHTML = '<button class="hy-up-btn primary" id="hy-maint-check">다시 확인</button>';
    modal.querySelector('#hy-maint-check').onclick = () => checkForUpdate(true);
  }

  function showForcedUpdate() {
    const modal = document.getElementById('hy-update-modal');
    modal.classList.add('open');
    modal.querySelector('#hy-up-modal-kicker').textContent = 'REQUIRED UPDATE';
    modal.querySelector('#hy-up-modal-title').textContent = '새 버전이 필요합니다';
    modal.querySelector('#hy-up-modal-copy').textContent = '서버 데이터와 안전하게 맞추기 위해 업데이트 후 계속할 수 있습니다. 진행 기록은 유지됩니다.';
    modal.querySelector('.hy-up-progress').hidden = true;
    modal.querySelector('#hy-up-modal-actions').innerHTML = '<button class="hy-up-btn primary" id="hy-force-apply">업데이트 적용</button>';
    modal.querySelector('#hy-force-apply').onclick = () => applyUpdate();
  }

  function showApplying() {
    const modal = document.getElementById('hy-update-modal');
    modal.classList.add('open');
    modal.querySelector('#hy-up-modal-kicker').textContent = 'APPLYING UPDATE';
    modal.querySelector('#hy-up-modal-title').textContent = '새 기록을 불러오는 중';
    modal.querySelector('#hy-up-modal-copy').textContent = '진행 기록을 보존하고 캐시를 교체한 뒤 게임을 다시 엽니다.';
    modal.querySelector('.hy-up-progress').hidden = false;
    modal.querySelector('#hy-up-modal-actions').innerHTML = '';
  }

  function backupSaves() {
    const data = {};
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || key === STORAGE.backup) continue;
        if (/^(hy[-_]|heungyanggi|흥양기)/i.test(key)) data[key] = localStorage.getItem(key);
      }
      localStorage.setItem(STORAGE.backup, JSON.stringify({
        createdAt: new Date().toISOString(),
        fromVersion: state.currentVersion,
        fromBuild: state.currentBuild,
        toVersion: state.remoteVersion,
        toBuild: state.remoteBuild,
        data,
      }));
    } catch (error) {
      console.warn('[HY Update] save backup skipped', error);
    }
  }

  async function waitForWaitingWorker(timeoutMs = 8000) {
    if (!registration) return null;
    if (registration.waiting) return registration.waiting;
    await registration.update().catch(() => {});
    if (registration.waiting) return registration.waiting;
    return new Promise((resolve) => {
      let settled = false;
      const done = (worker) => {
        if (settled) return;
        settled = true;
        resolve(worker || null);
      };
      const timeout = setTimeout(() => done(null), timeoutMs);
      const watch = (worker) => {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') {
            clearTimeout(timeout);
            done(registration.waiting || worker);
          }
        });
      };
      registration.addEventListener('updatefound', () => watch(registration.installing), { once: true });
      watch(registration.installing);
    });
  }

  async function applyUpdate() {
    if (reloading) return;
    reloading = true;
    showApplying();
    backupSaves();
    window.dispatchEvent(new CustomEvent('hy:before-update', { detail: remote }));

    try {
      if ('serviceWorker' in navigator && registration) {
        const worker = await waitForWaitingWorker();
        if (worker) {
          sessionStorage.setItem('hy_update_reload', '1');
          worker.postMessage({ type: 'SKIP_WAITING' });
          setTimeout(() => hardReload(), 4500);
          return;
        }
      }
      await clearAppCaches();
      hardReload();
    } catch (error) {
      console.error('[HY Update] apply failed', error);
      hardReload();
    }
  }

  async function clearAppCaches() {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('hy-')).map((key) => caches.delete(key)));
  }

  function hardReload() {
    const next = new URL(location.href);
    next.searchParams.set('_build', state.remoteBuild || Date.now());
    location.replace(next.toString());
  }

  async function checkForUpdate(userInitiated = false) {
    if (checking) return;
    checking = true;
    state.lastError = null;
    if (userInitiated) render();

    try {
      const [manifest, build] = await Promise.all([
        noStore(VERSION_URL),
        noStore(BUILD_URL).catch(() => ({})),
      ]);
      let serverStatus = null;
      if (manifest.api_status_endpoint) {
        serverStatus = await noStore(manifest.api_status_endpoint).catch(() => null);
      }
      remote = {
        ...manifest,
        build: build.commit || build.build || manifest.build || null,
        server_status: serverStatus,
      };
      const statusLatest = serverStatus?.client_latest || serverStatus?.client_version || '0.0.0';
      const statusMinimum = serverStatus?.client_min || serverStatus?.min_supported_version || '0.0.0';
      const serverLatest = compareVersion(statusLatest, manifest.version || '0.0.0') > 0 ? statusLatest : manifest.version;
      const serverMinimum = compareVersion(statusMinimum, manifest.min_supported_version || '0.0.0') > 0 ? statusMinimum : (manifest.min_supported_version || '0.0.0');
      state.remoteVersion = serverLatest || null;
      state.remoteBuild = remote.build;
      state.maintenance = Boolean(serverStatus?.maintenance || manifest.maintenance);
      state.forceUpdate = Boolean(serverStatus?.force_update || manifest.force_update)
        || compareVersion(state.currentVersion, serverMinimum) < 0;
      if (serverStatus?.maintenance_message) remote.maintenance_message = serverStatus.maintenance_message;

      const versionChanged = compareVersion(serverLatest, state.currentVersion) > 0;
      const loadedBuildKnown = state.currentBuild && !state.currentBuild.includes('__DEPLOY') && state.currentBuild !== 'source';
      const buildChanged = Boolean(remote.build && loadedBuildKnown && remote.build !== state.currentBuild);
      state.updateAvailable = versionChanged || buildChanged;
      localStorage.setItem(STORAGE.lastCheck, new Date().toISOString());

      if (!state.updateAvailable && remote.build) {
        localStorage.setItem(STORAGE.appliedBuild, remote.build);
      }

      if (registration) registration.update().catch(() => {});
      render();
      window.dispatchEvent(new CustomEvent('hy:update-status', { detail: { ...state, remote } }));
    } catch (error) {
      state.lastError = String(error?.message || error);
      render();
    } finally {
      checking = false;
    }
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) {
      state.serviceWorker = 'unsupported';
      render();
      return;
    }
    try {
      registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './',
        updateViaCache: 'none',
      });
      state.serviceWorker = navigator.serviceWorker.controller ? 'active' : 'installing';

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            state.updateAvailable = true;
            state.remoteVersion ||= remote?.version || state.currentVersion;
            render();
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        state.serviceWorker = 'active';
        if (sessionStorage.getItem('hy_update_reload') === '1' && !reloading) {
          reloading = true;
          sessionStorage.removeItem('hy_update_reload');
          hardReload();
        } else if (reloading) {
          sessionStorage.removeItem('hy_update_reload');
          hardReload();
        }
      });
    } catch (error) {
      state.serviceWorker = 'error';
      console.warn('[HY Update] service worker registration failed', error);
    }
    render();
  }

  function schedule() {
    clearInterval(timer);
    const seconds = Math.max(30, Number(remote?.check_interval_seconds) || 60);
    timer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) checkForUpdate(false);
    }, seconds * 1000);
  }

  async function init() {
    createUi();
    render();
    await registerServiceWorker();
    await checkForUpdate(false);
    schedule();

    window.addEventListener('online', () => {
      state.online = true;
      checkForUpdate(false);
    });
    window.addEventListener('offline', () => {
      state.online = false;
      render();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) checkForUpdate(false);
    });
    window.addEventListener('hy:screen-changed', scheduleAutoApply);
  }

  window.HYUpdate = {
    state,
    check: () => checkForUpdate(true),
    apply: applyUpdate,
    clearCaches: clearAppCaches,
    backupSaves,
    getRemote: () => remote,
    getRegistration: () => registration,
    setBusy: (busy, reason = 'gameplay') => {
      if (busy) document.body.dataset.hyUpdateLock = reason;
      else document.body.removeAttribute('data-hy-update-lock');
      if (!busy) scheduleAutoApply();
    },
    isSafe: isSafeToAutoApply,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
