(() => {
  'use strict';
  const API_BASE = (document.querySelector('meta[name="hy-api-base"]')?.content
    || 'https://ybflkszmymalhafzzdbs.supabase.co/functions/v1/hy').replace(/\/$/, '');
  const CLIENT_VERSION = document.querySelector('meta[name="hy-version"]')?.content || '0.0.0';
  const PLAYER_KEY = 'hy_server_player_id';

  class HYServerError extends Error {
    constructor(message, { code = 'SERVER_ERROR', status = 0, payload = null } = {}) {
      super(message);
      this.name = 'HYServerError';
      this.code = code;
      this.status = status;
      this.payload = payload;
    }
  }

  const getPlayerId = () => localStorage.getItem(PLAYER_KEY) || '';
  const setPlayerId = (id) => {
    if (id) localStorage.setItem(PLAYER_KEY, String(id));
    else localStorage.removeItem(PLAYER_KEY);
  };

  async function request(path, options = {}) {
    const method = String(options.method || (options.body == null ? 'GET' : 'POST')).toUpperCase();
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    headers.set('x-client-version', CLIENT_VERSION);
    const playerId = options.playerId ?? getPlayerId();
    if (playerId) headers.set('x-player', playerId);

    let body = options.body;
    if (body != null && !(body instanceof FormData) && typeof body !== 'string') {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 12000);
    try {
      const response = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
        method,
        headers,
        body,
        cache: method === 'GET' ? 'no-store' : 'default',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.error) {
        const error = new HYServerError(payload?.message || `HTTP ${response.status}`, {
          code: payload?.error || 'HTTP_ERROR', status: response.status, payload,
        });
        if (error.code === 'CLIENT_UPDATE_REQUIRED') {
          window.dispatchEvent(new CustomEvent('hy:client-update-required', { detail: payload }));
          window.HYUpdate?.check?.();
        }
        if (error.code === 'MAINTENANCE') {
          window.dispatchEvent(new CustomEvent('hy:maintenance', { detail: payload }));
        }
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') throw new HYServerError('서버 응답 시간이 초과되었습니다.', { code: 'TIMEOUT' });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  window.HYServer = {
    baseUrl: API_BASE,
    clientVersion: CLIENT_VERSION,
    request,
    getPlayerId,
    setPlayerId,
    status: () => request('/system/status', { timeout: 7000 }),
    health: () => request('/health', { timeout: 7000 }),
    master: () => request('/master'),
    initPlayer: async (nickname) => {
      const result = await request('/player/init', { method: 'POST', body: { nickname }, playerId: '' });
      if (result?.player?.id) setPlayerId(result.player.id);
      return result;
    },
    player: () => request('/player'),
    saveParty: (payload) => request('/party', { method: 'POST', body: payload }),
    startExplore: (payload) => request('/explore/start', { method: 'POST', body: payload }),
    stepExplore: () => request('/explore/step', { method: 'POST', body: {} }),
    leaveExplore: () => request('/explore/leave', { method: 'POST', body: {} }),
    Error: HYServerError,
  };
})();
