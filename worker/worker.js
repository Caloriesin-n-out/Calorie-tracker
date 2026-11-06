// Cloudflare Worker: Google Health API proxy for the app hosted on GitHub Pages
//
// Secrets (wrangler secret put):  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_KEY
// KV binding:                     TOKENS
// Vars (wrangler.toml):           ALLOWED_ORIGIN (the Pages address), optional SCOPES (space-separated, overrides DEFAULT_SCOPES)
//
// Routes
//   GET  /auth/start      -> passphrase page, then redirect to Google consent (?service=calendar for Calendar, default Health)
//   POST /auth/start      -> (form submit) validates APP_KEY, redirects to Google
//   GET  /auth/callback   -> exchanges code, stores the refresh token in KV
//   GET  /api/status      -> { connected, lastError }
//   GET  /api/days        -> ?from=YYYY-MM-DD&to=YYYY-MM-DD, per-day steps/calories/sleep/resting HR
//   GET  /api/raw         -> ?type=steps&from=..&to=.. raw Google response, for debugging shapes
//   GET  /api/calendar    -> ?from=<ISO time>&to=<ISO time>, events from your selected Google calendars (read only)
//   GET  /api/tasks       -> ?date=YYYY-MM-DD, open Notion tasks plus the ones completed on that date
//   POST /api/tasks/done | /api/tasks/reopen | /api/tasks/add   -> change Notion tasks
//   POST /api/brief       -> {emails:[...]}, matches meeting attendees to People in your Notion CRM (read only)
//   POST /api/calendar/add -> create an event on your primary calendar
//   GET  /api/mail/inbox  -> unread Primary mail (read only), marked when the sender is in your CRM
//   POST /api/mail/threads -> {emails:[...]}, recent mail with those people (read only)
//   POST /api/mail/message -> {id}, the readable text of one mail (read only, not stored)
//   POST /api/meetings/new -> create a meeting note in your Notion Meetings database
//   POST /api/restaurants/list | update | add | archive -> favourites and wishlist places (Mesa app; wishlist = places not visited yet)
//   POST /api/visits/list | add | delete -> the visit log (Mesa Visits database): date, what you ate, score; keeps each restaurant's Visits and Last visit up to date
//   POST /api/bookings/scan -> {days?}, reads booking emails (CoverManager, Myrestoo, TheFork) and adds, moves or removes the calendar events
//   POST /api/restaurants/share -> {text, url}, add a place shared from Google Maps to the wishlist (skips places already listed)
//   POST /api/crypto/search -> {symbols:[...]}, CoinMarketCap coins for those tickers (best rank first)
//   POST /api/crypto/quotes -> {ids:[...]}, latest USD price and 24h change from CoinMarketCap (cached 60 s)
// CoinMarketCap (optional): secret CMC_API_KEY (a free key from pro.coinmarketcap.com).
// Everything under /api needs the X-App-Key header.
// Notion (optional): secret NOTION_TOKEN (an internal integration shared with the databases), vars NOTION_TASKS_DB, NOTION_PEOPLE_DB, NOTION_MEETINGS_DB, NOTION_RESTAURANTS_DB.

const HEALTH = 'https://health.googleapis.com/v4/users/me/dataTypes';
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
];
// Calendar needs its own Google login: the Health API rejects any token that also carries a non-health scope
// ("Request contains disallowed OAuth scope(s)"), so the two are connected and stored separately.
// One login covers Calendar (read + add events) and Gmail (read only).
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
];
const keys = service => (service === 'calendar'
  ? { refresh: 'refreshToken:calendar', access: 'accessToken:calendar', scopes: 'grantedScopes:calendar', label: 'Google Calendar and Gmail' }
  : { refresh: 'refreshToken', access: 'accessToken', scopes: 'grantedScopes', label: 'Google Health' });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors(request, env), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400' } });
    try {
      if (url.pathname === '/auth/start') return authStart(request, env, url);
      if (url.pathname === '/auth/callback') return authCallback(env, url);
      if (url.pathname.startsWith('/api/')) {
        if (!(await keyOk(request.headers.get('X-App-Key'), env.APP_KEY))) return json({ error: 'Wrong or missing app key.' }, 401, request, env);
        if (url.pathname === '/api/status') return json(await status(env), 200, request, env);
        if (url.pathname === '/api/days') return json(await days(env, url), 200, request, env);
        if (url.pathname === '/api/raw') return json(await raw(env, url), 200, request, env);
        if (url.pathname === '/api/foods') return json(await foods(url), 200, request, env);
        if (url.pathname === '/api/calendar') return json(await calendar(env, url), 200, request, env);
        if (url.pathname === '/api/tasks') return json(await tasks(env, url), 200, request, env);
        if (url.pathname === '/api/mail/inbox') return json(await mailInbox(env), 200, request, env);
        if (['/api/mail/threads', '/api/mail/message', '/api/calendar/add', '/api/meetings/new', '/api/crypto/search', '/api/crypto/quotes', '/api/restaurants/list', '/api/restaurants/update', '/api/restaurants/add', '/api/restaurants/archive', '/api/restaurants/share', '/api/visits/list', '/api/visits/add', '/api/visits/delete', '/api/bookings/scan'].includes(url.pathname)) {
          if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, request, env);
          const body = await request.json().catch(() => ({}));
          const fn = { '/api/mail/threads': mailThreads, '/api/mail/message': mailMessage, '/api/calendar/add': calendarAdd, '/api/meetings/new': newMeeting, '/api/crypto/search': cryptoSearch, '/api/crypto/quotes': cryptoQuotes,
            '/api/restaurants/list': restaurantList, '/api/restaurants/update': restaurantUpdate, '/api/restaurants/add': restaurantAdd, '/api/restaurants/archive': restaurantArchive, '/api/restaurants/share': restaurantShare, '/api/visits/list': visitList, '/api/visits/add': visitAdd, '/api/visits/delete': visitDelete, '/api/bookings/scan': bookingsScan }[url.pathname];
          return json(await fn(env, body), 200, request, env);
        }
        if (url.pathname === '/api/brief') {
          if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, request, env);
          return json(await brief(env, await request.json().catch(() => ({}))), 200, request, env);
        }
        if (url.pathname.startsWith('/api/tasks/')) {
          if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, request, env);
          const body = await request.json().catch(() => ({}));
          return json(await taskAction(env, url.pathname.slice('/api/tasks/'.length), body), 200, request, env);
        }
        return json({ error: 'Not found' }, 404, request, env);
      }
      return html('<h2>Calorie tracker API</h2><p>This address only serves data to the app. Open the app from your home screen.</p>');
    } catch (e) {
      if (!e.quiet) await setLastError(env, e.message); // calendar and Notion problems must not look like a Fitbit sync failure
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
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'X-App-Key, Content-Type', Vary: 'Origin' };
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
const scopes = (env, service) => (service === 'calendar' ? CALENDAR_SCOPES.join(' ') : (env.SCOPES || DEFAULT_SCOPES.join(' ')));
const redirectUri = url => `${url.origin}/auth/callback`;
const fail = (msg, status = 502, quiet = false) => Object.assign(new Error(msg), { status, quiet });

async function setLastError(env, msg) { try { await env.TOKENS.put('lastError', `${new Date().toISOString()} ${msg}`); } catch { /* ignore */ } }

/* ---------------- OAuth ---------------- */

async function authStart(request, env, url) {
  if (request.method === 'POST') {
    const form = await request.formData();
    const service = form.get('service') === 'calendar' ? 'calendar' : 'health';
    if (!(await keyOk(form.get('key'), env.APP_KEY))) return html(`<p>Wrong app key.</p><p><a href="/auth/start?service=${service}">Try again</a></p>`, 401);
    const state = crypto.randomUUID();
    await env.TOKENS.put(`state:${state}`, service, { expirationTtl: 600 });
    const q = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(url),
      response_type: 'code',
      scope: scopes(env, service),
      access_type: 'offline',
      prompt: 'consent', // always hand back a refresh token, including when reconnecting
      state,
    });
    return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, 302);
  }
  const service = url.searchParams.get('service') === 'calendar' ? 'calendar' : 'health';
  return html(`<h2>Connect ${keys(service).label}</h2>
    <p>Enter your app key to continue to Google.</p>
    <form method=post><input type=hidden name=service value="${service}"><input name=key type=password autofocus style="width:100%;padding:12px;font-size:16px;box-sizing:border-box">
    <p><button style="padding:12px 18px;font-size:16px">Continue</button></p></form>`);
}

async function authCallback(env, url) {
  const err = url.searchParams.get('error');
  if (err) return html(`<h2>Google said no</h2><p>${esc(err)}</p>`, 400);
  const state = url.searchParams.get('state'), code = url.searchParams.get('code');
  const stored = state && code ? await env.TOKENS.get(`state:${state}`) : null;
  if (!stored) return html('<h2>Link expired</h2><p>Start again from the app.</p>', 400);
  const service = stored === 'calendar' ? 'calendar' : 'health', K = keys(service);
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
  await env.TOKENS.put(K.refresh, tok.refresh_token);
  await env.TOKENS.put(K.scopes, tok.scope || '');
  await env.TOKENS.delete(K.access); // never keep a cached access token from an older connection
  if (service === 'health') await env.TOKENS.delete('lastError');
  await cacheAccess(env, tok, service);
  return html(`<h2>${K.label} connected ✓</h2><p>You can close this tab and go back to the app.</p>`);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

async function cacheAccess(env, tok, service = 'health') {
  if (tok.access_token) await env.TOKENS.put(keys(service).access, tok.access_token, { expirationTtl: Math.max(60, (tok.expires_in || 3600) - 120) });
}

async function accessToken(env, service = 'health') {
  const K = keys(service);
  const cached = await env.TOKENS.get(K.access);
  if (cached) return cached;
  const refresh = await env.TOKENS.get(K.refresh);
  if (!refresh) throw fail(`Not connected to ${K.label} yet. Connect it from Settings.`, 409, service === 'calendar');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (tok.error === 'invalid_grant') {
      await env.TOKENS.delete(K.refresh);
      throw fail(`Google expired or revoked the connection. Please reconnect ${K.label}.`, 401, service === 'calendar');
    }
    throw fail(`Google token refresh failed: ${tok.error_description || tok.error || res.status}`, 502, service === 'calendar');
  }
  if (tok.refresh_token) await env.TOKENS.put(K.refresh, tok.refresh_token); // rotation, if Google sends one
  await cacheAccess(env, tok, service);
  return tok.access_token;
}

async function status(env) {
  return {
    connected: !!(await env.TOKENS.get('refreshToken')),
    lastError: (await env.TOKENS.get('lastError')) || null,
    scopes: (await env.TOKENS.get('grantedScopes')) || null,
    calendarConnected: !!(await env.TOKENS.get('refreshToken:calendar')),
    calendarScopes: (await env.TOKENS.get('grantedScopes:calendar')) || null,
    notion: !!(env.NOTION_TOKEN && env.NOTION_TASKS_DB),
    meetingsDb: !!env.NOTION_MEETINGS_DB,
    restaurantsDb: !!env.NOTION_RESTAURANTS_DB,
    visitsDb: !!env.NOTION_VISITS_DB,
    crypto: !!env.CMC_API_KEY,
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

// List filters use underscores for the type, only >= and an exclusive < upper bound.
export const dateFilter = (field, from, to) => `${field}.date >= "${from}" AND ${field}.date < "${addDays(to, 1)}"`;
export const civilFilter = (field, from, to) => `${field}.sample_time.civil_time >= "${from}" AND ${field}.sample_time.civil_time < "${addDays(to, 1)}"`;

// Sample types (weight, body fat) can have several readings a day: keep the latest one per local date.
export function sampleByDay(points, key, pick, outKey) {
  const best = {};
  for (const p of points) {
    const s = p[key]; if (!s) continue;
    const v = pick(s); if (v === null || isNaN(v)) continue;
    const civil = s.sampleTime?.civilTime, date = dateOf(civil?.date);
    if (!date) continue;
    const t = s.sampleTime?.physicalTime || '';
    if (!best[date] || t > best[date].t) best[date] = { t, v };
  }
  return Object.fromEntries(Object.entries(best).map(([d, b]) => [d, { [outKey]: Math.round(b.v * 10) / 10 }]));
}
function put2(put, byDay) { for (const [d, v] of Object.entries(byDay)) put(d, v); }

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
      // Google rejects <= on this filter; use >= and an exclusive upper bound like the other types.
      const filter = `daily_resting_heart_rate.date >= "${from}" AND daily_resting_heart_rate.date < "${addDays(to, 1)}"`;
      for (const p of await listAll(env, 'daily-resting-heart-rate', filter)) {
        const r = p.dailyRestingHeartRate; const date = dateOf(r?.date);
        const bpm = pickNumber(r?.beatsPerMinute, []);
        if (date && bpm !== null) put(date, { restingHr: bpm });
      }
    }],
    ['active calories', async () => {
      for (const p of await dailyRollUp(env, 'active-energy-burned', from, to, 14)) {
        const v = rollValue(p, ['activeEnergyBurned', 'active_energy_burned'], ['kcalSum', 'kcal_sum', 'kcal']);
        if (v !== null) put(dateOf(p.civilStartTime || p.civil_start_time), { activeKcal: v });
      }
    }],
    ['weight', async () => put2(put, sampleByDay(await listAll(env, 'weight', civilFilter('weight', from, to)), 'weight', p => p.weightGrams != null ? Number(p.weightGrams) / 1000 : null, 'weightKg'))],
    ['body fat', async () => put2(put, sampleByDay(await listAll(env, 'body-fat', civilFilter('body_fat', from, to)), 'bodyFat', p => p.percentage != null ? Number(p.percentage) : null, 'bodyFatPct'))],
    ['heart rate variability', async () => {
      for (const p of await listAll(env, 'daily-heart-rate-variability', dateFilter('daily_heart_rate_variability', from, to))) {
        const r = p.dailyHeartRateVariability, date = dateOf(r?.date), v = pickNumber(r?.averageHeartRateVariabilityMilliseconds, []);
        if (date && v !== null) put(date, { hrv: v });
      }
    }],
    ['breathing rate', async () => {
      for (const p of await listAll(env, 'daily-respiratory-rate', dateFilter('daily_respiratory_rate', from, to))) {
        const r = p.dailyRespiratoryRate, date = dateOf(r?.date), v = pickNumber(r?.breathsPerMinute, []);
        if (date && v !== null) put(date, { breathingRate: v });
      }
    }],
    ['blood oxygen', async () => {
      for (const p of await listAll(env, 'daily-oxygen-saturation', dateFilter('daily_oxygen_saturation', from, to))) {
        const r = p.dailyOxygenSaturation, date = dateOf(r?.date), v = pickNumber(r?.averagePercentage, []);
        if (date && v !== null) put(date, { spo2: v });
      }
    }],
    ['skin temperature', async () => {
      for (const p of await listAll(env, 'daily-sleep-temperature-derivations', dateFilter('daily_sleep_temperature_derivations', from, to))) {
        const r = p.dailySleepTemperatureDerivations, date = dateOf(r?.date);
        const night = pickNumber(r?.nightlyTemperatureCelsius, []), base = pickNumber(r?.baselineTemperatureCelsius, []);
        if (date && night !== null && base !== null) put(date, { skinTempDelta: Math.round((night - base) * 100) / 100 }); // °C above or below your own normal
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

/* ---------------- Google Calendar (read only) ---------------- */

async function gcal(env, path, init = {}) {
  const token = await accessToken(env, 'calendar');
  const res = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(body.error?.message || res.statusText), reason = body.error?.errors?.[0]?.reason || '';
    if (res.status === 401) { await env.TOKENS.delete('accessToken:calendar'); throw fail('Google rejected the Calendar and Gmail login. Try again, or reconnect it.', 401, true); }
    if (res.status === 403 && /accessNotConfigured|has not been used|is disabled/i.test(`${reason} ${msg}`)) throw fail('The Google Calendar API is not switched on in your Google Cloud project yet.', 403, true);
    if (res.status === 403 && /insufficient|scope/i.test(`${reason} ${msg}`)) throw fail('Calendar permission is missing. Tap Connect Google (Calendar and Gmail) and approve it.', 403, true);
    throw fail(`Google Calendar ${res.status}: ${msg.slice(0, 200)}`, 502, true);
  }
  return body;
}

// Calendar descriptions are often HTML; the app only wants readable text.
export function htmlToText(s) {
  return String(s || '')
    .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '\n• ').replace(/<\/?(p|div|li|ul|ol|h\d|tr)[^>]*>/gi, '\n')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (m, h, t) => (t.replace(/<[^>]+>/g, '').trim() === h ? h : `${t.replace(/<[^>]+>/g, '')} (${h})`))
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
}

export function mapEvent(ev, calName) {
  const self = (ev.attendees || []).find(a => a.self);
  if (ev.status === 'cancelled' || self?.responseStatus === 'declined' || ev.eventType === 'workingLocation') return null;
  const video = ev.hangoutLink || (ev.conferenceData?.entryPoints || []).find(e => e.entryPointType === 'video')?.uri || null;
  return {
    id: ev.id, uid: ev.iCalUID || ev.id, calendar: calName,
    title: ev.summary || '(no title)',
    start: ev.start?.dateTime || ev.start?.date || null, end: ev.end?.dateTime || ev.end?.date || null, allDay: !!ev.start?.date,
    location: ev.location || '', description: htmlToText(ev.description).slice(0, 2000), video, link: ev.htmlLink || null,
    response: self?.responseStatus || null, busy: ev.transparency !== 'transparent', recurring: !!ev.recurringEventId,
    organizer: ev.organizer?.displayName || ev.organizer?.email || '',
    attendees: (ev.attendees || []).filter(a => !a.resource).slice(0, 15).map(a => ({ name: a.displayName || a.email || '', email: a.email || '', response: a.responseStatus || 'needsAction', self: !!a.self, organizer: !!a.organizer, optional: !!a.optional })),
    attendeeCount: (ev.attendees || []).filter(a => !a.resource).length,
  };
}

async function calendar(env, url) {
  const from = url.searchParams.get('from'), to = url.searchParams.get('to');
  const f = Date.parse(from || ''), t = Date.parse(to || '');
  if (isNaN(f) || isNaN(t) || t <= f || t - f > 8 * 86400e3) throw fail('Bad time range.', 400, true);
  const list = await gcal(env, 'users/me/calendarList?minAccessRole=reader&maxResults=50');
  const cals = (list.items || []).filter(c => (c.selected || c.primary) && !c.deleted && !c.hidden).slice(0, 12);
  const seen = new Set(), events = [], errors = [];
  const fields = 'items(id,iCalUID,status,summary,description,location,start,end,attendees(displayName,email,responseStatus,self,organizer,optional,resource),organizer,hangoutLink,conferenceData(entryPoints(entryPointType,uri)),htmlLink,eventType,recurringEventId,transparency)';
  for (const c of cals) {
    try {
      const q = new URLSearchParams({ timeMin: new Date(f).toISOString(), timeMax: new Date(t).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '100', fields });
      const r = await gcal(env, `calendars/${encodeURIComponent(c.id)}/events?${q}`);
      for (const ev of r.items || []) {
        const m = mapEvent(ev, c.summaryOverride || c.summary || '');
        if (!m || !m.start) continue;
        const key = `${m.uid}|${m.start}`; // the same meeting can sit on two of your calendars
        if (seen.has(key)) continue;
        seen.add(key); events.push(m);
      }
    } catch (e) {
      if (/permission is missing|not switched on|rejected the calendar login|Not connected|reconnect/i.test(e.message)) throw e;
      errors.push({ calendar: c.summary || c.id, message: e.message });
    }
  }
  events.sort((a, b) => (b.allDay - a.allDay) || (Date.parse(a.start) - Date.parse(b.start)));
  return { events, errors, calendars: cals.map(c => c.summaryOverride || c.summary) };
}

/* ---------------- Notion tasks ---------------- */

async function notion(env, path, method = 'GET', body) {
  if (!env.NOTION_TOKEN || !env.NOTION_TASKS_DB) throw fail('Notion is not set up on the Worker yet.', 409, true);
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = res.status === 404 ? ' Did you share the task database with your integration?' : res.status === 401 ? ' The Notion token was rejected.' : '';
    throw fail(`Notion ${res.status}: ${String(data.message || res.statusText).slice(0, 200)}${hint}`, 502, true);
  }
  return data;
}

export function mapTask(p) {
  const pr = p.properties || {}, text = a => (a || []).map(t => t.plain_text).join('');
  return {
    id: p.id, title: text(pr.Name?.title).trim() || '(untitled)', status: pr.Status?.status?.name || '',
    due: pr['Due Date']?.date?.start || null, done: pr['Completion Date']?.date?.start || null,
    types: (pr.Type?.multi_select || []).map(o => o.name), tags: (pr.Tags?.multi_select || []).map(o => o.name),
    waiting: !!pr['Waiting on']?.checkbox, next: text(pr['Next Step']?.rich_text).trim(), url: p.url,
    people: (pr.Person?.relation || []).map(r => r.id),
    crm: (pr.Person?.relation || []).length > 0 || (pr['Company (direct)']?.relation || []).length > 0,
  };
}

async function queryTasks(env, filter, sorts, max = 200) {
  const out = [];
  let cursor;
  do {
    const r = await notion(env, `databases/${env.NOTION_TASKS_DB}/query`, 'POST', { filter, sorts, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    out.push(...(r.results || []).map(mapTask));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor && out.length < max);
  return out;
}

async function tasks(env, url) {
  const date = url.searchParams.get('date');
  if (!/^\d{4}-\d\d-\d\d$/.test(date || '')) throw fail('Bad date.', 400, true);
  // "Open" matches the views in the task database: Not started and In progress. Backlog and Done are left out.
  const open = await queryTasks(env,
    { and: [{ property: 'Status', status: { does_not_equal: 'Done' } }, { property: 'Status', status: { does_not_equal: 'Backlog' } }] },
    [{ property: 'Due Date', direction: 'ascending' }]);
  const doneOn = await queryTasks(env, { property: 'Completion Date', date: { equals: date } }, undefined, 100);
  return { open, doneOn };
}

const TASK_STATUS = ['Not started', 'In progress'];
const TASK_TYPES = ['Personal', 'Work', 'Advisory'];
const isPageId = s => /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(s || '');
const isDate = s => /^\d{4}-\d\d-\d\d$/.test(s || '');

async function taskAction(env, action, b) {
  if (action === 'done') {
    if (!isPageId(b.id) || !isDate(b.date)) throw fail('Need a task id and a date.', 400, true);
    const p = await notion(env, `pages/${b.id}`, 'PATCH', { properties: { Status: { status: { name: 'Done' } }, 'Completion Date': { date: { start: b.date } } } });
    return { task: mapTask(p) };
  }
  if (action === 'reopen') {
    const status = TASK_STATUS.includes(b.status) ? b.status : 'Not started';
    if (!isPageId(b.id)) throw fail('Need a task id.', 400, true);
    const p = await notion(env, `pages/${b.id}`, 'PATCH', { properties: { Status: { status: { name: status } }, 'Completion Date': { date: null } } });
    return { task: mapTask(p) };
  }
  if (action === 'add') {
    const title = String(b.title || '').trim();
    if (!title || title.length > 200) throw fail('Give the task a title (up to 200 characters).', 400, true);
    const properties = { Name: { title: [{ text: { content: title } }] } };
    if (b.due) { if (!isDate(b.due)) throw fail('Bad due date.', 400, true); properties['Due Date'] = { date: { start: b.due } }; }
    if (b.type) { if (!TASK_TYPES.includes(b.type)) throw fail('Unknown type.', 400, true); properties.Type = { multi_select: [{ name: b.type }] }; }
    if (b.notes) properties.Notes = { rich_text: [{ text: { content: String(b.notes).slice(0, 1900) } }] };
    if (b.person) { if (!isPageId(b.person)) throw fail('Bad person id.', 400, true); properties.Person = { relation: [{ id: b.person }] }; }
    const p = await notion(env, 'pages', 'POST', { parent: { database_id: env.NOTION_TASKS_DB }, properties });
    return { task: mapTask(p) };
  }
  throw fail('Not found', 404, true);
}

/* ---------------- CRM briefing (People in Notion) ---------------- */

export function mapPerson(p) {
  const pr = p.properties || {}, text = a => (a || []).map(t => t.plain_text).join('').trim();
  const fdate = x => x?.formula?.date?.start || x?.formula?.string || null;
  return {
    id: p.id, url: p.url, name: text(pr.Name?.title), email: String(pr.Email?.email || '').toLowerCase(), role: text(pr.Role?.rich_text),
    companyIds: (pr.Company?.relation || []).map(r => r.id), tier: pr.Tier?.select?.name || '',
    summary: text(pr['History summary']?.rich_text).slice(0, 700), how: text(pr['How We Know Each Other']?.rich_text).slice(0, 200),
    lastContacted: fdate(pr['Last Contacted']), followStatus: pr['Follow-up Status']?.formula?.string || '',
    nextFollowUp: pr['Next Follow-up']?.date?.start || null,
    latestInteraction: pr['Latest Interaction']?.rollup?.date?.start || null, latestMeeting: pr['Latest Meeting']?.rollup?.date?.start || null,
  };
}

async function brief(env, b) {
  if (!env.NOTION_PEOPLE_DB) throw fail('The CRM is not set up on the Worker yet (NOTION_PEOPLE_DB).', 409, true);
  const emails = [...new Set((Array.isArray(b.emails) ? b.emails : []).map(e => String(e).trim().toLowerCase()).filter(e => /^[^@\s]+@[^@\s]+$/.test(e) && e.length < 120))].slice(0, 15);
  if (!emails.length) return { people: [], unmatched: [] };
  const found = await notion(env, `databases/${env.NOTION_PEOPLE_DB}/query`, 'POST', {
    filter: { or: emails.map(e => ({ property: 'Email', email: { contains: e } })) }, page_size: 30,
  });
  const people = (found.results || []).map(mapPerson).filter(p => emails.includes(p.email));
  const matched = new Set(people.map(p => p.email));
  // Company names and open tasks, fetched together so one briefing stays well under the Worker's request limit.
  const companyIds = [...new Set(people.flatMap(p => p.companyIds))].slice(0, 8);
  const [companies, taskRes] = await Promise.all([
    Promise.all(companyIds.map(id => notion(env, `pages/${id}`).then(pg => [id, Object.values(pg.properties || {}).find(x => x.type === 'title')?.title?.map(t => t.plain_text).join('').trim() || ''], () => [id, '']))),
    people.length ? notion(env, `databases/${env.NOTION_TASKS_DB}/query`, 'POST', { filter: { and: [
      { or: people.map(p => ({ property: 'Person', relation: { contains: p.id } })) },
      { property: 'Status', status: { does_not_equal: 'Done' } }, { property: 'Status', status: { does_not_equal: 'Backlog' } }] }, page_size: 50 }) : { results: [] },
  ]);
  const names = Object.fromEntries(companies), tasks = (taskRes.results || []).map(mapTask);
  return {
    people: people.map(({ companyIds: ids, ...p }) => ({
      ...p, company: ids.map(i => names[i]).filter(Boolean).join(', '),
      tasks: tasks.filter(t => t.people.includes(p.id)).map(t => ({ id: t.id, title: t.title, due: t.due, status: t.status, waiting: t.waiting })),
    })),
    unmatched: emails.filter(e => !matched.has(e)),
  };
}

/* ---------------- add an event to Google Calendar ---------------- */

const isEmail = e => /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(e) && e.length < 120;

export function buildEvent(b) {
  const title = String(b.title || '').trim();
  if (!title || title.length > 200) throw fail('Give the event a title (up to 200 characters).', 400, true);
  const body = { summary: title };
  if (b.location) body.location = String(b.location).slice(0, 200);
  if (b.description) body.description = String(b.description).slice(0, 2000);
  if (b.allDay) {
    if (!/^\d{4}-\d\d-\d\d$/.test(b.start || '') || !/^\d{4}-\d\d-\d\d$/.test(b.end || '') || b.end <= b.start) throw fail('Bad dates for an all-day event.', 400, true);
    body.start = { date: b.start }; body.end = { date: b.end };
  } else {
    const s = Date.parse(b.start || ''), e = Date.parse(b.end || '');
    if (isNaN(s) || isNaN(e) || e <= s || e - s > 14 * 86400e3) throw fail('Bad start or end time.', 400, true);
    const tz = /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+){0,2}$/.test(b.timeZone || '') ? b.timeZone : undefined;
    body.start = { dateTime: new Date(s).toISOString(), ...(tz ? { timeZone: tz } : {}) };
    body.end = { dateTime: new Date(e).toISOString(), ...(tz ? { timeZone: tz } : {}) };
  }
  const guests = [...new Set((Array.isArray(b.guests) ? b.guests : []).map(g => String(g).trim().toLowerCase()).filter(Boolean))];
  if (guests.length > 20 || guests.some(g => !isEmail(g))) throw fail('Check the guest email addresses (up to 20).', 400, true);
  if (guests.length) body.attendees = guests.map(email => ({ email }));
  if (b.meet) body.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  // Invitations go out only when you added guests; an event for yourself never emails anyone.
  return { body, query: `conferenceDataVersion=1&sendUpdates=${guests.length ? 'all' : 'none'}` };
}

async function calendarAdd(env, b) {
  const { body, query } = buildEvent(b);
  const ev = await gcal(env, `calendars/primary/events?${query}`, { method: 'POST', body: JSON.stringify(body) });
  return { event: mapEvent(ev, 'Calendar') || { id: ev.id, title: body.summary } };
}

/* ---------------- Gmail (read only) ---------------- */

async function ggmail(env, path) {
  const token = await accessToken(env, 'calendar');
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(body.error?.message || res.statusText);
    if (res.status === 401) { await env.TOKENS.delete('accessToken:calendar'); throw fail('Google rejected the Calendar and Gmail login. Try again, or reconnect it.', 401, true); }
    if (res.status === 403 && /has not been used|is disabled|accessNotConfigured/i.test(msg)) throw fail('The Gmail API is not switched on in your Google Cloud project yet.', 403, true);
    if (res.status === 403 && /insufficient|scope/i.test(msg)) throw fail('Gmail permission is missing. Tap Connect Google (Calendar and Gmail) and approve it.', 403, true);
    throw fail(`Gmail ${res.status}: ${msg.slice(0, 200)}`, 502, true);
  }
  return body;
}

export function decodeEntities(s) {
  return String(s || '').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
}
export function parseFrom(h) {
  const raw = String(h || '').trim(), m = /^"?([^"<]*?)"?\s*<([^>]+)>$/.exec(raw);
  if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim().toLowerCase() };
  return { name: raw, email: raw.toLowerCase() };
}
export function mapMail(m) {
  const hdr = n => (m.payload?.headers || []).find(h => h.name.toLowerCase() === n)?.value || '';
  const from = parseFrom(hdr('from'));
  return {
    id: m.id, threadId: m.threadId, from, to: hdr('to').toLowerCase(), subject: decodeEntities(hdr('subject')) || '(no subject)', snippet: decodeEntities(m.snippet).slice(0, 220),
    at: Number(m.internalDate) || 0, starred: (m.labelIds || []).includes('STARRED'), unread: (m.labelIds || []).includes('UNREAD'),
  };
}
const gmailMeta = (env, id) => ggmail(env, `users/me/messages/${encodeURIComponent(id)}?${new URLSearchParams([['format', 'metadata'], ['metadataHeaders', 'From'], ['metadataHeaders', 'To'], ['metadataHeaders', 'Subject'], ['fields', 'id,threadId,labelIds,snippet,internalDate,payload/headers']])}`).then(mapMail);

// Which of these addresses are people in the Notion CRM? Quietly returns nothing when Notion is not set up.
async function crmMatch(env, emails) {
  if (!env.NOTION_TOKEN || !env.NOTION_PEOPLE_DB || !emails.length) return {};
  try {
    const found = await notion(env, `databases/${env.NOTION_PEOPLE_DB}/query`, 'POST', { filter: { or: emails.slice(0, 40).map(e => ({ property: 'Email', email: { contains: e } })) }, page_size: 50 });
    const out = {};
    for (const p of (found.results || []).map(mapPerson)) if (p.email && emails.includes(p.email)) out[p.email] = { id: p.id, name: p.name, tier: p.tier };
    return out;
  } catch { return {}; }
}

// Only what Gmail files under Primary: social, promotions, updates and forums mail is left out, so LinkedIn and similar stay away.
// Excluding categories (instead of asking for "primary") also works when the inbox tabs are switched off.
const PRIMARY_ONLY = '-category:social -category:promotions -category:updates -category:forums';
async function mailInbox(env) {
  const q = new URLSearchParams([['labelIds', 'INBOX'], ['labelIds', 'UNREAD'], ['maxResults', '20'], ['q', PRIMARY_ONLY]]);
  const [list, profile] = await Promise.all([ggmail(env, `users/me/messages?${q}`), ggmail(env, 'users/me/profile')]);
  const messages = await Promise.all((list.messages || []).slice(0, 20).map(m => gmailMeta(env, m.id)));
  const crm = await crmMatch(env, [...new Set(messages.map(m => m.from.email))]);
  return {
    account: profile.emailAddress || '',
    unread: list.nextPageToken ? (list.resultSizeEstimate || messages.length) : messages.length,
    messages: messages.map(m => ({ ...m, crm: crm[m.from.email] || null })),
  };
}


// One mail's readable text for the inline view. Quoted history is cut and the result is capped, so it stays a quick read.
export function b64url(s) {
  try { const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); } catch { return ''; }
}
export function cleanBody(raw, max = 1800) {
  let t = '\n' + String(raw || '').replace(/\r\n/g, '\n');
  for (const m of [/\nOn .{5,160} wrote:\s*\n/i, /\nEl .{5,160} escribi[oó]:\s*\n/i, /\n-{2,}\s*(Original Message|Mensaje original)\s*-{2,}/i, /\nFrom:\s.+\n(Sent|Date):\s/i, /\n_{8,}\n/]) {
    const i = t.search(m); if (i >= 0 && t.slice(0, i).trim().length >= 2) t = t.slice(0, i); // never cut a mail down to nothing
  }
  t = t.split('\n').filter(l => !/^\s*>/.test(l)).join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  let truncated = false;
  if (t.length > max) { t = t.slice(0, max).replace(/\s+\S*$/, ''); truncated = true; }
  return { text: t, truncated };
}
export function bodyOf(payload) {
  const found = { plain: '', html: '', files: [] };
  const walk = part => {
    if (!part) return;
    if (part.filename) found.files.push({ name: part.filename, size: Number(part.body?.size) || 0 });
    else if (part.body?.data) {
      const txt = b64url(part.body.data);
      if (part.mimeType === 'text/plain' && !found.plain) found.plain = txt;
      else if (part.mimeType === 'text/html' && !found.html) found.html = txt;
    }
    (part.parts || []).forEach(walk);
  };
  walk(payload);
  const raw = found.plain || htmlToText(found.html.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ''));
  return { ...cleanBody(raw), files: found.files.slice(0, 6) };
}
async function mailMessage(env, b) {
  const id = String(b.id || '');
  if (!/^[0-9a-f]{6,32}$/i.test(id)) throw fail('Bad mail id.', 400, true);
  const m = await ggmail(env, `users/me/messages/${id}?format=full`);
  const body = bodyOf(m.payload);
  return { id: m.id, text: body.text || decodeEntities(m.snippet || ''), truncated: body.truncated, files: body.files };
}

async function mailThreads(env, b) {
  const emails = [...new Set((Array.isArray(b.emails) ? b.emails : []).map(e => String(e).trim().toLowerCase()).filter(isEmail))].slice(0, 8);
  if (!emails.length) return { account: '', messages: [] };
  const q = `(${emails.map(e => `from:${e} OR to:${e}`).join(' OR ')})`;
  const [list, profile] = await Promise.all([ggmail(env, `users/me/messages?${new URLSearchParams({ q, maxResults: '10' })}`), ggmail(env, 'users/me/profile')]);
  const all = await Promise.all((list.messages || []).slice(0, 10).map(m => gmailMeta(env, m.id)));
  const seen = new Set(), account = (profile.emailAddress || '').toLowerCase();
  const messages = all.filter(m => !seen.has(m.threadId) && seen.add(m.threadId)).slice(0, 5).map(m => ({ ...m, mine: !!account && m.from.email === account }));
  return { account: profile.emailAddress || '', messages };
}

/* ---------------- Notion: start a meeting note ---------------- */

async function newMeeting(env, b) {
  if (!env.NOTION_MEETINGS_DB) throw fail('The Meetings database is not set up on the Worker yet (NOTION_MEETINGS_DB).', 409, true);
  const title = String(b.title || 'Meeting').trim().slice(0, 200) || 'Meeting';
  const properties = { Name: { title: [{ text: { content: title } }] } };
  const sOk = b.start && !isNaN(Date.parse(b.start));
  if (sOk) {
    const date = { start: b.start };
    if (b.end && !isNaN(Date.parse(b.end)) && Date.parse(b.end) > Date.parse(b.start) && String(b.start).includes('T')) date.end = b.end;
    properties.Date = { date };
  }
  const ids = [...new Set((Array.isArray(b.attendees) ? b.attendees : []).filter(isPageId))].slice(0, 20);
  if (ids.length) properties.Attendees = { relation: ids.map(id => ({ id })) };
  const p = await notion(env, 'pages', 'POST', { parent: { database_id: env.NOTION_MEETINGS_DB }, properties });
  return { url: p.url, id: p.id };
}

/* ---------------- Notion: restaurant favourites (Mesa app) ---------------- */

const R_CITIES = ['Madrid', 'Costa Brava', 'Vienna'];
const R_METHODS = ['CoverManager', 'Molzait', 'TheFork', 'Myrestoo', 'Agora POS', 'Own website', 'Phone', 'WhatsApp', 'Email', 'Walk-in', 'Unknown'];
const R_CARDS = ['Unknown', 'No', 'Yes - guarantee', 'Yes - deposit'];
const R_PRICES = ['€', '€€', '€€€', '€€€€'];
const R_MEALS = ['Lunch', 'Dinner', 'Brunch'];
const R_TAGS = ['Terrace', 'Sea view', 'Group-friendly', 'Kids welcome', 'Romantic', 'Special occasion', 'Casual', 'Fine dining', 'Vegetarian options', 'Dog-friendly', 'Quiet', 'Lively'];
// Wishlist: a place you have not been to yet. Empty means a place you have been (a normal favourite); "I've been" simply clears it.
const R_WISHLIST = ['Want to try', 'Booked'];

export function mapRestaurant(p) {
  const pr = p.properties || {}, text = a => (a || []).map(t => t.plain_text).join('').trim();
  return {
    id: p.id, url: p.url, name: text(pr.Name?.title) || '(untitled)', city: pr.City?.select?.name || '', area: text(pr.Area?.rich_text),
    cuisine: pr.Cuisine?.select?.name || '', meals: (pr.Meal?.multi_select || []).map(o => o.name), tags: (pr.Tags?.multi_select || []).map(o => o.name), price: pr.Price?.select?.name || '',
    favourite: !!pr.Favourite?.checkbox, method: pr['Booking method']?.select?.name || 'Unknown', bookingLink: pr['Booking link']?.url || '',
    platformId: text(pr['Platform id']?.rich_text), website: pr.Website?.url || '', phone: pr.Phone?.phone_number || '', whatsapp: pr.WhatsApp?.phone_number || '',
    card: pr['Card needed']?.select?.name || 'Unknown', policy: text(pr['Deposit / policy']?.rich_text), notes: text(pr.Notes?.rich_text),
    lastVisit: pr['Last visit']?.date?.start || null, visits: pr.Visits?.number ?? 0, rating: typeof pr['My rating']?.number === 'number' ? pr['My rating'].number : null,
    wishlist: pr.Wishlist?.select?.name || '', why: text(pr['Why / recommended by']?.rich_text), added: (p.created_time || '').slice(0, 10),
  };
}

const rtext = (s, max = 1900) => ({ rich_text: s ? [{ text: { content: String(s).slice(0, max) } }] : [] });
const isHttp = s => /^https?:\/\/[^\s]{3,500}$/i.test(s || '');
const isPhone = s => /^\+?[0-9 ()./-]{5,25}$/.test(s || '');

// Only these fields can be written, each checked, so a bad request cannot touch anything else in the database.
export function restaurantProps(b, creating = false) {
  const out = {}, bad = m => { throw fail(m, 400, true); };
  const has = k => Object.prototype.hasOwnProperty.call(b, k);
  if (has('name')) { const n = String(b.name || '').trim(); if (!n || n.length > 120) bad('Give the restaurant a name (up to 120 characters).'); out.Name = { title: [{ text: { content: n } }] }; }
  else if (creating) bad('Give the restaurant a name.');
  if (has('city')) { if (b.city && !R_CITIES.includes(b.city)) bad('Unknown city.'); out.City = { select: b.city ? { name: b.city } : null }; }
  else if (creating) bad('Pick a city.');
  if (has('area')) out.Area = rtext(b.area, 100);
  if (has('cuisine')) { const c = String(b.cuisine || '').trim().replace(/,/g, ' '); if (c.length > 40) bad('Cuisine is too long.'); out.Cuisine = { select: c ? { name: c } : null }; }
  if (has('meals')) { const m = Array.isArray(b.meals) ? b.meals : []; if (m.some(x => !R_MEALS.includes(x))) bad('Unknown meal.'); out.Meal = { multi_select: m.map(name => ({ name })) }; }
  if (has('tags')) { const t = Array.isArray(b.tags) ? b.tags : []; if (t.some(x => !R_TAGS.includes(x))) bad('Unknown tag.'); out.Tags = { multi_select: [...new Set(t)].map(name => ({ name })) }; }
  if (has('price')) { if (b.price && !R_PRICES.includes(b.price)) bad('Unknown price level.'); out.Price = { select: b.price ? { name: b.price } : null }; }
  if (has('favourite')) out.Favourite = { checkbox: !!b.favourite };
  if (has('method')) { if (!R_METHODS.includes(b.method)) bad('Unknown booking method.'); out['Booking method'] = { select: { name: b.method } }; }
  for (const [k, prop] of [['bookingLink', 'Booking link'], ['website', 'Website']]) if (has(k)) { if (b[k] && !isHttp(b[k])) bad(`${prop} must start with http:// or https://.`); out[prop] = { url: b[k] || null }; }
  for (const [k, prop] of [['phone', 'Phone'], ['whatsapp', 'WhatsApp']]) if (has(k)) { if (b[k] && !isPhone(b[k])) bad(`${prop} number looks wrong.`); out[prop] = { phone_number: b[k] || null }; }
  if (has('platformId')) out['Platform id'] = rtext(b.platformId, 100);
  if (has('card')) { if (!R_CARDS.includes(b.card)) bad('Unknown card setting.'); out['Card needed'] = { select: { name: b.card } }; }
  if (has('policy')) out['Deposit / policy'] = rtext(b.policy);
  if (has('notes')) out.Notes = rtext(b.notes);
  if (has('lastVisit')) { if (b.lastVisit && !isDate(b.lastVisit)) bad('Bad date.'); out['Last visit'] = { date: b.lastVisit ? { start: b.lastVisit } : null }; }
  if (has('wishlist')) { if (b.wishlist && !R_WISHLIST.includes(b.wishlist)) bad('Unknown wishlist status.'); out.Wishlist = { select: b.wishlist ? { name: b.wishlist } : null }; }
  if (has('why')) out['Why / recommended by'] = rtext(b.why);
  if (has('rating')) { const n = b.rating === null || b.rating === '' ? null : Number(b.rating); if (n !== null && (!Number.isInteger(n) || n < 1 || n > 10)) bad('Your score is a whole number from 1 to 10.'); out['My rating'] = { number: n }; }
  if (has('visits')) { const n = Number(b.visits); if (!Number.isInteger(n) || n < 0 || n > 999) bad('Visits must be a whole number.'); out.Visits = { number: n }; }
  return out;
}

function restaurantDb(env) {
  if (!env.NOTION_RESTAURANTS_DB) throw fail('The restaurant list is not set up on the Worker yet (NOTION_RESTAURANTS_DB).', 409, true);
  return env.NOTION_RESTAURANTS_DB;
}
const restaurantHint = e => { if (/Notion 404/.test(e.message)) e.message += ' Open the Restaurant Favourites database in Notion, then ••• > Connections, and add your integration.'; return e; };

async function restaurantList(env) {
  const db = restaurantDb(env), out = [];
  let cursor;
  try {
    do {
      const r = await notion(env, `databases/${db}/query`, 'POST', { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
      out.push(...(r.results || []).map(mapRestaurant));
      cursor = r.has_more ? r.next_cursor : null;
    } while (cursor && out.length < 500);
  } catch (e) { throw restaurantHint(e); }
  return { restaurants: out };
}

async function restaurantUpdate(env, b) {
  restaurantDb(env);
  if (!isPageId(b.id)) throw fail('Need a restaurant id.', 400, true);
  const properties = restaurantProps(b.fields && typeof b.fields === 'object' ? b.fields : {});
  if (!Object.keys(properties).length) throw fail('Nothing to change.', 400, true);
  try { return { restaurant: mapRestaurant(await notion(env, `pages/${b.id}`, 'PATCH', { properties })) }; } catch (e) { throw restaurantHint(e); }
}

async function restaurantAdd(env, b) {
  const db = restaurantDb(env);
  const properties = restaurantProps(b, true);
  properties['Booking method'] = properties['Booking method'] || { select: { name: 'Unknown' } };
  properties['Card needed'] = properties['Card needed'] || { select: { name: 'Unknown' } };
  try { return { restaurant: mapRestaurant(await notion(env, 'pages', 'POST', { parent: { database_id: db }, properties })) }; } catch (e) { throw restaurantHint(e); }
}

// Archive (Notion's trash, restorable) or restore a place. Only the archived flag is touched.
async function restaurantArchive(env, b) {
  restaurantDb(env);
  if (!isPageId(b.id)) throw fail('Need a restaurant id.', 400, true);
  try { return { restaurant: mapRestaurant(await notion(env, `pages/${b.id}`, 'PATCH', { archived: b.archived !== false })) }; } catch (e) { throw restaurantHint(e); }
}

// Add a place that was shared from Google Maps (share sheet text and/or link) to the wishlist.
const MAPS_URL = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|share\.google|(?:www\.)?google\.[a-z.]{2,6}\/(?:maps|search)|maps\.google\.[a-z.]{2,6})[^\s<>"]*/i;
const COSTA_BRAVA = /\b(begur|palafrugell|pals|calella|llafranc|tamariu|girona|torroella|regenc[oó]s|platja d['’]aro|sant feliu|sa tuna|aiguablava|peratallada|l['’]escala|roses|cadaqu[eé]s|figueres|la bisbal|lloret|tossa|blanes|l['’]estartit|costa brava)\b/i;
export function guessCity(s) {
  if (/\bmadrid\b/i.test(s)) return 'Madrid';
  if (/\b(wien|vienna|viena)\b/i.test(s)) return 'Vienna';
  if (COSTA_BRAVA.test(s)) return 'Costa Brava';
  return '';
}
const plain = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function placeFromMapsUrl(u) {
  try {
    let url = new URL(u);
    if (/consent\.google\./.test(url.hostname) && url.searchParams.get('continue')) url = new URL(url.searchParams.get('continue'));
    const m = url.pathname.match(/\/maps\/place\/([^/@]+)/);
    const raw = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : (url.searchParams.get('q') || url.searchParams.get('query') || '');
    const parts = raw.split(',').map(x => x.trim()).filter(Boolean);
    return { name: parts[0] || '', address: parts.slice(1).join(', ') };
  } catch { return { name: '', address: '' }; }
}
async function restaurantShare(env, b) {
  restaurantDb(env);
  const text = String(b.text || '').slice(0, 2000), given = String(b.url || '').slice(0, 500);
  const link = (given.match(MAPS_URL) || text.match(MAPS_URL) || [''])[0];
  const rest = text.replace(MAPS_URL, ' ');
  // A restaurant's own website (shared from the browser) is kept as its Website; its page title gives the name if none came with it.
  const site = (rest.match(/https?:\/\/[^\s<>"]+/i) || [given && !MAPS_URL.test(given) && isHttp(given) ? given : ''])[0].slice(0, 500);
  const lines = rest.replace(/https?:\/\/[^\s<>"]+/gi, ' ').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  let name = lines[0] || '', address = lines.slice(1).join(', ');
  if (!name && site && !link) {
    try {
      const res = await fetch(site, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' }, signal: AbortSignal.timeout(6000) });
      const t = (await res.text()).match(/<title[^>]*>([^<]{2,200})<\/title>/i);
      if (t) name = decodeEntities(t[1]).split(/\s[|\u2013\u2014-]\s|\s\u00b7\s/)[0].replace(/^(restaurante?|bienvenid[oa]s? a)\s+/i, '').trim();
    } catch { /* no name from the site */ }
  }
  if (link && (!name || !address)) {
    try {
      const res = await fetch(link, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 'Accept-Language': 'en', Cookie: 'CONSENT=YES+' }, signal: AbortSignal.timeout(6000) });
      const p = placeFromMapsUrl(res.url || link);
      name = name || p.name; address = address || p.address;
      if (!name) { const t = (await res.text()).match(/<title>([^<]{2,150})<\/title>/i); if (t) name = t[1].replace(/\s*[-–·]\s*Google\s*Maps.*$/i, '').trim(); }
    } catch { /* fall back to what was shared */ }
  }
  name = name.replace(/\s+/g, ' ').slice(0, 120);
  if (!name) throw fail('Could not read a place name from what you shared. Add it in Mesa with the + button instead.', 400, true);
  const city = guessCity(`${address} ${name}`), resolved = { name, city, address };
  const same = (await restaurantList(env)).restaurants.find(r => plain(r.name) === plain(name));
  if (same) return { restaurant: same, existing: true, resolved };
  const notes = [address, link].filter(Boolean).join('\n').slice(0, 1900);
  return { ...(await restaurantAdd(env, { name, city, wishlist: 'Want to try', why: 'Shared from Google Maps', notes, ...(site && isHttp(site) ? { website: site } : {}) })), existing: false, resolved };
}

// Visit log: one row per visit in the Mesa Visits database, linked to the restaurant. The restaurant's Visits count and Last visit are recomputed after every change.
function visitsDb(env) {
  if (!env.NOTION_VISITS_DB) throw fail('The visit log is not set up on the Worker yet (NOTION_VISITS_DB).', 409, true);
  return env.NOTION_VISITS_DB;
}
export function mapVisit(p) {
  const pr = p.properties || {}, text = a => (a || []).map(t => t.plain_text).join('').trim();
  return { id: p.id, restaurantId: pr.Restaurant?.relation?.[0]?.id || '', date: pr.Date?.date?.start || '', ate: text(pr['What we ate']?.rich_text), rating: typeof pr.Rating?.number === 'number' ? pr.Rating.number : null, notes: text(pr.Notes?.rich_text) };
}
async function visitsFor(env, restaurantId) {
  const db = visitsDb(env), out = [];
  let cursor;
  do {
    const r = await notion(env, `databases/${db}/query`, 'POST', { page_size: 100, ...(restaurantId ? { filter: { property: 'Restaurant', relation: { contains: restaurantId } } } : {}), ...(cursor ? { start_cursor: cursor } : {}) });
    out.push(...(r.results || []).map(mapVisit));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor && out.length < 2000);
  return out;
}
async function visitList(env) { return { visits: (await visitsFor(env)).sort((a, b) => b.date.localeCompare(a.date)) }; }
async function syncRestaurantVisits(env, restaurantId) {
  const v = await visitsFor(env, restaurantId), last = v.map(x => x.date).filter(Boolean).sort().at(-1) || null;
  const properties = { Visits: { number: v.length }, 'Last visit': { date: last ? { start: last } : null } };
  if (v.length) properties.Wishlist = { select: null };
  return mapRestaurant(await notion(env, `pages/${restaurantId}`, 'PATCH', { properties }));
}
async function visitAdd(env, b) {
  const db = visitsDb(env), bad = m => { throw fail(m, 400, true); };
  if (!isPageId(b.restaurantId)) bad('Need a restaurant id.');
  if (!isDate(b.date)) bad('Pick the date of the visit.');
  const rating = b.rating === null || b.rating === undefined || b.rating === '' ? null : Number(b.rating);
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 10)) bad('The score is a whole number from 1 to 10.');
  const properties = {
    Visit: { title: [{ text: { content: `${String(b.name || 'Visit').slice(0, 100)} · ${b.date}` } }] },
    Restaurant: { relation: [{ id: b.restaurantId }] }, Date: { date: { start: b.date } },
    'What we ate': rtext(b.ate), Rating: { number: rating }, Notes: rtext(b.notes),
  };
  let page;
  try { page = await notion(env, 'pages', 'POST', { parent: { database_id: db }, properties }); } catch (e) { throw restaurantHint(e); }
  return { visit: mapVisit(page), restaurant: await syncRestaurantVisits(env, b.restaurantId) };
}
async function visitDelete(env, b) {
  visitsDb(env);
  if (!isPageId(b.id)) throw fail('Need a visit id.', 400, true);
  const rid = mapVisit(await notion(env, `pages/${b.id}`)).restaurantId;
  await notion(env, `pages/${b.id}`, 'PATCH', { archived: true });
  return { restaurant: rid ? await syncRestaurantVisits(env, rid) : null };
}

/* ---------------- Booking emails -> calendar (Mesa) ---------------- */

// Confirmation, change and cancellation emails from the booking engines are read (never changed) and turned into calendar events.
const MONTHS = { ene: 1, enero: 1, jan: 1, january: 1, gener: 1, feb: 2, febrero: 2, february: 2, febrer: 2, mar: 3, marzo: 3, march: 3, 'març': 3, marc: 3, abr: 4, abril: 4, apr: 4, april: 4, may: 5, mayo: 5, maig: 5, jun: 6, junio: 6, june: 6, juny: 6, jul: 7, julio: 7, july: 7, juliol: 7, ago: 8, agosto: 8, aug: 8, august: 8, agost: 8, sep: 9, sept: 9, septiembre: 9, september: 9, setembre: 9, oct: 10, octubre: 10, october: 10, nov: 11, noviembre: 11, november: 11, novembre: 11, dic: 12, diciembre: 12, dec: 12, december: 12, desembre: 12 };
const pad2 = n => String(n).padStart(2, '0');
function ymdOk(y, m, d) { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; }
export function parseBooking(text, subject, fromName, sentAt) {
  const sub = String(subject || ''), body = String(text || '').replace(/&nbsp;/gi, ' ').replace(/\(?https?:\/\/[^\s)]+\)?/g, ' ').replace(/\s+/g, ' ');
  if (/experien|survey|encuesta|enquesta|thought about|valor|review|opinión|opinion|gracias por tu visita|thanks for your visit/i.test(sub)) return null;
  const kind = /cancel/i.test(sub) ? 'cancelled' : /modificad|modified|changed|modificat/i.test(sub) ? 'modified' : /confirm|recordatorio|reminder|recordatori|reconfirm|booked/i.test(sub) ? 'confirmed' : null;
  if (!kind) return null;
  const sent = sentAt ? new Date(sentAt) : new Date();
  const yearFor = (mo, d) => { let y = sent.getUTCFullYear(); if (Date.UTC(y, mo - 1, d) < sent.getTime() - 60 * 86400e3) y++; return y; };
  const cands = [];
  for (const m of body.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)) if (ymdOk(+m[3], +m[2], +m[1])) cands.push({ date: `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`, end: m.index + m[0].length });
  for (const m of body.matchAll(/(\d{1,2})(?:\s+de)?\s+([A-Za-zçÇ]+)\.?(?:\s+de)?\s+(\d{4})/g)) { const mo = MONTHS[m[2].toLowerCase()]; if (mo && ymdOk(+m[3], mo, +m[1])) cands.push({ date: `${m[3]}-${pad2(mo)}-${pad2(m[1])}`, end: m.index + m[0].length }); }
  for (const m of body.matchAll(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?(?=\s+(?:at|@|a las)\b)/gi)) { const mo = MONTHS[m[1].toLowerCase()]; if (!mo) continue; const y = m[3] ? +m[3] : yearFor(mo, +m[2]); if (ymdOk(y, mo, +m[2])) cands.push({ date: `${y}-${pad2(mo)}-${pad2(m[2])}`, end: m.index + m[0].length }); }
  for (const m of body.matchAll(/(?<![\d\/])(\d{1,2})\s+([A-Za-zçÇ]{3,9})\.?(?!\s+(?:de\s+)?\d{4})(?![A-Za-z])/g)) { const mo = MONTHS[m[2].toLowerCase()]; if (!mo) continue; const y = yearFor(mo, +m[1]); if (ymdOk(y, mo, +m[1])) cands.push({ date: `${y}-${pad2(mo)}-${pad2(m[1])}`, end: m.index + m[0].length }); }
  cands.sort((a, b) => a.end - b.end);
  // The time sits right after the date ("21:45h", "a las 14:00h", "at 13:00"); the first date with a time next to it is the booking.
  let date = '', time = '';
  for (const c of cands) { const t = /^[^0-9]{0,14}([01]?\d|2[0-3])[:.h]([0-5]\d)(?:\s*([ap])\.?m\b|\s*h?\b)/i.exec(body.slice(c.end, c.end + 30)); if (t) { let hh = +t[1]; if (t[3]) { const pmFlag = t[3].toLowerCase() === 'p'; if (pmFlag && hh < 12) hh += 12; if (!pmFlag && hh === 12) hh = 0; } date = c.date; time = `${pad2(hh)}:${t[2]}`; break; } }
  if (!date) return null;
  const pm = /(\d{1,2})\s*(?:personas?|people|persons?|persones|pax|comensales|guests?|gente)\b/i.exec(body), party = pm ? +pm[1] : 0;
  let name = '';
  const sm = /\b(?:en|at|in|a)\s+(.+?)\s*$/i.exec(sub.replace(/\s*(?:on|del|from)\s+\w+\.?,?\s*\d.*$/i, ''));
  name = (fromName && !/thefork|covermanager|myrestoo/i.test(fromName) ? fromName : '') || (sm ? sm[1] : '');
  name = name.replace(/^restaurante?\s+/i, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!name) return null;
  return { kind, name, date, time, party };
}
export function zonedToUtc(date, time, tz) {
  const [y, mo, d] = date.split('-').map(Number), [hh, mm] = time.split(':').map(Number), guess = Date.UTC(y, mo - 1, d, hh, mm);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map(p => [p.type, p.value]));
  return new Date(guess - (Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - guess));
}
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const BOOKING_SENDERS = 'noreply@covermanager.com OR noreply@myrestoo.net OR info@email.thefork.com OR noreply@thefork.com OR no-reply@thefork.com OR reservation@restaurant-information.com';

// Rebuild the list of bookings from the emails alone: no calendar changes and nothing is marked as handled. Used when Mesa is set up on a new phone.
async function bookingsRebuild(env, days) {
  const list = await ggmail(env, `users/me/messages?${new URLSearchParams({ q: `from:(${BOOKING_SENDERS}) newer_than:${days}d`, maxResults: '100' })}`);
  const full = [];
  for (const m of list.messages || []) {
    const g = await ggmail(env, `users/me/messages/${encodeURIComponent(m.id)}?format=full`);
    const hdr = n => (g.payload?.headers || []).find(h => h.name.toLowerCase() === n)?.value || '';
    full.push({ at: Number(g.internalDate) || 0, subject: decodeEntities(hdr('subject')), from: parseFrom(hdr('from')), text: bodyOf(g.payload).text || decodeEntities(g.snippet || '') });
  }
  full.sort((x, y) => x.at - y.at);
  const state = new Map();
  for (const m of full) {
    const p = parseBooking(m.text, m.subject, m.from.name, m.at);
    if (!p) continue;
    const key = `${slug(p.name)}|${p.date}|${p.time}`;
    if (p.kind === 'cancelled') { state.set(key, { key, ...p, status: 'cancelled' }); continue; }
    if (p.kind === 'modified') for (const [k, v] of state) if (k !== key && slug(v.name) === slug(p.name) && v.status === 'booked') v.status = 'cancelled';
    state.set(key, { key, ...p, status: 'booked' });
  }
  const bookings = [];
  for (const v of state.values()) bookings.push({ ...v, cal: v.status === 'booked' && !!(await env.TOKENS.get('booking:' + v.key, 'json'))?.eventId });
  return { bookings, scanned: full.length, rebuilt: true };
}

async function bookingsScan(env, b) {
  const days = Math.max(1, Math.min(120, Math.floor(Number(b.days)) || 45));
  if (b.rescan) return bookingsRebuild(env, days);
  const tzOf = /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+){0,2}$/.test(b.timeZone || '') ? b.timeZone : 'Europe/Madrid';
  const q = `from:(${BOOKING_SENDERS}) newer_than:${days}d`;
  const list = await ggmail(env, `users/me/messages?${new URLSearchParams({ q, maxResults: '60' })}`);
  const fresh = [];
  for (const m of list.messages || []) if (!(await env.TOKENS.get('bookingmsg:' + m.id))) fresh.push(m.id);
  const full = [];
  for (const id of fresh) {
    const m = await ggmail(env, `users/me/messages/${encodeURIComponent(id)}?format=full`);
    const hdr = n => (m.payload?.headers || []).find(h => h.name.toLowerCase() === n)?.value || '';
    full.push({ id, at: Number(m.internalDate) || 0, subject: decodeEntities(hdr('subject')), from: parseFrom(hdr('from')), text: bodyOf(m.payload).text || decodeEntities(m.snippet || '') });
  }
  full.sort((x, y) => x.at - y.at);
  const out = [], seen = new Set();
  for (const m of full) {
    const p = parseBooking(m.text, m.subject, m.from.name, m.at);
    await env.TOKENS.put('bookingmsg:' + m.id, '1', { expirationTtl: 150 * 86400 });
    if (!p) continue;
    const key = `${slug(p.name)}|${p.date}|${p.time}`, stored = await env.TOKENS.get('booking:' + key, 'json');
    if (p.kind === 'cancelled') {
      if (stored?.eventId) { try { await gcal(env, `calendars/primary/events/${encodeURIComponent(stored.eventId)}`, { method: 'DELETE' }); } catch { /* already gone */ } }
      await env.TOKENS.put('booking:' + key, JSON.stringify({ cancelled: true }), { expirationTtl: 400 * 86400 });
      out.push({ key, ...p, status: 'cancelled', cal: false }); continue;
    }
    if (stored && !stored.cancelled) { out.push({ key, ...p, status: 'booked', cal: !!stored.eventId }); continue; }
    if (p.kind === 'modified') {
      const idx = (await env.TOKENS.get('bookingidx:' + slug(p.name), 'json')) || [];
      for (const k of idx) if (k !== key) {
        const old = await env.TOKENS.get('booking:' + k, 'json');
        if (old?.eventId && k.split('|')[1] >= new Date().toISOString().slice(0, 10)) { try { await gcal(env, `calendars/primary/events/${encodeURIComponent(old.eventId)}`, { method: 'DELETE' }); } catch { /* ignore */ } }
        await env.TOKENS.put('booking:' + k, JSON.stringify({ cancelled: true }), { expirationTtl: 400 * 86400 });
        out.push({ key: k, name: p.name, date: k.split('|')[1], time: k.split('|')[2], party: p.party, status: 'cancelled', cal: false });
      }
    }
    const start = zonedToUtc(p.date, p.time, tzOf), end = new Date(+start + 2 * 3600e3);
    let eventId = '';
    try {
      const day = await gcal(env, `calendars/primary/events?${new URLSearchParams({ timeMin: new Date(+start - 3 * 3600e3).toISOString(), timeMax: new Date(+start + 5 * 3600e3).toISOString(), q: p.name.split(/[ -]/)[0], singleEvents: 'true', maxResults: '10' })}`);
      eventId = (day.items || []).find(e => plain(e.summary).includes(plain(p.name.split(/[ -]/)[0])))?.id || '';
    } catch { /* fall through and create */ }
    if (!eventId) {
      const { body, query } = buildEvent({ title: `🍽 ${p.name}`, start: start.toISOString(), end: end.toISOString(), timeZone: tzOf, location: p.name, description: [p.party ? `Table for ${p.party}.` : '', 'Added by Mesa from your booking email.'].filter(Boolean).join('\n') });
      eventId = (await gcal(env, `calendars/primary/events?${query}`, { method: 'POST', body: JSON.stringify(body) })).id || '';
    }
    await env.TOKENS.put('booking:' + key, JSON.stringify({ eventId }), { expirationTtl: 400 * 86400 });
    const idx = (await env.TOKENS.get('bookingidx:' + slug(p.name), 'json')) || [];
    if (!idx.includes(key)) await env.TOKENS.put('bookingidx:' + slug(p.name), JSON.stringify([...idx, key].slice(-10)), { expirationTtl: 400 * 86400 });
    out.push({ key, ...p, status: 'booked', cal: !!eventId });
  }
  const latest = new Map(); for (const x of out) latest.set(x.key, x);
  return { bookings: [...latest.values()], scanned: full.length };
}

/* ---------------- CoinMarketCap prices (read only) ---------------- */

async function cmc(env, path) {
  if (!env.CMC_API_KEY) throw fail('CoinMarketCap is not set up on the Worker yet (CMC_API_KEY).', 409, true);
  const res = await fetch(`https://pro-api.coinmarketcap.com${path}`, { headers: { 'X-CMC_PRO_API_KEY': env.CMC_API_KEY, Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status?.error_code) {
    const msg = String(body.status?.error_message || res.statusText);
    if (res.status === 401 || res.status === 403) throw fail('CoinMarketCap rejected the API key. Check CMC_API_KEY on the Worker.', 502, true);
    if (res.status === 429) throw fail('CoinMarketCap rate limit reached. Try again in a minute.', 502, true);
    throw fail(`CoinMarketCap ${res.status}: ${msg.slice(0, 160)}`, 502, true);
  }
  return body;
}
export const mapCoin = c => ({ id: c.id, name: c.name, symbol: c.symbol, rank: c.rank ?? null, slug: c.slug, chain: c.platform?.name || '' });

// A ticker can belong to several coins; the app shows the candidates, best-ranked first, and you pick.
async function cryptoSearch(env, b) {
  const symbols = [...new Set((Array.isArray(b.symbols) ? b.symbols : []).map(x => String(x).trim().toUpperCase()).filter(x => /^[A-Z0-9]{1,12}$/.test(x)))].slice(0, 30);
  if (!symbols.length) throw fail('Give at least one ticker.', 400, true);
  const body = await cmc(env, `/v1/cryptocurrency/map?${new URLSearchParams({ symbol: symbols.join(','), listing_status: 'active', limit: '5000' })}`);
  const results = Object.fromEntries(symbols.map(x => [x, []]));
  for (const c of body.data || []) if (results[c.symbol]) results[c.symbol].push(mapCoin(c));
  for (const k of Object.keys(results)) results[k] = results[k].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)).slice(0, 6);
  return { results };
}

async function cryptoQuotes(env, b) {
  const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0))].sort((x, y) => x - y).slice(0, 100);
  if (!ids.length) return { at: Date.now(), quotes: {} };
  const key = `cmc:q:${ids.join(',')}`, cached = await env.TOKENS.get(key, 'json'); // one call per minute at most, however often the app asks
  if (cached) return cached;
  const body = await cmc(env, `/v2/cryptocurrency/quotes/latest?${new URLSearchParams({ id: ids.join(','), convert: 'USD', skip_invalid: 'true' })}`);
  const quotes = {};
  for (const [id, v] of Object.entries(body.data || {})) {
    const c = Array.isArray(v) ? v[0] : v, q = c?.quote?.USD;
    if (c && q && q.price != null) quotes[id] = { symbol: c.symbol, name: c.name, price: q.price, change24h: q.percent_change_24h ?? null, updated: q.last_updated || null };
  }
  const out = { at: Date.now(), quotes };
  await env.TOKENS.put(key, JSON.stringify(out), { expirationTtl: 60 });
  return out;
}

/* ---------------- food search (Open Food Facts) ---------------- */

// Open Food Facts search does not allow direct browser calls, so the app asks the Worker.
export function offFood(p) {
  const n = p.nutriments || {}, num = v => (v === '' || v == null || isNaN(+v) ? null : +v), r1 = v => (v === null ? null : Math.round(v * 10) / 10);
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === null) { const kj = num(n['energy_100g']); if (kj !== null) kcal = kj / 4.184; }
  const name = String(p.product_name || '').trim();
  if (kcal === null || !name) return null; // a result without calories is useless to log
  const brand = Array.isArray(p.brands) ? p.brands[0] : String(p.brands || '').split(',')[0].trim();
  return {
    code: String(p.code || ''), name, brand: brand || '',
    per100: { kcal: Math.round(kcal), p: r1(num(n.proteins_100g)), c: r1(num(n.carbohydrates_100g)), f: r1(num(n.fat_100g)) },
    servingG: num(p.serving_quantity),
  };
}
async function foods(url) {
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2 || q.length > 80) throw fail('Type at least 2 letters to search.', 400);
  const params = new URLSearchParams({ q, page_size: '20', fields: 'code,product_name,brands,nutriments,serving_quantity' });
  const res = await fetch(`https://search.openfoodfacts.org/search?${params}`, {
    headers: { 'User-Agent': 'CalorieTracker/1.0 (https://github.com/Caloriesin-n-out/Calorie-tracker)' },
  });
  if (!res.ok) throw fail(`Food search is not answering right now (${res.status}). Try again in a minute.`);
  const data = await res.json().catch(() => ({}));
  return { foods: (data.hits || []).map(offFood).filter(Boolean).slice(0, 12) };
}

async function raw(env, url) {
  const type = url.searchParams.get('type'), from = url.searchParams.get('from'), to = url.searchParams.get('to');
  if (!/^[a-z-]+$/.test(type || '') || !from || !to) throw fail('Need type, from, to.', 400);
  const rollUps = ['steps', 'total-calories', 'active-energy-burned'];
  if (rollUps.includes(type)) {
    return g(env, `${type}/dataPoints:dailyRollUp`, { method: 'POST', body: JSON.stringify({ range: { start: civil(from), end: civil(addDays(to, 1)) }, windowSizeDays: 1 }) });
  }
  const underscore = type.replace(/-/g, '_');
  const kind = { sleep: 'interval', weight: 'civil', 'body-fat': 'civil' }[type] || (type.startsWith('daily-') ? 'date' : null);
  if (!kind) throw fail('Unsupported type for raw.', 400);
  const filter = kind === 'civil' ? civilFilter(underscore, from, to)
    : kind === 'date' ? dateFilter(underscore, from, to)
    : `sleep.interval.end_time >= "${from}T00:00:00Z" AND sleep.interval.end_time < "${addDays(to, 1)}T00:00:00Z"`;
  return g(env, `${type}/dataPoints?${new URLSearchParams({ filter, pageSize: '50' })}`);
}
