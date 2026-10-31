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
//   GET  /api/calendar    -> ?from=<ISO time>&to=<ISO time>, events from your selected Google calendars (read only)
//   GET  /api/tasks       -> ?date=YYYY-MM-DD, open Notion tasks plus the ones completed on that date
//   POST /api/tasks/done | /api/tasks/reopen | /api/tasks/add   -> change Notion tasks
//   POST /api/brief       -> {emails:[...]}, matches meeting attendees to People in your Notion CRM (read only)
// Everything under /api needs the X-App-Key header.
// Notion (optional): secret NOTION_TOKEN (an internal integration shared with the databases), vars NOTION_TASKS_DB and NOTION_PEOPLE_DB.

const HEALTH = 'https://health.googleapis.com/v4/users/me/dataTypes';
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

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
const scopes = env => (env.SCOPES || DEFAULT_SCOPES.join(' '));
const redirectUri = url => `${url.origin}/auth/callback`;
const fail = (msg, status = 502, quiet = false) => Object.assign(new Error(msg), { status, quiet });

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
    notion: !!(env.NOTION_TOKEN && env.NOTION_TASKS_DB),
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

async function gcal(env, path) {
  const token = await accessToken(env);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(body.error?.message || res.statusText), reason = body.error?.errors?.[0]?.reason || '';
    if (res.status === 401) { await env.TOKENS.delete('accessToken'); throw fail('Google rejected the login. Try again, or reconnect Google.', 401, true); }
    if (res.status === 403 && /accessNotConfigured|has not been used|is disabled/i.test(`${reason} ${msg}`)) throw fail('The Google Calendar API is not switched on in your Google Cloud project yet.', 403, true);
    if (res.status === 403 && /insufficient|scope/i.test(`${reason} ${msg}`)) throw fail('Calendar permission is missing. Reconnect Google and approve calendar access.', 403, true);
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
      if (/permission is missing|not switched on|rejected the login/i.test(e.message)) throw e;
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
