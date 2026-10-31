// Cloudflare Worker: Google Health API proxy for the app hosted on GitHub Pages
//
// Secrets (wrangler secret put):  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_KEY
// KV binding:                     TOKENS
// Vars (wrangler.toml):           ALLOWED_ORIGIN (the Pages address), optional SCOPES (space-separated, overrides DEFAULT_SCOPES)
//
// Routes
//   GET  /auth/start      -> passphrase page, then redirect to Google consent
//   POST /auth/start      -> (form submit) validates APP_KEY, redirects to Google
//   GET  /auth/callback   -> exchanges code, stores the refresh token in KV
//   GET  /api/status      -> { connected, lastError }
//   GET  /api/days        -> ?from=YYYY-MM-DD&to=YYYY-MM-DD, per-day steps/calories/sleep/resting HR
//   GET  /api/raw         -> ?type=steps&from=..&to=.. raw Google response, for debugging shapes
// Everything under /api needs the X-App-Key header.

const HEALTH = 'https://health.googleapis.com/v4/users/me/dataTypes';
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors(request, env), 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' } });
    try {
      if (url.pathname === '/auth/start') return authStart(request, env, url);
      if (url.pathname === '/auth/callback') return authCallback(env, url);
      if (url.pathname.startsWith('/api/')) {
        if (!(await keyOk(request.headers.get('X-App-Key'), env.APP_KEY))) return json({ error: 'Wrong or missing app key.' }, 401, request, env);
        if (url.pathname === '/api/status') return json(await status(env), 200, request, env);
        if (url.pathname === '/api/days') return json(await days(env, url), 200, request, env);
        if (url.pathname === '/api/raw') return json(await raw(env, url), 200, request, env);
        return json({ error: 'Not found' }, 404, request, env);
      }
      return html('<h2>Intake vs Burn API</h2><p>This address only serves data to the app. Open the app from your home screen.</p>');
    } catch (e) {
      await setLastError(env, e.message);
      return json({ error: e.message }, e.status || 500, request, env);
    }
  },
};

/* ---------------- helpers ---------------- */

function json(body, status, request, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(request, env) },
  });
}
// ALLOWED_ORIGIN: comma-separated list of exact origins that may call /api (the GitHub Pages address).
function cors(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'X-App-Key', Vary: 'Origin' };
}
function html(body, status = 200) {
  return new Response(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="font:16px system-ui;max-width:460px;margin:40px auto;padding:0 16px">${body}`, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
async function keyOk(given, expected) {
  if (!given || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(expected))]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
const scopes = env => (env.SCOPES || DEFAULT_SCOPES.join(' '));
const redirectUri = url => `${url.origin}/auth/callback`;
const fail = (msg, status = 502) => Object.assign(new Error(msg), { status });

async function setLastError(env, msg) { try { await env.TOKENS.put('lastError', `${new Date().toISOString()} ${msg}`); } catch { /* ignore */ } }

/* ---------------- OAuth ---------------- */

async function authStart(request, env, url) {
  if (request.method === 'POST') {
    const form = await request.formData();
    if (!(await keyOk(form.get('key'), env.APP_KEY))) return html('<p>Wrong app key.</p><p><a href="/auth/start">Try again</a></p>', 401);
    const state = crypto.randomUUID();
    await env.TOKENS.put(`state:${state}`, '1', { expirationTtl: 600 });
    const q = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(url),
      response_type: 'code',
      scope: scopes(env),
      access_type: 'offline',
      prompt: 'consent', // always hand back a refresh token, including when reconnecting
      state,
    });
    return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, 302);
  }
  return html(`<h2>Connect Google Health</h2>
    <p>Enter your app key to continue to Google.</p>
    <form method=post><input name=key type=password autofocus style="width:100%;padding:12px;font-size:16px;box-sizing:border-box">
    <p><button style="padding:12px 18px;font-size:16px">Continue</button></p></form>`);
}

async function authCallback(env, url) {
  const err = url.searchParams.get('error');
  if (err) return html(`<h2>Google said no</h2><p>${esc(err)}</p>`, 400);
  const state = url.searchParams.get('state'), code = url.searchParams.get('code');
  if (!state || !code || !(await env.TOKENS.get(`state:${state}`))) return html('<h2>Link expired</h2><p>Start again from the app.</p>', 400);
  await env.TOKENS.delete(`state:${state}`);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(url), grant_type: 'authorization_code',
    }),
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.refresh_token) return html(`<h2>Could not connect</h2><p>${esc(tok.error_description || tok.error || 'No refresh token returned.')}</p>`, 400);
  await env.TOKENS.put('refreshToken', tok.refresh_token);
  await env.TOKENS.put('grantedScopes', tok.scope || '');
  await env.TOKENS.delete('lastError');
  await cacheAccess(env, tok);
  return html('<h2>Connected ✓</h2><p>You can close this tab and go back to the app.</p>');
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

async function cacheAccess(env, tok) {
  if (tok.access_token) await env.TOKENS.put('accessToken', tok.access_token, { expirationTtl: Math.max(60, (tok.expires_in || 3600) - 120) });
}

async function accessToken(env) {
  const cached = await env.TOKENS.get('accessToken');
  if (cached) return cached;
  const refresh = await env.TOKENS.get('refreshToken');
  if (!refresh) throw fail('Not connected to Google Health yet. Connect it from Settings.', 409);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (tok.error === 'invalid_grant') {
      await env.TOKENS.delete('refreshToken');
      throw fail('Google expired or revoked the connection. Please reconnect Google Health.', 401);
    }
    throw fail(`Google token refresh failed: ${tok.error_description || tok.error || res.status}`);
  }
  if (tok.refresh_token) await env.TOKENS.put('refreshToken', tok.refresh_token); // rotation, if Google sends one
  await cacheAccess(env, tok);
  return tok.access_token;
}

async function status(env) {
  return {
    connected: !!(await env.TOKENS.get('refreshToken')),
    lastError: (await env.TOKENS.get('lastError')) || null,
    scopes: (await env.TOKENS.get('grantedScopes')) || null,
  };
}

/* ---------------- Google Health calls ---------------- */

async function g(env, path, init = {}) {
  const token = await accessToken(env);
  const res = await fetch(`${HEALTH}/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = body.error?.message || body.raw || res.statusText;
    if (res.status === 401) await env.TOKENS.delete('accessToken');
    throw fail(`Google Health ${res.status}: ${String(msg).slice(0, 300)}`, res.status === 401 ? 401 : 502);
  }
  return body;
}

const civil = s => { const [year, month, day] = s.split('-').map(Number); return { date: { year, month, day }, time: {} }; };
const dateOf = c => { const d = c?.date || c; return d && d.year ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : null; };
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Google caps some data types at 14 days per request, so walk the range in chunks.
async function dailyRollUp(env, type, from, to, chunk) {
  const out = [];
  for (let start = from; start <= to; start = addDays(start, chunk)) {
    let end = addDays(start, chunk); // end is exclusive
    const stop = addDays(to, 1);
    if (end > stop) end = stop;
    let pageToken;
    do {
      const body = { range: { start: civil(start), end: civil(end) }, windowSizeDays: 1 };
      if (pageToken) body.pageToken = pageToken;
      const r = await g(env, `${type}/dataPoints:dailyRollUp`, { method: 'POST', body: JSON.stringify(body) });
      out.push(...(r.rollupDataPoints || r.rollUpDataPoints || r.rollup_data_points || []));
      pageToken = r.nextPageToken;
    } while (pageToken);
  }
  return out;
}

// Pull a number out of a rollup value whose exact field names aren't pinned down in the public docs.
export function pickNumber(obj, preferred) {
  if (obj == null) return null;
  if (typeof obj === 'number') return obj;
  if (typeof obj === 'string' && obj.trim() !== '' && !isNaN(+obj)) return +obj; // int64 arrives as a string
  if (typeof obj !== 'object') return null;
  for (const k of preferred) if (k in obj) { const v = pickNumber(obj[k], preferred); if (v !== null) return v; }
  for (const k of Object.keys(obj)) { const v = pickNumber(obj[k], preferred); if (v !== null) return v; }
  return null;
}
export const rollValue = (p, keys, preferred) => {
  for (const k of keys) if (p[k] != null) return pickNumber(p[k], preferred);
  return null;
};

async function listAll(env, type, filter) {
  const out = [];
  let pageToken;
  do {
    const q = new URLSearchParams({ filter, pageSize: '1000' });
    if (pageToken) q.set('pageToken', pageToken);
    const r = await g(env, `${type}/dataPoints?${q}`);
    out.push(...(r.dataPoints || []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

export function sleepByDay(points) {
  const days = {};
  for (const p of points) {
    const s = p.sleep; if (!s) continue;
    const end = s.interval?.endTime; if (!end) continue;
    // Local date of the wake-up time, using the offset the device recorded.
    const offset = parseInt(String(s.interval.endUtcOffset || '0').replace('s', ''), 10) || 0;
    const date = new Date(new Date(end).getTime() + offset * 1000).toISOString().slice(0, 10);
    const d = days[date] || (days[date] = { sleepMinutes: 0, sleepDeepMin: 0, sleepRemMin: 0, sleepLightMin: 0 });
    d.sleepMinutes += Number(s.summary?.minutesAsleep || 0);
    for (const st of s.summary?.stagesSummary || []) {
      const m = Number(st.minutes || 0);
      if (st.type === 'DEEP') d.sleepDeepMin += m;
      else if (st.type === 'REM') d.sleepRemMin += m;
      else if (st.type === 'LIGHT') d.sleepLightMin += m;
    }
  }
  return days;
}

async function days(env, url) {
  const from = url.searchParams.get('from'), to = url.searchParams.get('to');
  if (!/^\d{4}-\d\d-\d\d$/.test(from || '') || !/^\d{4}-\d\d-\d\d$/.test(to || '') || from > to) throw fail('Bad date range.', 400);
  const outDays = {}, errors = [];
  const put = (date, vals) => { if (date) outDays[date] = Object.assign(outDays[date] || {}, vals); };
  let needsReconnect = false;

  const jobs = [
    ['steps', async () => {
      for (const p of await dailyRollUp(env, 'steps', from, to, 30)) {
        const v = rollValue(p, ['steps'], ['countSum', 'count_sum', 'count']);
        if (v !== null) put(dateOf(p.civilStartTime || p.civil_start_time), { steps: v });
      }
    }],
    ['calories', async () => {
      for (const p of await dailyRollUp(env, 'total-calories', from, to, 14)) {
        const v = rollValue(p, ['totalCalories', 'total_calories'], ['kcalSum', 'kcal_sum', 'kcal']);
        if (v !== null) put(dateOf(p.civilStartTime || p.civil_start_time), { caloriesOut: v });
      }
    }],
    ['sleep', async () => {
      const filter = `sleep.interval.end_time >= "${addDays(from, -1)}T00:00:00Z" AND sleep.interval.end_time < "${addDays(to, 2)}T00:00:00Z"`;
      const byDay = sleepByDay(await listAll(env, 'sleep', filter));
      for (const [date, v] of Object.entries(byDay)) if (date >= from && date <= to) put(date, v);
    }],
    ['resting heart rate', async () => {
      const filter = `daily_resting_heart_rate.date >= "${from}" AND daily_resting_heart_rate.date <= "${to}"`;
      for (const p of await listAll(env, 'daily-resting-heart-rate', filter)) {
        const r = p.dailyRestingHeartRate; const date = dateOf(r?.date);
        const bpm = pickNumber(r?.beatsPerMinute, []);
        if (date && bpm !== null) put(date, { restingHr: bpm });
      }
    }],
  ];

  // Run one after another: the personal rate limit is unknown and this is a single-user app.
  for (const [type, fn] of jobs) {
    try { await fn(); } catch (e) {
      errors.push({ type, message: e.message });
      if (/reconnect|Not connected/i.test(e.message)) { needsReconnect = true; break; }
    }
  }
  if (errors.length) await setLastError(env, errors.map(e => `${e.type}: ${e.message}`).join(' | '));
  else await env.TOKENS.delete('lastError');
  return { days: outDays, errors, needsReconnect };
}

async function raw(env, url) {
  const type = url.searchParams.get('type'), from = url.searchParams.get('from'), to = url.searchParams.get('to');
  if (!/^[a-z-]+$/.test(type || '') || !from || !to) throw fail('Need type, from, to.', 400);
  const rollUps = ['steps', 'total-calories'];
  if (rollUps.includes(type)) {
    return g(env, `${type}/dataPoints:dailyRollUp`, { method: 'POST', body: JSON.stringify({ range: { start: civil(from), end: civil(addDays(to, 1)) }, windowSizeDays: 1 }) });
  }
  const field = { sleep: 'sleep.interval.end_time', 'daily-resting-heart-rate': 'daily_resting_heart_rate.date' }[type];
  if (!field) throw fail('Unsupported type for raw.', 400);
  const isDate = type === 'daily-resting-heart-rate';
  const lo = isDate ? from : `${from}T00:00:00Z`, hi = isDate ? to : `${addDays(to, 1)}T00:00:00Z`;
  return g(env, `${type}/dataPoints?${new URLSearchParams({ filter: `${field} >= "${lo}" AND ${field} <= "${hi}"`, pageSize: '50' })}`);
}
