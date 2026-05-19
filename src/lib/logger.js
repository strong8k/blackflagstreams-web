/* BFS Logger — intercepts console.*, global errors, fetch, clicks, navigation.
   Entries batch-POST to /api/logs with session + userId context. */

const SESSION = Math.random().toString(36).slice(2, 8);
const LOG_ENDPOINT = '/api/logs';
const MAX_QUEUE = 1000;
const MAX_DATA_CHARS = 2000;

let _id = 1;
let _queue = [];
let _timer = null;
let _initialized = false;
let _userId = null;
let _token = null;

function safeStringify(value) {
  if (value instanceof Error) {
    return JSON.stringify({ name: value.name, message: value.message, stack: value.stack?.slice(0, MAX_DATA_CHARS) });
  }
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function normalizeData(data) {
  if (data == null) return null;
  const text = safeStringify(data);
  return text.length > MAX_DATA_CHARS ? `${text.slice(0, MAX_DATA_CHARS)}…` : text;
}

export function setLogUser(userId, token) {
  _userId = userId;
  _token = token;
}

export function log(level, message, data = null) {
  _queue.push(JSON.stringify({
    id: _id++,
    timestamp: new Date().toISOString(),
    session: SESSION,
    userId: _userId,
    level,
    url: location.pathname,
    message: String(message ?? ''),
    ...(data != null ? { data: normalizeData(data) } : {}),
  }));
  if (_queue.length > MAX_QUEUE) _queue.splice(0, _queue.length - MAX_QUEUE);
  if (level === 'error') {
    clearTimeout(_timer); _timer = null; _flush();
  } else if (!_timer) {
    _timer = setTimeout(_flush, 3000);
  }
}

async function _flush() {
  _timer = null;
  if (!_queue.length) return;
  const batch = _queue.splice(0);
  const body = batch.join('\n');
  try {
    await fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
      },
      body,
      keepalive: body.length < 60000,
    });
  } catch {
    _queue.unshift(...batch);
    if (_queue.length > MAX_QUEUE) _queue.splice(0, _queue.length - MAX_QUEUE);
  }
}

export function initLogger() {
  if (_initialized) return;
  _initialized = true;

  // ── Intercept console.* ──
  const _orig = {
    log:   console.log.bind(console),
    info:  console.info.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
  };
  console.log   = (...a) => { _orig.log(...a);   log('debug', a.map(safeStringify).join(' ')); };
  console.info  = (...a) => { _orig.info(...a);  log('info',  a.map(safeStringify).join(' ')); };
  console.warn  = (...a) => { _orig.warn(...a);  log('warn',  a.map(safeStringify).join(' ')); };
  console.error = (...a) => { _orig.error(...a); log('error', a.map(safeStringify).join(' ')); };

  // ── Global JS errors ──
  window.onerror = (msg, src, line, col, err) => {
    log('error', `Uncaught: ${msg}`, { src, line, col, stack: err?.stack?.slice(0, 500) });
    return false;
  };
  window.addEventListener('error', e => {
    if (e.error) {
      log('error', `WindowError: ${e.message}`, { src: e.filename, line: e.lineno });
    } else if (e.target && e.target !== window) {
      const t = e.target;
      log('warn', 'ResourceError', {
        tag: t.tagName,
        src: t.currentSrc || t.src || t.href || null,
      });
    }
  }, true);

  // ── Unhandled promise rejections ──
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    log('error', `UnhandledRejection: ${r instanceof Error ? r.message : String(r)}`, r);
  });

  // ── Fetch — log all requests + failures ──
  const _fetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const started = performance.now();
    const reqUrl = typeof input === 'string' ? input : input?.url;
    const method = (init?.method || (typeof input !== 'string' ? input?.method : null) || 'GET').toUpperCase();
    const isLog = reqUrl && new URL(reqUrl, location.origin).pathname === LOG_ENDPOINT;
    try {
      const res = await _fetch(input, init);
      if (!isLog) {
        const ms = Math.round(performance.now() - started);
        log(res.ok ? 'debug' : 'error', `${method} ${res.status} ${reqUrl}`, { ms });
      }
      return res;
    } catch (err) {
      if (!isLog) log('error', `${method} FAILED ${reqUrl}`, err);
      throw err;
    }
  };

  // ── Clicks ──
  document.addEventListener('click', e => {
    const el = e.target;
    const tag = el.tagName?.toLowerCase() ?? '?';
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string'
      ? el.className.trim().split(/\s+/).slice(0, 2).map(c => `.${c}`).join('') : '';
    const text = (el.textContent ?? '').trim().slice(0, 60);
    log('debug', `click ${tag}${id}${cls}`, text || null);
  }, { passive: true });

  // ── SPA navigation ──
  const _push    = history.pushState.bind(history);
  const _replace = history.replaceState.bind(history);
  history.pushState    = (...a) => { _push(...a);    log('info', `nav → ${a[2] ?? location.pathname}`); };
  history.replaceState = (...a) => { _replace(...a); log('info', `nav(replace) → ${a[2] ?? location.pathname}`); };
  window.addEventListener('popstate', () => log('info', `nav(back) → ${location.pathname}`));

  // ── Flush on unload ──
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') _flush(); });
  window.addEventListener('pagehide', _flush);

  log('info', 'session start', { session: SESSION, url: location.href });
}

export const clearLogs = () =>
  fetch(`${LOG_ENDPOINT}?clear=true`, {
    method: 'POST',
    headers: _token ? { Authorization: `Bearer ${_token}` } : {},
  }).catch(() => {});
