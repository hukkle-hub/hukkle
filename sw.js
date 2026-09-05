/* 흥양기 서비스워커 — 배포 시 __DEPLOY_SHA__가 실제 커밋 SHA로 치환됩니다. */
const APP_VERSION = '38.0.0';
const BUILD_ID = '__DEPLOY_SHA__';
const CACHE_PREFIX = 'hy-';
const STATIC_CACHE = `${CACHE_PREFIX}static-${APP_VERSION}-${BUILD_ID}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${APP_VERSION}-${BUILD_ID}`;
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './update-client.js',
  './server-api.js',
  './version.json',
  './build-info.json',
  './assets/hub_poster.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      for (const url of CORE) {
        try { await cache.add(new Request(url, { cache: 'reload' })); }
        catch (error) { console.warn('[HY SW] precache skipped:', url, error); }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key))
    )));
  }
  if (type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'HY_SW_VERSION', version: APP_VERSION, build: BUILD_ID });
  }
});

const isFreshControlFile = (url) => /\/(version|build-info)\.json$/.test(url.pathname)
  || /\/(update-client|server-api|sw)\.js$/.test(url.pathname);

async function networkFirst(request, fallbackUrl = null) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || network || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 동영상 Range 응답은 부분 캐시 충돌을 피하기 위해 브라우저 네트워크에 맡긴다.
  if (request.headers.has('range') || request.destination === 'video' || request.destination === 'audio') {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  if (isFreshControlFile(url)) {
    event.respondWith(networkFirst(new Request(request, { cache: 'no-store' })));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
