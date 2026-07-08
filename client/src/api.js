// API-Client: Token-Handling, automatischer Refresh, Offline-Queue, SSE
const QUEUE_KEY = 'wg.offlineQueue';

let accessToken = localStorage.getItem('wg.access') || null;
let refreshToken = localStorage.getItem('wg.refresh') || null;
let onLogout = () => {};
let refreshing = null;

export function setLogoutHandler(fn) {
  onLogout = fn;
}

export function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem('wg.access', access);
  else localStorage.removeItem('wg.access');
  if (refresh) localStorage.setItem('wg.refresh', refresh);
  else localStorage.removeItem('wg.refresh');
}

export function hasSession() {
  return !!refreshToken;
}

export function getAccessToken() {
  return accessToken;
}

async function doRefresh() {
  if (!refreshToken) return false;
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  if (!res.ok) return false;
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

export async function ensureFreshToken() {
  if (accessToken) {
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      if (payload.exp * 1000 > Date.now() + 30000) return true;
    } catch { /* Token unlesbar → refreshen */ }
  }
  refreshing ||= doRefresh().finally(() => { refreshing = null; });
  return refreshing;
}

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/** api('POST', '/api/tasks', {...}, { queueable: true }) */
export async function api(method, path, body, { queueable = false, auth = true } = {}) {
  if (auth) await ensureFreshToken();
  const exec = async () => {
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (res.status === 401 && auth) {
      if (await doRefresh()) return exec();
      setTokens(null, null);
      onLogout();
    }
    let data = null;
    try { data = await res.json(); } catch { /* leere Antwort */ }
    if (!res.ok) throw new ApiError(res.status, data?.error || 'Etwas ist schiefgelaufen.', data);
    return data;
  };

  try {
    return await exec();
  } catch (err) {
    // FR-PWA-003: Schreibaktionen offline puffern
    if (queueable && err instanceof TypeError) {
      const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      queue.push({ method, path, body });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      window.dispatchEvent(new CustomEvent('wg-queue-changed'));
      return { queued: true };
    }
    throw err;
  }
}

export function queueLength() {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]').length;
}

/** Bei Wiederverbindung gepufferte Änderungen synchronisieren */
export async function flushQueue() {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (!queue.length) return false;
  const remaining = [];
  for (const entry of queue) {
    try {
      await api(entry.method, entry.path, entry.body);
    } catch (err) {
      // Netz weiterhin weg → Rest behalten; Server-Ablehnung (4xx) → verwerfen
      if (err instanceof TypeError) remaining.push(entry);
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  window.dispatchEvent(new CustomEvent('wg-queue-changed'));
  return remaining.length === 0;
}

// ---- Server-Sent Events (Echtzeit < 3 s) ----
let eventSource = null;
let reconnectTimer = null;

export function connectEvents(handlers) {
  disconnectEvents();
  const open = async () => {
    await ensureFreshToken();
    if (!accessToken) return;
    eventSource = new EventSource(`/api/events?token=${encodeURIComponent(accessToken)}`);
    for (const [type, fn] of Object.entries(handlers)) {
      eventSource.addEventListener(type, (e) => {
        let payload = {};
        try { payload = JSON.parse(e.data); } catch { /* leer */ }
        fn(payload);
      });
    }
    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(open, 4000);
    };
  };
  open();
}

export function disconnectEvents() {
  clearTimeout(reconnectTimer);
  eventSource?.close();
  eventSource = null;
}
