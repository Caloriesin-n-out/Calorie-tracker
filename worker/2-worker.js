var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var HEALTH = "https://health.googleapis.com/v4/users/me/dataTypes";
var DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly"
];
var CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly"
];
var keys = /* @__PURE__ */ __name((service) => service === "shared-tasks" ? { refresh: "refreshToken:shared-tasks", access: "accessToken:shared-tasks", scopes: "grantedScopes:shared-tasks", label: "Shared Google Tasks and calendar" } : service === "calendar" ? { refresh: "refreshToken:calendar", access: "accessToken:calendar", scopes: "grantedScopes:calendar", label: "Google Calendar and Gmail" } : { refresh: "refreshToken", access: "accessToken", scopes: "grantedScopes", label: "Google Health" }, "keys");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors(request, env), "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "86400" } });
    try {
      if (url.pathname === "/auth/start") return await authStart(request, env, url);
      if (url.pathname === "/auth/callback") return await authCallback(env, url);
      if (url.pathname.startsWith("/api/")) {
        if (!await keyOk(request.headers.get("X-App-Key"), env.APP_KEY)) return json({ error: "Wrong or missing app key." }, 401, request, env);
        if (url.pathname === "/api/status") return json(await status(env), 200, request, env);
        if (url.pathname === "/api/shared-tasks/status") {
          if (request.method !== "GET") return json({ error: "Use GET." }, 405, request, env);
          return json(await sharedStatus(env), 200, request, env);
        }
        if (url.pathname === "/api/shared-tasks/lists") {
          if (request.method !== "GET") return json({ error: "Use GET." }, 405, request, env);
          return json(await sharedLists(env), 200, request, env);
        }
        if (url.pathname === "/api/shared-tasks") {
          if (request.method !== "GET") return json({ error: "Use GET." }, 405, request, env);
          return json(await sharedTasks(env, url), 200, request, env);
        }
        if (url.pathname === "/api/shared-calendar") {
          if (request.method !== "GET") return json({ error: "Use GET." }, 405, request, env);
          return json(await sharedCalendar(env, url), 200, request, env);
        }
        if (url.pathname.startsWith("/api/shared-tasks/")) {
          if (request.method !== "POST") return json({ error: "Use POST." }, 405, request, env);
          const action = url.pathname.slice("/api/shared-tasks/".length);
          if (!["select", "add", "done", "reopen"].includes(action)) return json({ error: "Not found." }, 404, request, env);
          const body = await request.json().catch(() => ({}));
          return json(action === "select" ? await sharedSelect(env, body) : await sharedAction(env, action, body), 200, request, env);
        }

        if (url.pathname === "/api/days") return json(await days(env, url), 200, request, env);
        if (url.pathname === "/api/raw") return json(await raw(env, url), 200, request, env);
        if (url.pathname === "/api/foods") return json(await foods(url), 200, request, env);
        if (url.pathname === "/api/calendar") return json(await calendar(env, url), 200, request, env);
        if (url.pathname === "/api/tasks") return json(await tasks(env, url), 200, request, env);
        if (url.pathname === "/api/mail/inbox") return json(await mailInbox(env), 200, request, env);
        if (["/api/mail/threads", "/api/mail/message", "/api/calendar/add", "/api/calendar/complete", "/api/meetings/new", "/api/crypto/search", "/api/crypto/quotes", "/api/restaurants/list", "/api/restaurants/update", "/api/restaurants/add", "/api/restaurants/archive", "/api/restaurants/share", "/api/visits/list", "/api/visits/add", "/api/visits/delete", "/api/bookings/scan", "/api/bookings/deliver", "/api/bookings/deliveries", "/api/bookings/ack", "/api/bookings/restore", "/api/bookreq/add", "/api/bookreq/status", "/api/bookreq/cancel"].includes(url.pathname)) {
          if (request.method !== "POST") return json({ error: "Use POST." }, 405, request, env);
          const body = await request.json().catch(() => ({}));
          const fn = {
            "/api/mail/threads": mailThreads,
            "/api/mail/message": mailMessage,
            "/api/calendar/add": calendarAdd,
            "/api/calendar/complete": calendarComplete,
            "/api/meetings/new": newMeeting,
            "/api/crypto/search": cryptoSearch,
            "/api/crypto/quotes": cryptoQuotes,
            "/api/restaurants/list": restaurantList,
            "/api/restaurants/update": restaurantUpdate,
            "/api/restaurants/add": restaurantAdd,
            "/api/restaurants/archive": restaurantArchive,
            "/api/restaurants/share": restaurantShare,
            "/api/visits/list": visitList,
            "/api/visits/add": visitAdd,
            "/api/visits/delete": visitDelete,
            "/api/bookings/scan": bookingsScan,
            "/api/bookings/deliver": bookingsDeliver,
            "/api/bookings/deliveries": bookingsDeliveries,
            "/api/bookings/ack": bookingsAck,
            "/api/bookings/restore": bookingsRestore,
            "/api/bookreq/add": bookreqAdd,
            "/api/bookreq/status": bookreqStatus,
            "/api/bookreq/cancel": bookreqCancel
          }[url.pathname];
          return json(await fn(env, body), 200, request, env);
        }
        if (url.pathname === "/api/brief") {
          if (request.method !== "POST") return json({ error: "Use POST." }, 405, request, env);
          return json(await brief(env, await request.json().catch(() => ({}))), 200, request, env);
        }
        if (url.pathname.startsWith("/api/tasks/")) {
          if (request.method !== "POST") return json({ error: "Use POST." }, 405, request, env);
          const body = await request.json().catch(() => ({}));
          return json(await taskAction(env, url.pathname.slice("/api/tasks/".length), body), 200, request, env);
        }
        return json({ error: "Not found" }, 404, request, env);
      }
      return html("<h2>Calorie tracker API</h2><p>This address only serves data to the app. Open the app from your home screen.</p>");
    } catch (e) {
      if (!e.quiet) await setLastError(env, e.message);
      return json({ error: e.message }, e.status || 500, request, env);
    }
  }
};
function json(body, status2, request, env) {
  return new Response(JSON.stringify(body), {
    status: status2,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(request, env) }
  });
}
__name(json, "json");
function cors(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = [...String(env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean), "https://gymmh.github.io"];
  if (!origin || !allowed.includes(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "X-App-Key, Content-Type", Vary: "Origin" };
}
__name(cors, "cors");
function html(body, status2 = 200) {
  return new Response(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="font:16px system-ui;max-width:460px;margin:40px auto;padding:0 16px">${body}`, {
    status: status2,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}
__name(html, "html");
async function keyOk(given, expected) {
  if (!given || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(given)), crypto.subtle.digest("SHA-256", enc.encode(expected))]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
__name(keyOk, "keyOk");
var scopes = /* @__PURE__ */ __name((env, service) => service === "shared-tasks" ? SHARED_SCOPES.join(" ") : service === "calendar" ? CALENDAR_SCOPES.join(" ") : env.SCOPES || DEFAULT_SCOPES.join(" "), "scopes");
var redirectUri = /* @__PURE__ */ __name((url) => `${url.origin}/auth/callback`, "redirectUri");
var fail = /* @__PURE__ */ __name((msg, status2 = 502, quiet = false) => Object.assign(new Error(msg), { status: status2, quiet }), "fail");
async function setLastError(env, msg) {
  try {
    await env.TOKENS.put("lastError", `${(/* @__PURE__ */ new Date()).toISOString()} ${msg}`);
  } catch {
  }
}
__name(setLastError, "setLastError");
async function authStart(request, env, url) {
  if (request.method === "POST") {
    const form = await request.formData();
    const service2 = authService(form.get("service"));
    if (!await keyOk(form.get("key"), env.APP_KEY)) return html(`<p>Wrong app key.</p><p><a href="/auth/start?service=${service2}">Try again</a></p>`, 401);
    const state = crypto.randomUUID();
    await env.TOKENS.put(`state:${state}`, service2, { expirationTtl: 600 });
    const q = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(url),
      response_type: "code",
      scope: scopes(env, service2),
      access_type: "offline",
      ...(service2 === SHARED_SERVICE ? { login_hint: SHARED_EMAIL, include_granted_scopes: "false" } : {}),
      prompt: "consent",
      // always hand back a refresh token, including when reconnecting
      state
    });
    return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, 302);
  }
  const service = authService(url.searchParams.get("service"));
  return html(`<h2>Connect ${keys(service).label}</h2>
    <p>Enter your app key to continue to Google.</p>
    <form method=post><input type=hidden name=service value="${service}"><input name=key type=password autofocus style="width:100%;padding:12px;font-size:16px;box-sizing:border-box">
    <p><button style="padding:12px 18px;font-size:16px">Continue</button></p></form>`);
}
__name(authStart, "authStart");
async function authCallback(env, url) {
  const err = url.searchParams.get("error");
  if (err) return html(`<h2>Google said no</h2><p>${esc(err)}</p>`, 400);
  const state = url.searchParams.get("state"), code = url.searchParams.get("code");
  const stored = state && code ? await env.TOKENS.get(`state:${state}`) : null;
  if (!stored) return html("<h2>Link expired</h2><p>Start again from the app.</p>", 400);
  const service = authService(stored), K = keys(service);
  await env.TOKENS.delete(`state:${state}`);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(url),
      grant_type: "authorization_code"
    })
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.refresh_token) return html(`<h2>Could not connect</h2><p>${esc(tok.error_description || tok.error || "No refresh token returned.")}</p>`, 400);
  const sharedIdentity = service === SHARED_SERVICE ? await verifySharedGrant(env, tok) : null;
  await env.TOKENS.put(K.refresh, tok.refresh_token);
  if (sharedIdentity) await env.TOKENS.put(SHARED_IDENTITY, JSON.stringify(sharedIdentity));
  await env.TOKENS.put(K.scopes, tok.scope || "");
  await env.TOKENS.delete(K.access);
  if (service === "health") await env.TOKENS.delete("lastError");
  await cacheAccess(env, tok, service);
  return html(`<h2>${K.label} connected \u2713</h2><p>You can close this tab and go back to the app.</p>`);
}
__name(authCallback, "authCallback");
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
__name(esc, "esc");
async function cacheAccess(env, tok, service = "health") {
  if (tok.access_token) await env.TOKENS.put(keys(service).access, tok.access_token, { expirationTtl: Math.max(60, (tok.expires_in || 3600) - 120) });
}
__name(cacheAccess, "cacheAccess");
async function accessToken(env, service = "health") {
  const K = keys(service);
  const cached = await env.TOKENS.get(K.access);
  if (cached) return cached;
  const refresh = await env.TOKENS.get(K.refresh);
  if (!refresh) throw fail(`Not connected to ${K.label} yet. Connect it from Settings.`, 409, service !== "health");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: "refresh_token" })
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (tok.error === "invalid_grant") {
      await env.TOKENS.delete(K.refresh);
      throw fail(`Google expired or revoked the connection. Please reconnect ${K.label}.`, 401, service !== "health");
    }
    throw fail(`Google token refresh failed: ${tok.error_description || tok.error || res.status}`, 502, service !== "health");
  }
  if (tok.refresh_token) await env.TOKENS.put(K.refresh, tok.refresh_token);
  await cacheAccess(env, tok, service);
  return tok.access_token;
}
__name(accessToken, "accessToken");
async function status(env) {
  return {
    connected: !!await env.TOKENS.get("refreshToken"),
    lastError: await env.TOKENS.get("lastError") || null,
    scopes: await env.TOKENS.get("grantedScopes") || null,
    calendarConnected: !!await env.TOKENS.get("refreshToken:calendar"),
    calendarScopes: await env.TOKENS.get("grantedScopes:calendar") || null,
    notion: !!(env.NOTION_TOKEN && env.NOTION_TASKS_DB),
    meetingsDb: !!env.NOTION_MEETINGS_DB,
    restaurantsDb: !!env.NOTION_RESTAURANTS_DB,
    visitsDb: !!env.NOTION_VISITS_DB,
    crypto: !!env.CMC_API_KEY,
    deliveryStore: env.MESA_STORE ? await storeOp(env, "status", {}).catch((e) => ({ error: e.message })) : "not bound"
  };
}
__name(status, "status");
async function g(env, path, init = {}) {
  const token = await accessToken(env);
  const res = await fetch(`${HEALTH}/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers || {} } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg = body.error?.message || body.raw || res.statusText;
    if (res.status === 401) await env.TOKENS.delete("accessToken");
    throw fail(`Google Health ${res.status}: ${String(msg).slice(0, 300)}`, res.status === 401 ? 401 : 502);
  }
  return body;
}
__name(g, "g");
var civil = /* @__PURE__ */ __name((s) => {
  const [year, month, day] = s.split("-").map(Number);
  return { date: { year, month, day }, time: {} };
}, "civil");
var dateOf = /* @__PURE__ */ __name((c) => {
  const d = c?.date || c;
  return d && d.year ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}` : null;
}, "dateOf");
var addDays = /* @__PURE__ */ __name((s, n) => {
  const d = /* @__PURE__ */ new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}, "addDays");
async function dailyRollUp(env, type, from, to, chunk) {
  const out = [];
  for (let start = from; start <= to; start = addDays(start, chunk)) {
    let end = addDays(start, chunk);
    const stop = addDays(to, 1);
    if (end > stop) end = stop;
    let pageToken;
    do {
      const body = { range: { start: civil(start), end: civil(end) }, windowSizeDays: 1 };
      if (pageToken) body.pageToken = pageToken;
      const r = await g(env, `${type}/dataPoints:dailyRollUp`, { method: "POST", body: JSON.stringify(body) });
      out.push(...r.rollupDataPoints || r.rollUpDataPoints || r.rollup_data_points || []);
      pageToken = r.nextPageToken;
    } while (pageToken);
  }
  return out;
}
__name(dailyRollUp, "dailyRollUp");
function pickNumber(obj, preferred) {
  if (obj == null) return null;
  if (typeof obj === "number") return obj;
  if (typeof obj === "string" && obj.trim() !== "" && !isNaN(+obj)) return +obj;
  if (typeof obj !== "object") return null;
  for (const k of preferred) if (k in obj) {
    const v = pickNumber(obj[k], preferred);
    if (v !== null) return v;
  }
  for (const k of Object.keys(obj)) {
    const v = pickNumber(obj[k], preferred);
    if (v !== null) return v;
  }
  return null;
}
__name(pickNumber, "pickNumber");
var rollValue = /* @__PURE__ */ __name((p, keys2, preferred) => {
  for (const k of keys2) if (p[k] != null) return pickNumber(p[k], preferred);
  return null;
}, "rollValue");
async function listAll(env, type, filter) {
  const out = [];
  let pageToken;
  do {
    const q = new URLSearchParams({ filter, pageSize: "1000" });
    if (pageToken) q.set("pageToken", pageToken);
    const r = await g(env, `${type}/dataPoints?${q}`);
    out.push(...r.dataPoints || []);
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}
__name(listAll, "listAll");
function sleepByDay(points) {
  const days2 = {};
  for (const p of points) {
    const s = p.sleep;
    if (!s) continue;
    const end = s.interval?.endTime;
    if (!end) continue;
    const offset = parseInt(String(s.interval.endUtcOffset || "0").replace("s", ""), 10) || 0;
    const date = new Date(new Date(end).getTime() + offset * 1e3).toISOString().slice(0, 10);
    const d = days2[date] || (days2[date] = { sleepMinutes: 0, sleepDeepMin: 0, sleepRemMin: 0, sleepLightMin: 0 });
    d.sleepMinutes += Number(s.summary?.minutesAsleep || 0);
    for (const st of s.summary?.stagesSummary || []) {
      const m = Number(st.minutes || 0);
      if (st.type === "DEEP") d.sleepDeepMin += m;
      else if (st.type === "REM") d.sleepRemMin += m;
      else if (st.type === "LIGHT") d.sleepLightMin += m;
    }
  }
  return days2;
}
__name(sleepByDay, "sleepByDay");
var dateFilter = /* @__PURE__ */ __name((field, from, to) => `${field}.date >= "${from}" AND ${field}.date < "${addDays(to, 1)}"`, "dateFilter");
var civilFilter = /* @__PURE__ */ __name((field, from, to) => `${field}.sample_time.civil_time >= "${from}" AND ${field}.sample_time.civil_time < "${addDays(to, 1)}"`, "civilFilter");
function sampleByDay(points, key, pick, outKey) {
  const best = {};
  for (const p of points) {
    const s = p[key];
    if (!s) continue;
    const v = pick(s);
    if (v === null || isNaN(v)) continue;
    const civil2 = s.sampleTime?.civilTime, date = dateOf(civil2?.date);
    if (!date) continue;
    const t = s.sampleTime?.physicalTime || "";
    if (!best[date] || t > best[date].t) best[date] = { t, v };
  }
  return Object.fromEntries(Object.entries(best).map(([d, b]) => [d, { [outKey]: Math.round(b.v * 10) / 10 }]));
}
__name(sampleByDay, "sampleByDay");
function put2(put, byDay) {
  for (const [d, v] of Object.entries(byDay)) put(d, v);
}
__name(put2, "put2");
async function days(env, url) {
  const from = url.searchParams.get("from"), to = url.searchParams.get("to");
  if (!/^\d{4}-\d\d-\d\d$/.test(from || "") || !/^\d{4}-\d\d-\d\d$/.test(to || "") || from > to) throw fail("Bad date range.", 400);
  const outDays = {}, errors = [];
  const put = /* @__PURE__ */ __name((date, vals) => {
    if (date) outDays[date] = Object.assign(outDays[date] || {}, vals);
  }, "put");
  let needsReconnect = false;
  const jobs = [
    ["steps", async () => {
      for (const p of await dailyRollUp(env, "steps", from, to, 30)) {
        const v = rollValue(p, ["steps"], ["countSum", "count_sum", "count"]);
        if (v !== null) put(dateOf(p.civilStartTime || p.civil_start_time), { steps: v });
      }
    }],
    ["calories", async () => {
      for (const p of await dailyRollUp(env, "total-calories", from, to, 14)) {
        const v = rollValue(p, ["totalCalories", "total_calories"], ["kcalSum", "kcal_sum", "kcal"]);
        if (v !== null) put(dateOf(p.civilStartTime || p.civil_start_time), { caloriesOut: v });
      }
    }],
    ["sleep", async () => {
      const filter = `sleep.interval.end_time >= "${addDays(from, -1)}T00:00:00Z" AND sleep.interval.end_time < "${addDays(to, 2)}T00:00:00Z"`;
      const byDay = sleepByDay(await listAll(env, "sleep", filter));
      for (const [date, v] of Object.entries(byDay)) if (date >= from && date <= to) put(date, v);
    }],
    ["resting heart rate", async () => {
      const filter = `daily_resting_heart_rate.date >= "${from}" AND daily_resting_heart_rate.date < "${addDays(to, 1)}"`;
      for (const p of await listAll(env, "daily-resting-heart-rate", filter)) {
        const r = p.dailyRestingHeartRate;
        const date = dateOf(r?.date);
        const bpm = pickNumber(r?.beatsPerMinute, []);
        if (date && bpm !== null) put(date, { restingHr: bpm });
      }
    }],
    ["active calories", async () => {
      for (const p of await dailyRollUp(env, "active-energy-burned", from, to, 14)) {
        const v = rollValue(p, ["activeEnergyBurned", "active_energy_burned"], ["kcalSum", "kcal_sum", "kcal"]);
        if (v !== null) put(dateOf(p.civilStartTime || p.civil_start_time), { activeKcal: v });
      }
    }],
    ["weight", async () => put2(put, sampleByDay(await listAll(env, "weight", civilFilter("weight", from, to)), "weight", (p) => p.weightGrams != null ? Number(p.weightGrams) / 1e3 : null, "weightKg"))],
    ["body fat", async () => put2(put, sampleByDay(await listAll(env, "body-fat", civilFilter("body_fat", from, to)), "bodyFat", (p) => p.percentage != null ? Number(p.percentage) : null, "bodyFatPct"))],
    ["heart rate variability", async () => {
      for (const p of await listAll(env, "daily-heart-rate-variability", dateFilter("daily_heart_rate_variability", from, to))) {
        const r = p.dailyHeartRateVariability, date = dateOf(r?.date), v = pickNumber(r?.averageHeartRateVariabilityMilliseconds, []);
        if (date && v !== null) put(date, { hrv: v });
      }
    }],
    ["breathing rate", async () => {
      for (const p of await listAll(env, "daily-respiratory-rate", dateFilter("daily_respiratory_rate", from, to))) {
        const r = p.dailyRespiratoryRate, date = dateOf(r?.date), v = pickNumber(r?.breathsPerMinute, []);
        if (date && v !== null) put(date, { breathingRate: v });
      }
    }],
    ["blood oxygen", async () => {
      for (const p of await listAll(env, "daily-oxygen-saturation", dateFilter("daily_oxygen_saturation", from, to))) {
        const r = p.dailyOxygenSaturation, date = dateOf(r?.date), v = pickNumber(r?.averagePercentage, []);
        if (date && v !== null) put(date, { spo2: v });
      }
    }],
    ["skin temperature", async () => {
      for (const p of await listAll(env, "daily-sleep-temperature-derivations", dateFilter("daily_sleep_temperature_derivations", from, to))) {
        const r = p.dailySleepTemperatureDerivations, date = dateOf(r?.date);
        const night = pickNumber(r?.nightlyTemperatureCelsius, []), base = pickNumber(r?.baselineTemperatureCelsius, []);
        if (date && night !== null && base !== null) put(date, { skinTempDelta: Math.round((night - base) * 100) / 100 });
      }
    }]
  ];
  for (const [type, fn] of jobs) {
    try {
      await fn();
    } catch (e) {
      errors.push({ type, message: e.message });
      if (/reconnect|Not connected/i.test(e.message)) {
        needsReconnect = true;
        break;
      }
    }
  }
  if (errors.length) await setLastError(env, errors.map((e) => `${e.type}: ${e.message}`).join(" | "));
  else await env.TOKENS.delete("lastError");
  return { days: outDays, errors, needsReconnect };
}
__name(days, "days");
async function gcal(env, path, init = {}) {
  const token = await accessToken(env, 'calendar');
  const res = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(body.error?.message || res.statusText), reason = body.error?.errors?.[0]?.reason || '';
    if (res.status === 401) { await env.TOKENS.delete('accessToken:calendar'); throw fail('Google rejected the Calendar and Gmail login. Try again, or reconnect it.', 401, true); }
    if (res.status === 403 && /accessNotConfigured|has not been used|is disabled/i.test(`${reason} ${msg}`)) throw fail('The Google Calendar API is not switched on in your Google Cloud project yet.', 403, true);
    if (res.status === 403 && /insufficient|scope/i.test(`${reason} ${msg}`)) throw fail('Calendar permission is missing. Tap Connect Google (Calendar and Gmail) and approve it.', 403, true);
    const err = fail(`Google Calendar ${res.status}: ${msg.slice(0, 200)}`, 502, true); err.googleStatus = res.status; throw err;
  }
  return body;
}

function htmlToText(s) {
  return String(s || "").replace(/<\s*br\s*\/?>/gi, "\n").replace(/<li[^>]*>/gi, "\n\u2022 ").replace(/<\/?(p|div|li|ul|ol|h\d|tr)[^>]*>/gi, "\n").replace(/<a\s[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (m, h, t) => t.replace(/<[^>]+>/g, "").trim() === h ? h : `${t.replace(/<[^>]+>/g, "")} (${h})`).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();
}
__name(htmlToText, "htmlToText");
function mapEvent(ev, calName) {
  const self = (ev.attendees || []).find((a) => a.self);
  if (ev.status === "cancelled" || self?.responseStatus === "declined" || ev.eventType === "workingLocation") return null;
  const video = ev.hangoutLink || (ev.conferenceData?.entryPoints || []).find((e) => e.entryPointType === "video")?.uri || null;
  return {
    id: ev.id,
    uid: ev.iCalUID || ev.id,
    calendar: calName,
    title: ev.summary || "(no title)",
    start: ev.start?.dateTime || ev.start?.date || null,
    end: ev.end?.dateTime || ev.end?.date || null,
    allDay: !!ev.start?.date,
    location: ev.location || "",
    description: htmlToText(ev.description).slice(0, 2e3),
    video,
    link: ev.htmlLink || null,
    response: self?.responseStatus || null,
    busy: ev.transparency !== "transparent",
    recurring: !!ev.recurringEventId,
    organizer: ev.organizer?.displayName || ev.organizer?.email || "",
    attendees: (ev.attendees || []).filter((a) => !a.resource).slice(0, 15).map((a) => ({ name: a.displayName || a.email || "", email: a.email || "", response: a.responseStatus || "needsAction", self: !!a.self, organizer: !!a.organizer, optional: !!a.optional })),
    attendeeCount: (ev.attendees || []).filter((a) => !a.resource).length
  };
}
__name(mapEvent, "mapEvent");
async function calendar(env, url) {
  const from = url.searchParams.get('from'), to = url.searchParams.get('to');
  const f = Date.parse(from || ''), t = Date.parse(to || '');
  if (isNaN(f) || isNaN(t) || t <= f || t - f > 8 * 86400e3) throw fail('Bad time range.', 400, true);
  const list = await gcal(env, 'users/me/calendarList?minAccessRole=reader&maxResults=50');
  const cals = (list.items || []).filter(c => (c.selected || c.primary) && !c.deleted && !c.hidden).slice(0, 12);
  const seen = new Set(), events = [], errors = [];
  const fields = 'nextPageToken,items(id,iCalUID,status,summary,description,location,start,end,attendees(displayName,email,responseStatus,self,organizer,optional,resource),organizer,hangoutLink,conferenceData(entryPoints(entryPointType,uri)),htmlLink,eventType,recurringEventId,transparency)';
  for (const c of cals) {
    try {
      const q = new URLSearchParams({ timeMin: new Date(f).toISOString(), timeMax: new Date(t).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '100', fields });
      let token = '', pages = 0;
      do {
      if (token) q.set('pageToken', token);
      const r = await gcal(env, `calendars/${encodeURIComponent(c.id)}/events?${q}`);
      for (const ev of r.items || []) {
        const m = mapEvent(ev, c.summaryOverride || c.summary || '');
        if (!m || !m.start) continue;
        const key = `${m.uid}|${m.start}`; // the same meeting can sit on two of your calendars
        if (seen.has(key)) continue;
        seen.add(key); events.push(m);
      }
      token = r.nextPageToken || ''; pages++;
      if (token && pages >= 20) throw fail('This calendar is too busy to load completely. Narrow the time range.', 409, true);
      } while (token);
    } catch (e) {
      if (/permission is missing|not switched on|rejected the calendar login|Not connected|reconnect/i.test(e.message)) throw e;
      errors.push({ calendar: c.summary || c.id, message: e.message });
    }
  }
  events.sort((a, b) => (b.allDay - a.allDay) || (Date.parse(a.start) - Date.parse(b.start)));
  return { events, errors, calendars: cals.map(c => c.summaryOverride || c.summary), calendarList: cals.map(c => ({ id: c.id, summary: c.summaryOverride || c.summary || "", primary: !!c.primary, accessRole: c.accessRole || "" })) };
}

// One completion per stable source ID, including retries after a timeout. Never matches by date alone.
async function calendarComplete(env, b) {
  if (b.source !== 'gym' || !/^[A-Za-z0-9_-]{3,120}$/.test(String(b.sourceId || ''))) throw fail('A stable Gym workout ID is required.', 400, true);
  const f = Date.parse(b.start || ''), t = Date.parse(b.end || '');
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(b.start || '') || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(b.end || '') || !Number.isFinite(f) || !Number.isFinite(t) || t <= f || t - f > 24 * 3600e3 || t > Date.now() + 5 * 60e3) throw fail('Real workout start and finish timestamps are required.', 400, true);
  const key = 'gym|' + b.sourceId;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const id = 'gm' + Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
  const path = 'calendars/primary/events/' + id;
  const result = ev => {
    if (ev.status === 'cancelled') return { canceled: true, eventId: id };
    if (ev.extendedProperties?.private?.sportsSource !== key) throw fail('This calendar ID is already in use. No event was changed.', 409, true);
    if (Date.parse(ev.start?.dateTime) !== f || Date.parse(ev.end?.dateTime) !== t) return { event: mapEvent(ev, 'Primary'), moved: true };
    return { event: mapEvent(ev, 'Primary') };
  };
  try { return result(await gcal(env, path)); } catch (e) { if (e.googleStatus !== 404) throw e; }
  const savedId = await env.TOKENS.get('sports-event:' + key);
  if (savedId) return result(await gcal(env, 'calendars/primary/events/' + encodeURIComponent(savedId)));
  // A previous manual link may not have the deterministic event ID. Find its exact source binding.
  const bound = await gcal(env, 'calendars/primary/events?' + new URLSearchParams({ privateExtendedProperty: 'sportsSource=' + key, maxResults: '3' }));
  if (bound.nextPageToken || (bound.items || []).length > 1) throw fail('More than one calendar entry has this workout binding. Review required.', 409, true);
  if (bound.items?.length) { await env.TOKENS.put('sports-event:' + key, bound.items[0].id); return result(bound.items[0]); }
  const marker = b.activityId && /^[A-Za-z0-9_-]{3,120}$/.test(b.activityId) ? '[myday-activity:' + b.activityId + ']' : '';
  let candidates = [];
  if (marker) {
    const linked = await gcal(env, 'calendars/primary/events?' + new URLSearchParams({ q: marker, maxResults: '100' }));
    candidates = (linked.items || []).filter(ev => ev.status !== 'cancelled' && String(ev.description || '').includes(marker));
    if (linked.nextPageToken || candidates.length > 1) throw fail('This MyDay plan has more than one calendar entry. Review required.', 409, true);
  }
  if (!candidates.length) {
    const nearby = await gcal(env, 'calendars/primary/events?' + new URLSearchParams({ timeMin: new Date(f).toISOString(), timeMax: new Date(t).toISOString(), singleEvents: 'true', maxResults: '100' }));
    if (nearby.nextPageToken) throw fail('Could not check every overlapping calendar entry. Retry after reviewing Calendar.', 409, true);
    candidates = (nearby.items || []).filter(ev => ev.status !== 'cancelled' && /\b(gym|gimnasio|workout)\b/i.test(ev.summary || '') && Date.parse(ev.start?.dateTime) < t && Date.parse(ev.end?.dateTime) > f);
    if (b.linkEventId) {
      const chosen = candidates.find(ev => ev.id === b.linkEventId);
      if (!chosen) throw fail('That calendar entry no longer matches. Refresh before linking.', 409, true);
      candidates = [chosen];
    } else if (candidates.length && !b.allowSeparate) return { needsReview: true, candidates: candidates.map(ev => mapEvent(ev, 'Primary')).filter(Boolean) };
    else candidates = [];
  }
  if (candidates.length) {
    const ev = candidates[0], oldKey = ev.extendedProperties?.private?.sportsSource;
    if (ev.attendees?.some(a => !a.self) || ev.organizer?.self === false || (oldKey && oldKey !== key)) throw fail('This entry is invited or already linked to a different workout. No change was made.', 409, true);
    const changed = await gcal(env, 'calendars/primary/events/' + encodeURIComponent(ev.id) + '?sendUpdates=none', { method: 'PATCH', headers: ev.etag ? { 'If-Match': ev.etag } : {}, body: JSON.stringify({ start: { dateTime: new Date(f).toISOString(), timeZone: 'Europe/Madrid' }, end: { dateTime: new Date(t).toISOString(), timeZone: 'Europe/Madrid' }, description: String(ev.description || '') + '\nCompleted workout saved in Gym.\n[sports-source:' + key + ']', extendedProperties: { private: { ...(ev.extendedProperties?.private || {}), sportsSource: key } } }) });
    await env.TOKENS.put('sports-event:' + key, ev.id);
    return result(changed);
  }
  const title = String(b.title || 'Workout').replace(/[\r\n]/g, ' ').slice(0, 120);
  const ev = { id, summary: 'Gym · ' + title, start: { dateTime: new Date(f).toISOString(), timeZone: 'Europe/Madrid' }, end: { dateTime: new Date(t).toISOString(), timeZone: 'Europe/Madrid' }, description: 'Completed workout saved in Gym.\n[sports-source:' + key + ']' + (marker ? '\n' + marker : ''), extendedProperties: { private: { sportsSource: key } } };
  try { return result(await gcal(env, 'calendars/primary/events?sendUpdates=none', { method: 'POST', body: JSON.stringify(ev) })); }
  catch (e) { if (e.googleStatus === 409) return result(await gcal(env, path)); throw e; }
}

async function notion(env, path, method = "GET", body) {
  if (!env.NOTION_TOKEN || !env.NOTION_TASKS_DB) throw fail("Notion is not set up on the Worker yet.", 409, true);
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : void 0
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = res.status === 404 ? " Did you share the task database with your integration?" : res.status === 401 ? " The Notion token was rejected." : "";
    throw fail(`Notion ${res.status}: ${String(data.message || res.statusText).slice(0, 200)}${hint}`, 502, true);
  }
  return data;
}
__name(notion, "notion");
function mapTask(p) {
  const pr = p.properties || {}, text = /* @__PURE__ */ __name((a) => (a || []).map((t) => t.plain_text).join(""), "text");
  return {
    id: p.id,
    title: text(pr.Name?.title).trim() || "(untitled)",
    status: pr.Status?.status?.name || "",
    due: pr["Due Date"]?.date?.start || null,
    done: pr["Completion Date"]?.date?.start || null,
    types: (pr.Type?.multi_select || []).map((o) => o.name),
    tags: (pr.Tags?.multi_select || []).map((o) => o.name),
    waiting: !!pr["Waiting on"]?.checkbox,
    next: text(pr["Next Step"]?.rich_text).trim(),
    url: p.url,
    people: (pr.Person?.relation || []).map((r) => r.id),
    crm: (pr.Person?.relation || []).length > 0 || (pr["Company (direct)"]?.relation || []).length > 0
  };
}
__name(mapTask, "mapTask");
async function queryTasks(env, filter, sorts, max = 200) {
  const out = [];
  let cursor;
  do {
    const r = await notion(env, `databases/${env.NOTION_TASKS_DB}/query`, "POST", { filter, sorts, page_size: 100, ...cursor ? { start_cursor: cursor } : {} });
    out.push(...(r.results || []).map(mapTask));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor && out.length < max);
  return out;
}
__name(queryTasks, "queryTasks");
async function tasks(env, url) {
  const date = url.searchParams.get("date");
  if (!/^\d{4}-\d\d-\d\d$/.test(date || "")) throw fail("Bad date.", 400, true);
  const open = await queryTasks(
    env,
    { and: [{ property: "Status", status: { does_not_equal: "Done" } }, { property: "Status", status: { does_not_equal: "Backlog" } }] },
    [{ property: "Due Date", direction: "ascending" }]
  );
  const doneOn = await queryTasks(env, { property: "Completion Date", date: { equals: date } }, void 0, 100);
  return { open, doneOn };
}
__name(tasks, "tasks");
var TASK_STATUS = ["Not started", "In progress"];
var TASK_TYPES = ["Personal", "Work", "Advisory"];
var isPageId = /* @__PURE__ */ __name((s) => /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(s || ""), "isPageId");
var isDate = /* @__PURE__ */ __name((s) => /^\d{4}-\d\d-\d\d$/.test(s || ""), "isDate");
async function taskAction(env, action, b) {
  if (action === "done") {
    if (!isPageId(b.id) || !isDate(b.date)) throw fail("Need a task id and a date.", 400, true);
    const p = await notion(env, `pages/${b.id}`, "PATCH", { properties: { Status: { status: { name: "Done" } }, "Completion Date": { date: { start: b.date } } } });
    return { task: mapTask(p) };
  }
  if (action === "reopen") {
    const status2 = TASK_STATUS.includes(b.status) ? b.status : "Not started";
    if (!isPageId(b.id)) throw fail("Need a task id.", 400, true);
    const p = await notion(env, `pages/${b.id}`, "PATCH", { properties: { Status: { status: { name: status2 } }, "Completion Date": { date: null } } });
    return { task: mapTask(p) };
  }
  if (action === "add") {
    const title = String(b.title || "").trim();
    if (!title || title.length > 200) throw fail("Give the task a title (up to 200 characters).", 400, true);
    const properties = { Name: { title: [{ text: { content: title } }] } };
    if (b.due) {
      if (!isDate(b.due)) throw fail("Bad due date.", 400, true);
      properties["Due Date"] = { date: { start: b.due } };
    }
    if (b.type) {
      if (!TASK_TYPES.includes(b.type)) throw fail("Unknown type.", 400, true);
      properties.Type = { multi_select: [{ name: b.type }] };
    }
    if (b.notes) properties.Notes = { rich_text: [{ text: { content: String(b.notes).slice(0, 1900) } }] };
    if (b.person) {
      if (!isPageId(b.person)) throw fail("Bad person id.", 400, true);
      properties.Person = { relation: [{ id: b.person }] };
    }
    const p = await notion(env, "pages", "POST", { parent: { database_id: env.NOTION_TASKS_DB }, properties });
    return { task: mapTask(p) };
  }
  throw fail("Not found", 404, true);
}
__name(taskAction, "taskAction");
function mapPerson(p) {
  const pr = p.properties || {}, text = /* @__PURE__ */ __name((a) => (a || []).map((t) => t.plain_text).join("").trim(), "text");
  const fdate = /* @__PURE__ */ __name((x) => x?.formula?.date?.start || x?.formula?.string || null, "fdate");
  return {
    id: p.id,
    url: p.url,
    name: text(pr.Name?.title),
    email: String(pr.Email?.email || "").toLowerCase(),
    role: text(pr.Role?.rich_text),
    companyIds: (pr.Company?.relation || []).map((r) => r.id),
    tier: pr.Tier?.select?.name || "",
    summary: text(pr["History summary"]?.rich_text).slice(0, 700),
    how: text(pr["How We Know Each Other"]?.rich_text).slice(0, 200),
    lastContacted: fdate(pr["Last Contacted"]),
    followStatus: pr["Follow-up Status"]?.formula?.string || "",
    nextFollowUp: pr["Next Follow-up"]?.date?.start || null,
    latestInteraction: pr["Latest Interaction"]?.rollup?.date?.start || null,
    latestMeeting: pr["Latest Meeting"]?.rollup?.date?.start || null
  };
}
__name(mapPerson, "mapPerson");
async function brief(env, b) {
  if (!env.NOTION_PEOPLE_DB) throw fail("The CRM is not set up on the Worker yet (NOTION_PEOPLE_DB).", 409, true);
  const emails = [...new Set((Array.isArray(b.emails) ? b.emails : []).map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+$/.test(e) && e.length < 120))].slice(0, 15);
  if (!emails.length) return { people: [], unmatched: [] };
  const found = await notion(env, `databases/${env.NOTION_PEOPLE_DB}/query`, "POST", {
    filter: { or: emails.map((e) => ({ property: "Email", email: { contains: e } })) },
    page_size: 30
  });
  const people = (found.results || []).map(mapPerson).filter((p) => emails.includes(p.email));
  const matched = new Set(people.map((p) => p.email));
  const companyIds = [...new Set(people.flatMap((p) => p.companyIds))].slice(0, 8);
  const [companies, taskRes] = await Promise.all([
    Promise.all(companyIds.map((id) => notion(env, `pages/${id}`).then((pg) => [id, Object.values(pg.properties || {}).find((x) => x.type === "title")?.title?.map((t) => t.plain_text).join("").trim() || ""], () => [id, ""]))),
    people.length ? notion(env, `databases/${env.NOTION_TASKS_DB}/query`, "POST", { filter: { and: [
      { or: people.map((p) => ({ property: "Person", relation: { contains: p.id } })) },
      { property: "Status", status: { does_not_equal: "Done" } },
      { property: "Status", status: { does_not_equal: "Backlog" } }
    ] }, page_size: 50 }) : { results: [] }
  ]);
  const names = Object.fromEntries(companies), tasks2 = (taskRes.results || []).map(mapTask);
  return {
    people: people.map(({ companyIds: ids, ...p }) => ({
      ...p,
      company: ids.map((i) => names[i]).filter(Boolean).join(", "),
      tasks: tasks2.filter((t) => t.people.includes(p.id)).map((t) => ({ id: t.id, title: t.title, due: t.due, status: t.status, waiting: t.waiting }))
    })),
    unmatched: emails.filter((e) => !matched.has(e))
  };
}
__name(brief, "brief");
var isEmail = /* @__PURE__ */ __name((e) => /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(e) && e.length < 120, "isEmail");
function buildEvent(b) {
  const title = String(b.title || "").trim();
  if (!title || title.length > 200) throw fail("Give the event a title (up to 200 characters).", 400, true);
  const body = { summary: title };
  if (b.location) body.location = String(b.location).slice(0, 200);
  if (b.description) body.description = String(b.description).slice(0, 2e3);
  if (b.allDay) {
    if (!/^\d{4}-\d\d-\d\d$/.test(b.start || "") || !/^\d{4}-\d\d-\d\d$/.test(b.end || "") || b.end <= b.start) throw fail("Bad dates for an all-day event.", 400, true);
    body.start = { date: b.start };
    body.end = { date: b.end };
  } else {
    const s = Date.parse(b.start || ""), e = Date.parse(b.end || "");
    if (isNaN(s) || isNaN(e) || e <= s || e - s > 14 * 864e5) throw fail("Bad start or end time.", 400, true);
    const tz = /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+){0,2}$/.test(b.timeZone || "") ? b.timeZone : void 0;
    body.start = { dateTime: new Date(s).toISOString(), ...tz ? { timeZone: tz } : {} };
    body.end = { dateTime: new Date(e).toISOString(), ...tz ? { timeZone: tz } : {} };
  }
  const guests = [...new Set((Array.isArray(b.guests) ? b.guests : []).map((g2) => String(g2).trim().toLowerCase()).filter(Boolean))];
  if (guests.length > 20 || guests.some((g2) => !isEmail(g2))) throw fail("Check the guest email addresses (up to 20).", 400, true);
  if (guests.length) body.attendees = guests.map((email) => ({ email }));
  if (b.meet) body.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
  return { body, query: `conferenceDataVersion=1&sendUpdates=${guests.length ? "all" : "none"}` };
}
__name(buildEvent, "buildEvent");
async function calendarAdd(env, b) {
  const { body, query } = buildEvent(b);
  let calId = "primary";
  if (b.calendarId && b.calendarId !== "primary") {
    const list = await gcal(env, "users/me/calendarList?minAccessRole=reader&maxResults=50");
    const target = (list.items || []).find((c) => c.id === b.calendarId && !c.deleted);
    if (!target) throw fail("Unknown calendar.", 400, true);
    if (!["writer", "owner"].includes(target.accessRole)) throw fail("That calendar is read-only for this account.", 400, true);
    calId = b.calendarId;
  }
  const ev = await gcal(env, `calendars/${encodeURIComponent(calId)}/events?${query}`, { method: "POST", body: JSON.stringify(body) });
  return { event: mapEvent(ev, "Calendar") || { id: ev.id, title: body.summary } };
}
__name(calendarAdd, "calendarAdd");
async function ggmail(env, path) {
  const token = await accessToken(env, "calendar");
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(body.error?.message || res.statusText);
    if (res.status === 401) {
      await env.TOKENS.delete("accessToken:calendar");
      throw fail("Google rejected the Calendar and Gmail login. Try again, or reconnect it.", 401, true);
    }
    if (res.status === 403 && /has not been used|is disabled|accessNotConfigured/i.test(msg)) throw fail("The Gmail API is not switched on in your Google Cloud project yet.", 403, true);
    if (res.status === 403 && /insufficient|scope/i.test(msg)) throw fail("Gmail permission is missing. Tap Connect Google (Calendar and Gmail) and approve it.", 403, true);
    throw fail(`Gmail ${res.status}: ${msg.slice(0, 200)}`, 502, true);
  }
  return body;
}
__name(ggmail, "ggmail");
function decodeEntities(s) {
  return String(s || "").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");
}
__name(decodeEntities, "decodeEntities");
function parseFrom(h) {
  const raw2 = String(h || "").trim(), m = /^"?([^"<]*?)"?\s*<([^>]+)>$/.exec(raw2);
  if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim().toLowerCase() };
  return { name: raw2, email: raw2.toLowerCase() };
}
__name(parseFrom, "parseFrom");
function mapMail(m) {
  const hdr = /* @__PURE__ */ __name((n) => (m.payload?.headers || []).find((h) => h.name.toLowerCase() === n)?.value || "", "hdr");
  const from = parseFrom(hdr("from"));
  return {
    id: m.id,
    threadId: m.threadId,
    from,
    to: hdr("to").toLowerCase(),
    subject: decodeEntities(hdr("subject")) || "(no subject)",
    snippet: decodeEntities(m.snippet).slice(0, 220),
    at: Number(m.internalDate) || 0,
    starred: (m.labelIds || []).includes("STARRED"),
    unread: (m.labelIds || []).includes("UNREAD")
  };
}
__name(mapMail, "mapMail");
var gmailMeta = /* @__PURE__ */ __name((env, id) => ggmail(env, `users/me/messages/${encodeURIComponent(id)}?${new URLSearchParams([["format", "metadata"], ["metadataHeaders", "From"], ["metadataHeaders", "To"], ["metadataHeaders", "Subject"], ["fields", "id,threadId,labelIds,snippet,internalDate,payload/headers"]])}`).then(mapMail), "gmailMeta");
async function crmMatch(env, emails) {
  if (!env.NOTION_TOKEN || !env.NOTION_PEOPLE_DB || !emails.length) return {};
  try {
    const found = await notion(env, `databases/${env.NOTION_PEOPLE_DB}/query`, "POST", { filter: { or: emails.slice(0, 40).map((e) => ({ property: "Email", email: { contains: e } })) }, page_size: 50 });
    const out = {};
    for (const p of (found.results || []).map(mapPerson)) if (p.email && emails.includes(p.email)) out[p.email] = { id: p.id, name: p.name, tier: p.tier };
    return out;
  } catch {
    return {};
  }
}
__name(crmMatch, "crmMatch");
var PRIMARY_ONLY = "-category:social -category:promotions -category:updates -category:forums";
async function mailInbox(env) {
  const q = new URLSearchParams([["labelIds", "INBOX"], ["labelIds", "UNREAD"], ["maxResults", "20"], ["q", PRIMARY_ONLY]]);
  const [list, profile] = await Promise.all([ggmail(env, `users/me/messages?${q}`), ggmail(env, "users/me/profile")]);
  const messages = await Promise.all((list.messages || []).slice(0, 20).map((m) => gmailMeta(env, m.id)));
  const crm = await crmMatch(env, [...new Set(messages.map((m) => m.from.email))]);
  return {
    account: profile.emailAddress || "",
    unread: list.nextPageToken ? list.resultSizeEstimate || messages.length : messages.length,
    messages: messages.map((m) => ({ ...m, crm: crm[m.from.email] || null }))
  };
}
__name(mailInbox, "mailInbox");
function b64url(s) {
  try {
    const bin = atob(String(s).replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}
__name(b64url, "b64url");
function cleanBody(raw2, max = 1800) {
  let t = "\n" + String(raw2 || "").replace(/\r\n/g, "\n");
  for (const m of [/\nOn .{5,160} wrote:\s*\n/i, /\nEl .{5,160} escribi[oó]:\s*\n/i, /\n-{2,}\s*(Original Message|Mensaje original)\s*-{2,}/i, /\nFrom:\s.+\n(Sent|Date):\s/i, /\n_{8,}\n/]) {
    const i = t.search(m);
    if (i >= 0 && t.slice(0, i).trim().length >= 2) t = t.slice(0, i);
  }
  t = t.split("\n").filter((l) => !/^\s*>/.test(l)).join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  let truncated = false;
  if (t.length > max) {
    t = t.slice(0, max).replace(/\s+\S*$/, "");
    truncated = true;
  }
  return { text: t, truncated };
}
__name(cleanBody, "cleanBody");
function bodyOf(payload) {
  const found = { plain: "", html: "", files: [] };
  const walk = /* @__PURE__ */ __name((part) => {
    if (!part) return;
    if (part.filename) found.files.push({ name: part.filename, size: Number(part.body?.size) || 0 });
    else if (part.body?.data) {
      const txt = b64url(part.body.data);
      if (part.mimeType === "text/plain" && !found.plain) found.plain = txt;
      else if (part.mimeType === "text/html" && !found.html) found.html = txt;
    }
    (part.parts || []).forEach(walk);
  }, "walk");
  walk(payload);
  const raw2 = found.plain || htmlToText(found.html.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ""));
  return { ...cleanBody(raw2), files: found.files.slice(0, 6) };
}
__name(bodyOf, "bodyOf");
async function mailMessage(env, b) {
  const id = String(b.id || "");
  if (!/^[0-9a-f]{6,32}$/i.test(id)) throw fail("Bad mail id.", 400, true);
  const m = await ggmail(env, `users/me/messages/${id}?format=full`);
  const body = bodyOf(m.payload);
  return { id: m.id, text: body.text || decodeEntities(m.snippet || ""), truncated: body.truncated, files: body.files };
}
__name(mailMessage, "mailMessage");
async function mailThreads(env, b) {
  const emails = [...new Set((Array.isArray(b.emails) ? b.emails : []).map((e) => String(e).trim().toLowerCase()).filter(isEmail))].slice(0, 8);
  if (!emails.length) return { account: "", messages: [] };
  const q = `(${emails.map((e) => `from:${e} OR to:${e}`).join(" OR ")})`;
  const [list, profile] = await Promise.all([ggmail(env, `users/me/messages?${new URLSearchParams({ q, maxResults: "10" })}`), ggmail(env, "users/me/profile")]);
  const all = await Promise.all((list.messages || []).slice(0, 10).map((m) => gmailMeta(env, m.id)));
  const seen = /* @__PURE__ */ new Set(), account = (profile.emailAddress || "").toLowerCase();
  const messages = all.filter((m) => !seen.has(m.threadId) && seen.add(m.threadId)).slice(0, 5).map((m) => ({ ...m, mine: !!account && m.from.email === account }));
  return { account: profile.emailAddress || "", messages };
}
__name(mailThreads, "mailThreads");
async function newMeeting(env, b) {
  if (!env.NOTION_MEETINGS_DB) throw fail("The Meetings database is not set up on the Worker yet (NOTION_MEETINGS_DB).", 409, true);
  const title = String(b.title || "Meeting").trim().slice(0, 200) || "Meeting";
  const properties = { Name: { title: [{ text: { content: title } }] } };
  const sOk = b.start && !isNaN(Date.parse(b.start));
  if (sOk) {
    const date = { start: b.start };
    if (b.end && !isNaN(Date.parse(b.end)) && Date.parse(b.end) > Date.parse(b.start) && String(b.start).includes("T")) date.end = b.end;
    properties.Date = { date };
  }
  const ids = [...new Set((Array.isArray(b.attendees) ? b.attendees : []).filter(isPageId))].slice(0, 20);
  if (ids.length) properties.Attendees = { relation: ids.map((id) => ({ id })) };
  const p = await notion(env, "pages", "POST", { parent: { database_id: env.NOTION_MEETINGS_DB }, properties });
  return { url: p.url, id: p.id };
}
__name(newMeeting, "newMeeting");
var R_CITIES = ["Madrid", "Costa Brava", "Vienna"];
var R_METHODS = ["CoverManager", "Molzait", "TheFork", "Myrestoo", "Agora POS", "Own website", "Phone", "WhatsApp", "Email", "Walk-in", "Unknown"];
var R_CARDS = ["Unknown", "No", "Yes - guarantee", "Yes - deposit", "No card before submit", "Card guarantee", "No card (tested slots)", "Deposit"];
var CARD_YES = ["Yes - guarantee", "Yes - deposit", "Card guarantee", "Deposit"];
var CARD_NO = ["No", "No card before submit", "No card (tested slots)"];
var AUTO_YES = ["Books automatically", "Pre-submit verified (no card)"];
var cardStatus = /* @__PURE__ */ __name((card, auto) => CARD_YES.includes(card) || auto === "Needs card" ? "Yes" : CARD_NO.includes(card) ? "No" : "Unknown", "cardStatus");
var R_PRICES = ["\u20AC", "\u20AC\u20AC", "\u20AC\u20AC\u20AC", "\u20AC\u20AC\u20AC\u20AC"];
var R_MEALS = ["Lunch", "Dinner", "Brunch"];
var R_TAGS = ["Outdoors", "Terrace", "Sea view", "Group-friendly", "Kids welcome", "Romantic", "Special occasion", "Casual", "Fine dining", "Vegetarian options", "Dog-friendly", "Quiet", "Lively"];
var R_WISHLIST = ["Want to try", "Booked"];
var R_AUTO = ["Books automatically", "Needs card", "Captcha or block", "Manual", "No online booking", "Not checked", "Pre-submit verified (no card)", "Partly verified", "Not verified - page issue", "Request - restaurant confirms", "Online unavailable in check"];
function mapRestaurant(p) {
  const pr = p.properties || {}, text = /* @__PURE__ */ __name((a) => (a || []).map((t) => t.plain_text).join("").trim(), "text");
  return {
    id: p.id,
    url: p.url,
    name: text(pr.Name?.title) || "(untitled)",
    city: pr.City?.select?.name || "",
    area: text(pr.Area?.rich_text),
    cuisine: pr.Cuisine?.select?.name || "",
    meals: (pr.Meal?.multi_select || []).map((o) => o.name),
    tags: (pr.Tags?.multi_select || []).map((o) => o.name),
    price: pr.Price?.select?.name || "",
    favourite: !!pr.Favourite?.checkbox,
    method: pr["Booking method"]?.select?.name || "Unknown",
    bookingLink: pr["Booking link"]?.url || "",
    platformId: text(pr["Platform id"]?.rich_text),
    website: pr.Website?.url || "",
    phone: pr.Phone?.phone_number || "",
    whatsapp: pr.WhatsApp?.phone_number || "",
    card: pr["Card needed"]?.select?.name || "Unknown",
    policy: text(pr["Deposit / policy"]?.rich_text),
    notes: text(pr.Notes?.rich_text),
    lastVisit: pr["Last visit"]?.date?.start || null,
    visits: pr.Visits?.number ?? 0,
    rating: typeof pr["My rating"]?.number === "number" ? pr["My rating"].number : null,
    wishlist: pr.Wishlist?.select?.name || "",
    why: text(pr["Why / recommended by"]?.rich_text),
    added: (p.created_time || "").slice(0, 10),
    autoBooking: pr["Auto booking"]?.select?.name || "",
    autoNotes: text(pr["Auto booking notes"]?.rich_text),
    autoBook: AUTO_YES.includes(pr["Auto booking"]?.select?.name || ""),
    cardStatus: cardStatus(pr["Card needed"]?.select?.name || "Unknown", pr["Auto booking"]?.select?.name || ""),
    address: text(pr.Address?.rich_text),
    hours: text(pr["Opening hours"]?.rich_text),
    myNotes: text(pr["My notes"]?.rich_text)
  };
}
__name(mapRestaurant, "mapRestaurant");
var rtext = /* @__PURE__ */ __name((s, max = 1900) => ({ rich_text: s ? [{ text: { content: String(s).slice(0, max) } }] : [] }), "rtext");
var isHttp = /* @__PURE__ */ __name((s) => /^https?:\/\/[^\s]{3,500}$/i.test(s || ""), "isHttp");
var isPhone = /* @__PURE__ */ __name((s) => /^\+?[0-9 ()./-]{5,25}$/.test(s || ""), "isPhone");
function restaurantProps(b, creating = false) {
  const out = {}, bad = /* @__PURE__ */ __name((m) => {
    throw fail(m, 400, true);
  }, "bad");
  const has = /* @__PURE__ */ __name((k) => Object.prototype.hasOwnProperty.call(b, k), "has");
  if (has("name")) {
    const n = String(b.name || "").trim();
    if (!n || n.length > 120) bad("Give the restaurant a name (up to 120 characters).");
    out.Name = { title: [{ text: { content: n } }] };
  } else if (creating) bad("Give the restaurant a name.");
  if (has("city")) {
    if (b.city && !R_CITIES.includes(b.city)) bad("Unknown city.");
    out.City = { select: b.city ? { name: b.city } : null };
  } else if (creating) bad("Pick a city.");
  if (has("area")) out.Area = rtext(b.area, 100);
  if (has("cuisine")) {
    const c = String(b.cuisine || "").trim().replace(/,/g, " ");
    if (c.length > 40) bad("Cuisine is too long.");
    out.Cuisine = { select: c ? { name: c } : null };
  }
  if (has("meals")) {
    const m = Array.isArray(b.meals) ? b.meals : [];
    if (m.some((x) => !R_MEALS.includes(x))) bad("Unknown meal.");
    out.Meal = { multi_select: m.map((name) => ({ name })) };
  }
  if (has("tags")) {
    const t = Array.isArray(b.tags) ? b.tags : [];
    if (t.some((x) => !R_TAGS.includes(x))) bad("Unknown tag.");
    out.Tags = { multi_select: [...new Set(t)].map((name) => ({ name })) };
  }
  if (has("price")) {
    if (b.price && !R_PRICES.includes(b.price)) bad("Unknown price level.");
    out.Price = { select: b.price ? { name: b.price } : null };
  }
  if (has("favourite")) out.Favourite = { checkbox: !!b.favourite };
  if (has("method")) {
    if (!R_METHODS.includes(b.method)) bad("Unknown booking method.");
    out["Booking method"] = { select: { name: b.method } };
  }
  for (const [k, prop] of [["bookingLink", "Booking link"], ["website", "Website"]]) if (has(k)) {
    if (b[k] && !isHttp(b[k])) bad(`${prop} must start with http:// or https://.`);
    out[prop] = { url: b[k] || null };
  }
  for (const [k, prop] of [["phone", "Phone"], ["whatsapp", "WhatsApp"]]) if (has(k)) {
    if (b[k] && !isPhone(b[k])) bad(`${prop} number looks wrong.`);
    out[prop] = { phone_number: b[k] || null };
  }
  if (has("platformId")) out["Platform id"] = rtext(b.platformId, 100);
  if (has("card")) {
    if (!R_CARDS.includes(b.card)) bad("Unknown card setting.");
    out["Card needed"] = { select: { name: b.card } };
  }
  if (has("policy")) out["Deposit / policy"] = rtext(b.policy);
  if (has("notes")) out.Notes = rtext(b.notes);
  if (has("lastVisit")) {
    if (b.lastVisit && !isDate(b.lastVisit)) bad("Bad date.");
    out["Last visit"] = { date: b.lastVisit ? { start: b.lastVisit } : null };
  }
  if (has("wishlist")) {
    if (b.wishlist && !R_WISHLIST.includes(b.wishlist)) bad("Unknown wishlist status.");
    out.Wishlist = { select: b.wishlist ? { name: b.wishlist } : null };
  }
  if (has("why")) out["Why / recommended by"] = rtext(b.why);
  if (has("autoBooking")) {
    if (b.autoBooking && !R_AUTO.includes(b.autoBooking)) bad("Unknown auto booking status.");
    out["Auto booking"] = { select: b.autoBooking ? { name: b.autoBooking } : null };
  }
  if (has("autoNotes")) out["Auto booking notes"] = rtext(b.autoNotes);
  if (has("address")) out.Address = rtext(b.address, 200);
  if (has("hours")) out["Opening hours"] = rtext(b.hours, 700);
  if (has("myNotes")) out["My notes"] = rtext(b.myNotes, 1900);
  if (has("rating")) {
    const n = b.rating === null || b.rating === "" ? null : Number(b.rating);
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 10)) bad("Your score is a whole number from 1 to 10.");
    out["My rating"] = { number: n };
  }
  if (has("visits")) {
    const n = Number(b.visits);
    if (!Number.isInteger(n) || n < 0 || n > 999) bad("Visits must be a whole number.");
    out.Visits = { number: n };
  }
  return out;
}
__name(restaurantProps, "restaurantProps");
function restaurantDb(env) {
  if (!env.NOTION_RESTAURANTS_DB) throw fail("The restaurant list is not set up on the Worker yet (NOTION_RESTAURANTS_DB).", 409, true);
  return env.NOTION_RESTAURANTS_DB;
}
__name(restaurantDb, "restaurantDb");
var restaurantHint = /* @__PURE__ */ __name((e) => {
  if (/Notion 404/.test(e.message)) e.message += " Open the Restaurant Favourites database in Notion, then \u2022\u2022\u2022 > Connections, and add your integration.";
  return e;
}, "restaurantHint");
async function restaurantList(env) {
  const db = restaurantDb(env), out = [];
  // Never present a partial list as complete: paginate to the end (bounded), and say
  // so when the bound trips. The membership merge treats absence from the newest fetch
  // as archived-in-Notion; a silently truncated fetch would delete real restaurants
  // from every device. The client refuses to stamp an incomplete list.
  let cursor, pages = 0, truncated = false;
  try {
    do {
      const r = await notion(env, `databases/${db}/query`, "POST", { page_size: 100, ...cursor ? { start_cursor: cursor } : {} });
      out.push(...(r.results || []).map(mapRestaurant));
      cursor = r.has_more ? r.next_cursor : null;
      pages++;
      if (cursor && pages >= 25) { truncated = true; break; }
    } while (cursor);
  } catch (e) {
    throw restaurantHint(e);
  }
  return { restaurants: out, truncated };
}
__name(restaurantList, "restaurantList");
async function restaurantUpdate(env, b) {
  restaurantDb(env);
  if (!isPageId(b.id)) throw fail("Need a restaurant id.", 400, true);
  const properties = restaurantProps(b.fields && typeof b.fields === "object" ? b.fields : {});
  if (!Object.keys(properties).length) throw fail("Nothing to change.", 400, true);
  try {
    return { restaurant: mapRestaurant(await notion(env, `pages/${b.id}`, "PATCH", { properties })) };
  } catch (e) {
    throw restaurantHint(e);
  }
}
__name(restaurantUpdate, "restaurantUpdate");
async function restaurantAdd(env, b) {
  const db = restaurantDb(env);
  const properties = restaurantProps(b, true);
  properties["Booking method"] = properties["Booking method"] || { select: { name: "Unknown" } };
  properties["Card needed"] = properties["Card needed"] || { select: { name: "Unknown" } };
  try {
    return { restaurant: mapRestaurant(await notion(env, "pages", "POST", { parent: { database_id: db }, properties })) };
  } catch (e) {
    throw restaurantHint(e);
  }
}
__name(restaurantAdd, "restaurantAdd");
async function restaurantArchive(env, b) {
  restaurantDb(env);
  if (!isPageId(b.id)) throw fail("Need a restaurant id.", 400, true);
  try {
    return { restaurant: mapRestaurant(await notion(env, `pages/${b.id}`, "PATCH", { archived: b.archived !== false })) };
  } catch (e) {
    throw restaurantHint(e);
  }
}
__name(restaurantArchive, "restaurantArchive");
var MAPS_URL = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|share\.google|(?:www\.)?google\.[a-z.]{2,6}\/(?:maps|search)|maps\.google\.[a-z.]{2,6})[^\s<>"]*/i;
var COSTA_BRAVA = /\b(begur|palafrugell|pals|calella|llafranc|tamariu|girona|torroella|regenc[oó]s|platja d['’]aro|sant feliu|sa tuna|aiguablava|peratallada|l['’]escala|roses|cadaqu[eé]s|figueres|la bisbal|lloret|tossa|blanes|l['’]estartit|costa brava)\b/i;
function guessCity(s) {
  if (/\bmadrid\b/i.test(s)) return "Madrid";
  if (/\b(wien|vienna|viena)\b/i.test(s)) return "Vienna";
  if (COSTA_BRAVA.test(s)) return "Costa Brava";
  return "";
}
__name(guessCity, "guessCity");
var plain = /* @__PURE__ */ __name((s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), "plain");
function placeFromMapsUrl(u) {
  try {
    let url = new URL(u);
    if (/consent\.google\./.test(url.hostname) && url.searchParams.get("continue")) url = new URL(url.searchParams.get("continue"));
    const m = url.pathname.match(/\/maps\/place\/([^/@]+)/);
    const raw2 = m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : url.searchParams.get("q") || url.searchParams.get("query") || "";
    const parts = raw2.split(",").map((x) => x.trim()).filter(Boolean);
    return { name: parts[0] || "", address: parts.slice(1).join(", ") };
  } catch {
    return { name: "", address: "" };
  }
}
__name(placeFromMapsUrl, "placeFromMapsUrl");
async function restaurantShare(env, b) {
  restaurantDb(env);
  const text = String(b.text || "").slice(0, 2e3), given = String(b.url || "").slice(0, 500);
  const link = (given.match(MAPS_URL) || text.match(MAPS_URL) || [""])[0];
  const rest = text.replace(MAPS_URL, " ");
  const site = (rest.match(/https?:\/\/[^\s<>"]+/i) || [given && !MAPS_URL.test(given) && isHttp(given) ? given : ""])[0].slice(0, 500);
  const lines = rest.replace(/https?:\/\/[^\s<>"]+/gi, " ").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  let name = lines[0] || "", address = lines.slice(1).join(", ");
  if (!name && site && !link) {
    try {
      const res = await fetch(site, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15" }, signal: AbortSignal.timeout(6e3) });
      const t = (await res.text()).match(/<title[^>]*>([^<]{2,200})<\/title>/i);
      if (t) name = decodeEntities(t[1]).split(/\s[|\u2013\u2014-]\s|\s\u00b7\s/)[0].replace(/^(restaurante?|bienvenid[oa]s? a)\s+/i, "").trim();
    } catch {
    }
  }
  if (link && (!name || !address)) {
    try {
      const res = await fetch(link, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", "Accept-Language": "en", Cookie: "CONSENT=YES+" }, signal: AbortSignal.timeout(6e3) });
      const p = placeFromMapsUrl(res.url || link);
      name = name || p.name;
      address = address || p.address;
      if (!name) {
        const t = (await res.text()).match(/<title>([^<]{2,150})<\/title>/i);
        if (t) name = t[1].replace(/\s*[-–·]\s*Google\s*Maps.*$/i, "").trim();
      }
    } catch {
    }
  }
  name = name.replace(/\s+/g, " ").slice(0, 120);
  if (!name) throw fail("Could not read a place name from what you shared. Add it in Mesa with the + button instead.", 400, true);
  const city = guessCity(`${address} ${name}`), resolved = { name, city, address };
  const same = (await restaurantList(env)).restaurants.find((r) => plain(r.name) === plain(name));
  if (same) return { restaurant: same, existing: true, resolved };
  const notes = [address, link].filter(Boolean).join("\n").slice(0, 1900);
  return { ...await restaurantAdd(env, { name, city, wishlist: "Want to try", why: "Shared from Google Maps", notes, ...site && isHttp(site) ? { website: site } : {} }), existing: false, resolved };
}
__name(restaurantShare, "restaurantShare");
function visitsDb(env) {
  if (!env.NOTION_VISITS_DB) throw fail("The visit log is not set up on the Worker yet (NOTION_VISITS_DB).", 409, true);
  return env.NOTION_VISITS_DB;
}
__name(visitsDb, "visitsDb");
function mapVisit(p) {
  const pr = p.properties || {}, text = /* @__PURE__ */ __name((a) => (a || []).map((t) => t.plain_text).join("").trim(), "text");
  return { id: p.id, restaurantId: pr.Restaurant?.relation?.[0]?.id || "", date: pr.Date?.date?.start || "", ate: text(pr["What we ate"]?.rich_text), rating: typeof pr.Rating?.number === "number" ? pr.Rating.number : null, notes: text(pr.Notes?.rich_text) };
}
__name(mapVisit, "mapVisit");
async function visitsFor(env, restaurantId) {
  const db = visitsDb(env), out = [];
  let cursor;
  do {
    const r = await notion(env, `databases/${db}/query`, "POST", { page_size: 100, ...restaurantId ? { filter: { property: "Restaurant", relation: { contains: restaurantId } } } : {}, ...cursor ? { start_cursor: cursor } : {} });
    out.push(...(r.results || []).map(mapVisit));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor && out.length < 2e3);
  return out;
}
__name(visitsFor, "visitsFor");
async function visitList(env) {
  return { visits: (await visitsFor(env)).sort((a, b) => b.date.localeCompare(a.date)) };
}
__name(visitList, "visitList");
async function syncRestaurantVisits(env, restaurantId) {
  const v = await visitsFor(env, restaurantId), last = v.map((x) => x.date).filter(Boolean).sort().at(-1) || null;
  const properties = { Visits: { number: v.length }, "Last visit": { date: last ? { start: last } : null } };
  if (v.length) properties.Wishlist = { select: null };
  return mapRestaurant(await notion(env, `pages/${restaurantId}`, "PATCH", { properties }));
}
__name(syncRestaurantVisits, "syncRestaurantVisits");
async function visitAdd(env, b) {
  const db = visitsDb(env), bad = /* @__PURE__ */ __name((m) => {
    throw fail(m, 400, true);
  }, "bad");
  if (!isPageId(b.restaurantId)) bad("Need a restaurant id.");
  if (!isDate(b.date)) bad("Pick the date of the visit.");
  const rating = b.rating === null || b.rating === void 0 || b.rating === "" ? null : Number(b.rating);
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 10)) bad("The score is a whole number from 1 to 10.");
  const properties = {
    Visit: { title: [{ text: { content: `${String(b.name || "Visit").slice(0, 100)} \xB7 ${b.date}` } }] },
    Restaurant: { relation: [{ id: b.restaurantId }] },
    Date: { date: { start: b.date } },
    "What we ate": rtext(b.ate),
    Rating: { number: rating },
    Notes: rtext(b.notes)
  };
  let page;
  try {
    page = await notion(env, "pages", "POST", { parent: { database_id: db }, properties });
  } catch (e) {
    throw restaurantHint(e);
  }
  return { visit: mapVisit(page), restaurant: await syncRestaurantVisits(env, b.restaurantId) };
}
__name(visitAdd, "visitAdd");
async function visitDelete(env, b) {
  visitsDb(env);
  if (!isPageId(b.id)) throw fail("Need a visit id.", 400, true);
  const rid = mapVisit(await notion(env, `pages/${b.id}`)).restaurantId;
  await notion(env, `pages/${b.id}`, "PATCH", { archived: true });
  return { restaurant: rid ? await syncRestaurantVisits(env, rid) : null };
}
__name(visitDelete, "visitDelete");
function bookreqDb(env) {
  if (!env.NOTION_BOOKREQ_DB) throw fail("Booking requests are not set up on the Worker yet (NOTION_BOOKREQ_DB).", 409, true);
  return env.NOTION_BOOKREQ_DB;
}
__name(bookreqDb, "bookreqDb");
function mapBookReq(p) {
  const pr = p.properties || {}, text = /* @__PURE__ */ __name((a) => (a || []).map((t) => t.plain_text).join("").trim(), "text");
  return { id: p.id, restaurantId: text(pr["Restaurant id"]?.rich_text), restaurant: text(pr.Restaurant?.rich_text), kind: pr.Kind?.select?.name || "", date: pr["Booking date"]?.date?.start || "", time: text(pr.Time?.rich_text), people: pr.People?.number ?? 0, status: pr.Status?.select?.name || "Pending", result: text(pr.Result?.rich_text), createdAt: p.created_time || "", handledAt: pr["Handled at"]?.date?.start || "" };
}
__name(mapBookReq, "mapBookReq");
async function bookreqAdd(env, b) {
  const db = bookreqDb(env), bad = /* @__PURE__ */ __name((m) => {
    throw fail(m, 400, true);
  }, "bad");
  if (!isPageId(b.restaurantId)) bad("Need a restaurant id.");
  if (!isDate(b.date)) bad("Pick a date.");
  if (b.date < (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) bad("That date has passed.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time || "")) bad("Pick a time.");
  const people = Number(b.people);
  if (!Number.isInteger(people) || people < 1 || people > 20) bad("People is a whole number from 1 to 20.");
  const g2 = b.guest || {}, gname = String(g2.name || "").trim(), gemail = String(g2.email || "").trim(), gphone = String(g2.phone || "").trim();
  if (!gname || gname.length > 80) bad("Add your name under Settings first.");
  if (!isEmail(gemail)) bad("Add your email under Settings first.");
  if (!isPhone(gphone)) bad("Add your phone number under Settings first.");
  const note = String(b.note || "").trim().slice(0, 200);
  let r;
  try {
    r = mapRestaurant(await notion(env, `pages/${b.restaurantId}`));
  } catch (e) {
    throw restaurantHint(e);
  }
  if (!r.autoBook) throw fail("Mesa has not confirmed that this place can be booked automatically.", 409, true);
  if (!isHttp(r.bookingLink)) throw fail("This place has no booking link saved.", 409, true);
  const kind = r.method === "TheFork" && b.kind !== "Check availability" ? "Book" : "Check availability";
  const open = await notion(env, `databases/${db}/query`, "POST", { page_size: 20, filter: { and: [{ property: "Restaurant id", rich_text: { equals: b.restaurantId } }, { or: [{ property: "Status", select: { equals: "Pending" } }, { property: "Status", select: { equals: "Working" } }] }] } });
  const same = (open.results || []).map(mapBookReq).find((x) => x.date === b.date && x.time === b.time && x.people === people && x.kind === kind && ["Pending", "Working"].includes(x.status));
  if (same) return { request: same, existing: true };
  const properties = {
    Request: { title: [{ text: { content: `${kind === "Book" ? "Book" : "Check"} ${r.name} \xB7 ${b.date} ${b.time} \xB7 ${people}`.slice(0, 150) } }] },
    Restaurant: rtext(r.name, 100),
    "Restaurant id": rtext(b.restaurantId, 60),
    "Booking link": { url: r.bookingLink },
    Kind: { select: { name: kind } },
    "Booking date": { date: { start: b.date } },
    Time: rtext(b.time, 5),
    People: { number: people },
    Status: { select: { name: "Pending" } },
    "Guest name": rtext(gname, 80),
    "Guest email": { email: gemail },
    "Guest phone": { phone_number: gphone },
    Note: rtext(note)
  };
  const page = await notion(env, "pages", "POST", { parent: { database_id: db }, properties });
  return { request: mapBookReq(page), existing: false };
}
__name(bookreqAdd, "bookreqAdd");
async function bookreqStatus(env, b) {
  bookreqDb(env);
  const ids = (Array.isArray(b.ids) ? b.ids : []).filter(isPageId).slice(0, 10), out = [];
  for (const id of ids) {
    try {
      out.push(mapBookReq(await notion(env, `pages/${id}`)));
    } catch {
    }
  }
  // A request the Mac marked Done becomes a direct delivery to Mesa; the phone picks it
  // up on its next pull instead of waiting for the confirmation email to parse.
  let storeError = "";
  for (const q of out) {
    if (q.status !== "Done" || q.kind !== "Book" || !q.date || !q.time || !q.restaurant) continue;
    try {
      const dr = await storeOp(env, "deliver", { key: `${slug(q.restaurant)}|${q.date}|${q.time}`, name: q.restaurant, date: q.date, time: q.time, party: q.people || 2, kind: "confirmed", status: "booked", source: "request", sourceRef: q.id, rid: q.restaurantId || undefined });
      if (dr && dr.ambiguous) { const hit = out.find((x) => x.id === q.id); if (hit) hit.deliveryIssue = "Could not file automatically: another booking exists for the same restaurant and time. Nothing was overwritten - ask Instinct to sort it out."; }
    } catch (e) { storeError = e.message; }
  }
  return { requests: out, storeError: storeError || void 0 };
}
__name(bookreqStatus, "bookreqStatus");
async function bookreqCancel(env, b) {
  bookreqDb(env);
  if (!isPageId(b.id)) throw fail("Need a request id.", 400, true);
  const cur = mapBookReq(await notion(env, `pages/${b.id}`));
  if (cur.status !== "Pending") return { request: cur, cancelled: false };
  return { request: mapBookReq(await notion(env, `pages/${b.id}`, "PATCH", { properties: { Status: { select: { name: "Cancelled" } } } })), cancelled: true };
}
__name(bookreqCancel, "bookreqCancel");
var MONTHS = { ene: 1, enero: 1, jan: 1, january: 1, gener: 1, feb: 2, febrero: 2, february: 2, febrer: 2, mar: 3, marzo: 3, march: 3, "mar\xE7": 3, marc: 3, abr: 4, abril: 4, apr: 4, april: 4, may: 5, mayo: 5, maig: 5, jun: 6, junio: 6, june: 6, juny: 6, jul: 7, julio: 7, july: 7, juliol: 7, ago: 8, agosto: 8, aug: 8, august: 8, agost: 8, sep: 9, sept: 9, septiembre: 9, september: 9, setembre: 9, oct: 10, octubre: 10, october: 10, nov: 11, noviembre: 11, november: 11, novembre: 11, dic: 12, diciembre: 12, dec: 12, december: 12, desembre: 12, januar: 1, "jän": 1, "jänner": 1, februar: 2, mrz: 3, "mär": 3, "märz": 3, marz: 3, mai: 5, juni: 6, juli: 7, okt: 10, oktober: 10, dez: 12, dezember: 12 };
var pad2 = /* @__PURE__ */ __name((n) => String(n).padStart(2, "0"), "pad2");
function ymdOk(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
__name(ymdOk, "ymdOk");
function parseBooking(text, subject, fromName, sentAt) {
  const sub = String(subject || ""), body = String(text || "").replace(/&nbsp;/gi, " ").replace(/\(?https?:\/\/[^\s)]+\)?/g, " ").replace(/\s+/g, " ");
  if (/experien|survey|encuesta|enquesta|thought about|valor|review|opinión|opinion|gracias por tu visita|thanks for your visit/i.test(sub)) return null;
  const kind = /cancel|stornier|absage/i.test(sub) ? "cancelled" : /modificad|modified|changed|modificat|geändert|geaendert|änderung|aenderung/i.test(sub) ? "modified" : /confirm|recordatorio|reminder|recordatori|reconfirm|booked|bestätig|bestaetig|erinnerung/i.test(sub) ? "confirmed" : null;
  if (!kind) return null;
  const sent = sentAt ? new Date(sentAt) : /* @__PURE__ */ new Date();
  const yearFor = /* @__PURE__ */ __name((mo, d) => {
    let y = sent.getUTCFullYear();
    if (Date.UTC(y, mo - 1, d) < sent.getTime() - 60 * 864e5) y++;
    return y;
  }, "yearFor");
  const cands = [];
  for (const m of body.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)) if (ymdOk(+m[3], +m[2], +m[1])) cands.push({ date: `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`, end: m.index + m[0].length });
  for (const m of body.matchAll(/(\d{1,2})(?:\s+de)?\s+([A-Za-zçÇäöüÄÖÜ]+)\.?(?:\s+de)?\s+(\d{4})/g)) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo && ymdOk(+m[3], mo, +m[1])) cands.push({ date: `${m[3]}-${pad2(mo)}-${pad2(m[1])}`, end: m.index + m[0].length });
  }
  for (const m of body.matchAll(/([A-Za-zäöüÄÖÜ]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?(?=\s+(?:at|@|a las)\b)/gi)) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (!mo) continue;
    const y = m[3] ? +m[3] : yearFor(mo, +m[2]);
    if (ymdOk(y, mo, +m[2])) cands.push({ date: `${y}-${pad2(mo)}-${pad2(m[2])}`, end: m.index + m[0].length });
  }
  for (const m of body.matchAll(/(?<![\d\/])(\d{1,2})\s+([A-Za-zçÇäöüÄÖÜ]{3,9})\.?(?!\s+(?:de\s+)?\d{4})(?![A-Za-zäöüÄÖÜ])/g)) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (!mo) continue;
    const y = yearFor(mo, +m[1]);
    if (ymdOk(y, mo, +m[1])) cands.push({ date: `${y}-${pad2(mo)}-${pad2(m[1])}`, end: m.index + m[0].length });
  }
  cands.sort((a, b) => a.end - b.end);
  let date = "", time = "";
  for (const c of cands) {
    const t = /^[^0-9]{0,14}([01]?\d|2[0-3])[:.h]([0-5]\d)(?:\s*([ap])\.?m\b|\s*h?\b)/i.exec(body.slice(c.end, c.end + 30));
    if (t) {
      let hh = +t[1];
      if (t[3]) {
        const pmFlag = t[3].toLowerCase() === "p";
        if (pmFlag && hh < 12) hh += 12;
        if (!pmFlag && hh === 12) hh = 0;
      }
      date = c.date;
      time = `${pad2(hh)}:${t[2]}`;
      break;
    }
  }
  if (!date) return null;
  const pm = /(?<![:\d])(\d{1,2})\s*(?:personas?|people|persons?|persones|personen|pax|comensales|guests?|gäste|gaeste|gente)\b/i.exec(body), party = pm ? +pm[1] : 0;
  let name = "";
  const sm = /\b(?:en|at|in|a)\s+(.+?)\s*$/i.exec(sub.replace(/\s*(?:on|del|from)\s+\w+\.?,?\s*\d.*$/i, ""));
  name = (fromName && !/thefork|covermanager|myrestoo/i.test(fromName) ? fromName : "") || (sm ? sm[1] : "");
  name = name.replace(/^restaurante?\s+/i, "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!name) return null;
  return { kind, name, date, time, party };
}
__name(parseBooking, "parseBooking");
function zonedToUtc(date, time, tz) {
  const [y, mo, d] = date.split("-").map(Number), [hh, mm] = time.split(":").map(Number), guess = Date.UTC(y, mo - 1, d, hh, mm);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  return new Date(guess - (Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - guess));
}
__name(zonedToUtc, "zonedToUtc");
var slug = /* @__PURE__ */ __name((s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), "slug");

// Some booking emails carry a stub text/plain part (sometimes only the subject) next to a rich
// text/html part. Try each representation until one parses instead of trusting the first non-empty one.
function bodyTexts(payload, snippet) {
  const found = { plain: "", html: "" };
  const walk = /* @__PURE__ */ __name((part) => {
    if (!part) return;
    if (!part.filename && part.body?.data) {
      const txt = b64url(part.body.data);
      if (part.mimeType === "text/plain" && !found.plain) found.plain = txt;
      else if (part.mimeType === "text/html" && !found.html) found.html = txt;
    }
    (part.parts || []).forEach(walk);
  }, "walk2");
  walk(payload);
  const out = [], seen = /* @__PURE__ */ new Set();
  const add = /* @__PURE__ */ __name((raw2, isHtml) => {
    const t = (isHtml ? cleanBody(htmlToText(String(raw2 || "").replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")), 4000).text : cleanBody(String(raw2 || ""), 4000).text) || "";
    if (t && !seen.has(t)) { seen.add(t); out.push(t); }
  }, "add");
  add(found.plain, false);
  if (found.html) add(found.html, true);
  add(decodeEntities(snippet || ""), false);
  return out;
}
__name(bodyTexts, "bodyTexts");

// Short cancellation/terms excerpt from the winning email text: fee-bearing sentences first,
// then other policy sentences, capped so it fits a phone-local booking note. No personal data added;
// this only reuses what the restaurant's own confirmation email already says.
const TERMS_NAMED = { nbsp: " ", euro: "\u20AC", aacute: "\u00E1", eacute: "\u00E9", iacute: "\u00ED", oacute: "\u00F3", uacute: "\u00FA", ntilde: "\u00F1", Aacute: "\u00C1", Eacute: "\u00C9", Iacute: "\u00CD", Oacute: "\u00D3", Uacute: "\u00DA", Ntilde: "\u00D1", auml: "\u00E4", ouml: "\u00F6", uuml: "\u00FC", Auml: "\u00C4", Ouml: "\u00D6", Uuml: "\u00DC", szlig: "\u00DF", iexcl: "\u00A1", iquest: "\u00BF" };
function bookingTerms(text) {
  const dec = decodeEntities(String(text || "").replace(/&([a-zA-Z]+);/g, (m, n) => TERMS_NAMED[n] !== void 0 ? TERMS_NAMED[n] : m));
  const paras = dec.split(/\n{2,}/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const sents = [];
  for (const p of paras) { const parts = p.match(/[^.!?]+[.!?]/g); if (parts) sents.push(...parts.map((s) => s.trim())); }
  const rx = /cancel|storno|anula|no[- ]?show|no asist|no acuda|cortes[ií]a|grace|cargad|cobr|charge|deposit|dep[oó]sito|comensal|por persona|per person|missing guest|freigehalten|weitergeben|zur Verfügung/i;
  const hits = sents.filter((s) => s.length > 25 && /^[A-ZÄÖÜÁÉÍÓÚÑ¡¿]/.test(s) && rx.test(s));
  const fee = hits.filter((s) => /\u20AC|\bEUR\b/i.test(s));
  const rest = hits.filter((s) => !fee.includes(s));
  const withNum = rest.filter((s) => /\d/.test(s));
  const other = rest.filter((s) => !/\d/.test(s));
  let out = [...fee, ...withNum, ...other].join(" ");
  if (out.length > 900) { const cut = out.slice(0, 900); const dot = cut.lastIndexOf(". "); out = (dot > 200 ? cut.slice(0, dot + 1) : cut).trim(); }
  return out;
}
__name(bookingTerms, "bookingTerms");
function firstParse(m) {
  for (const t of m.texts || []) { const p = parseBooking(t, m.subject, m.from.name, m.at); if (p) { const note = bookingTerms(t); if (note) p.note = note; return p; } }
  return null;
}
__name(firstParse, "firstParse");

var BOOKING_SENDERS = "noreply@covermanager.com OR noreply@myrestoo.net OR info@email.thefork.com OR noreply@thefork.com OR no-reply@thefork.com OR reservation@restaurant-information.com";
// ---- Mesa booking delivery (v39) ----
// Booking state lives in the MesaStore Durable Object: transactional, no TTL, no KV.
// The email scanner is calendar-ISOLATED: it makes no Google Calendar calls of any
// kind (no create, no delete, no lookup). Gmail messages are marked handled ONLY by
// /api/bookings/ack, after a device reports a durable save; unparseable mail is marked
// immediately (there is nothing to save). Undelivered or unacked records never expire;
// when the store is full, new deliveries are refused loudly (507 + status flag).
var SCAN_MARK = "v4"; // v4: ack-driven marking; re-examines everything v3 marked, recovering bookings older marks stranded
function mesaStore(env) {
  if (!env.MESA_STORE || typeof env.MESA_STORE.idFromName !== "function") throw fail("The booking delivery store is not bound on this Worker yet (MESA_STORE Durable Object binding). Deploy the repair update first; scanning stays off until then so nothing is marked lost.", 409, true);
  return env.MESA_STORE.get(env.MESA_STORE.idFromName("global"));
}
__name(mesaStore, "mesaStore");
async function storeOp(env, op, body) {
  const res = await mesaStore(env).fetch("https://mesa-store.internal/" + op, { method: "POST", body: JSON.stringify(body || {}) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(out.error || "The booking store returned an error.", res.status === 507 ? 507 : res.status === 404 ? 404 : 502, true);
  return out;
}
__name(storeOp, "storeOp");
const nameKey = /* @__PURE__ */ __name((s2) => String(s2 || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""), "nameKey");
// Grounded restaurant identity: match a parsed/delivered name against the user's real
// restaurant list (Notion). Exactly one normalized containment match wins; ambiguity
// or any failure resolves to no id (never a guess). Cached per scan run.
async function matchRid(env, name, cache) {
  const nk = nameKey(name);
  if (!nk || nk.length <= 3) return "";
  try { if (!cache.list) cache.list = (await restaurantList(env)).restaurants || []; } catch { cache.list = cache.list || []; }
  const hits = cache.list.filter((r) => { const m2 = nameKey(r && r.name); return m2 && (nk.includes(m2) || m2.includes(nk)); });
  return hits.length === 1 ? String(hits[0].id || "") : "";
}
__name(matchRid, "matchRid");
async function deliverParsed(env, m, p, recovery, ridCache) {
  const key = `${slug(p.name)}|${p.date}|${p.time}`;
  const body = { key, name: p.name, date: p.date, time: p.time, kind: p.kind, source: recovery ? "email-recovery" : "email", sourceMsgId: m.id };
  const rid = await matchRid(env, p.name, ridCache || {});
  if (rid) body.rid = rid;
  if (p.party) body.party = p.party; // a cancellation without a party count must not stomp the confirmed one
  if (p.kind === "cancelled") body.status = "cancelled";
  else body.terms = p.note || "";
  return storeOp(env, "deliver", body);
}
__name(deliverParsed, "deliverParsed");
async function bookingsDeliveriesFor(env, deviceId) {
  const out = await storeOp(env, "pending", { deviceId });
  return { deliveries: out.deliveries || [], storeFull: !!out.storeFull, storeFullAt: out.storeFullAt || null };
}
__name(bookingsDeliveriesFor, "bookingsDeliveriesFor");
async function bookingsRebuild(env, days2, deviceId) {
  const ridCache = {};
  const list = await ggmail(env, `users/me/messages?${new URLSearchParams({ q: `from:(${BOOKING_SENDERS}) newer_than:${days2}d`, maxResults: "100" })}`);
  const full = [];
  for (const m of list.messages || []) {
    const g2 = await ggmail(env, `users/me/messages/${encodeURIComponent(m.id)}?format=full`);
    const hdr = /* @__PURE__ */ __name((n) => (g2.payload?.headers || []).find((h) => h.name.toLowerCase() === n)?.value || "", "hdr");
    full.push({ id: m.id, at: Number(g2.internalDate) || 0, subject: decodeEntities(hdr("subject")), from: parseFrom(hdr("from")), texts: bodyTexts(g2.payload, g2.snippet) });
  }
  full.sort((x, y) => x.at - y.at);
  // Replays the window in date order through the delivery store. Upserts are idempotent
  // by booking key and carry no calendar side effects of any kind.
  let refused = false, ambiguous = 0;
  for (const m of full) {
    const p = firstParse(m);
    if (!p) continue;
    try { const r2 = await deliverParsed(env, m, p, true, ridCache); if (r2 && r2.ambiguous) ambiguous++; } catch (e) { if (e.status === 507) refused = true; else throw e; }
  }
  const { deliveries, storeFull, storeFullAt } = deviceId ? await bookingsDeliveriesFor(env, deviceId) : { deliveries: [], storeFull: false, storeFullAt: null };
  return { deliveries, scanned: full.length, rebuilt: true, ambiguous, storeFull: storeFull || refused, storeFullAt };
}
__name(bookingsRebuild, "bookingsRebuild");
async function bookingsScan(env, b) {
  const days2 = Math.max(1, Math.min(120, Math.floor(Number(b.days)) || 45));
  if (b.rescan) return bookingsRebuild(env, days2, String(b.deviceId || "").slice(0, 60));
  const deviceId = String(b.deviceId || "").slice(0, 60);
  const ridCache = {};
  const q = `from:(${BOOKING_SENDERS}) newer_than:${days2}d`;
  const list = await ggmail(env, `users/me/messages?${new URLSearchParams({ q, maxResults: "60" })}`);
  const ids = (list.messages || []).map((m) => m.id);
  const marks = ids.length ? await storeOp(env, "msgmarks", { ids }) : {};
  const fresh = (list.messages || []).filter((m) => { const mk = marks[m.id]; return mk !== SCAN_MARK && mk !== SCAN_MARK + "-null"; });
  const full = [];
  for (const f of fresh) {
    const m = await ggmail(env, `users/me/messages/${encodeURIComponent(f.id)}?format=full`);
    const hdr = /* @__PURE__ */ __name((n) => (m.payload?.headers || []).find((h) => h.name.toLowerCase() === n)?.value || "", "hdr");
    full.push({ id: f.id, at: Number(m.internalDate) || 0, subject: decodeEntities(hdr("subject")), from: parseFrom(hdr("from")), texts: bodyTexts(m.payload, m.snippet) });
  }
  full.sort((x, y) => x.at - y.at);
  let refused = false, ambiguous = 0;
  for (const m of full) {
    const p = firstParse(m);
    if (!p) { await storeOp(env, "markmsg", { id: m.id, mark: SCAN_MARK + "-null" }); continue; }
    try { const r2 = await deliverParsed(env, m, p, false, ridCache); if (r2 && r2.ambiguous) ambiguous++; } catch (e) { if (e.status === 507) refused = true; else throw e; }
  }
  const { deliveries, storeFull, storeFullAt } = deviceId ? await bookingsDeliveriesFor(env, deviceId) : { deliveries: [], storeFull: false, storeFullAt: null };
  return { deliveries, scanned: full.length, ambiguous, storeFull: storeFull || refused, storeFullAt };
}
__name(bookingsScan, "bookingsScan");
async function bookingsDeliver(env, b) {
  const name = String(b.name || "").trim().slice(0, 120);
  if (!name) throw fail("Need a restaurant name.", 400, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || "")) throw fail("Need the booking date.", 400, true);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time || "")) throw fail("Need the booking time.", 400, true);
  const party = Math.max(1, Math.min(20, Math.floor(Number(b.party)) || 2));
  const status2 = b.status === "went" ? "went" : "booked";
  const key = `${slug(name)}|${b.date}|${b.time}`;
  const out = await storeOp(env, "deliver", { key, name, date: b.date, time: b.time, party, terms: String(b.terms || "").slice(0, 900), status: status2, kind: "confirmed", source: String(b.source || "agent").slice(0, 30), rid: b.rid ? String(b.rid).slice(0, 60) : undefined, sourceRef: b.sourceRef ? String(b.sourceRef).slice(0, 60) : undefined });
  return { record: out.record, created: !!out.created, ambiguous: !!out.ambiguous };
}
__name(bookingsDeliver, "bookingsDeliver");
async function bookingsDeliveries(env, b) {
  const deviceId = String(b.deviceId || "").slice(0, 60);
  if (!deviceId) throw fail("Need a device id.", 400, true);
  return bookingsDeliveriesFor(env, deviceId);
}
__name(bookingsDeliveries, "bookingsDeliveries");
async function bookingsAck(env, b) {
  const deviceId = String(b.deviceId || "").slice(0, 60);
  if (!deviceId) throw fail("Need a device id.", 400, true);
  const keys = /* @__PURE__ */ __name((a) => (Array.isArray(a) ? a : []).map((k) => String(k || "").slice(0, 160)).filter(Boolean).slice(0, 100), "keys");
  return storeOp(env, "ack", { deviceId, accepted: keys(b.accepted), rejected: keys(b.rejected), mark: SCAN_MARK });
}
__name(bookingsAck, "bookingsAck");
async function bookingsRestore(env, b) {
  const key = String(b.key || "").slice(0, 160);
  if (!key) throw fail("Need the booking key to restore.", 400, true);
  return storeOp(env, "restore", { key });
}
__name(bookingsRestore, "bookingsRestore");
async function cmc(env, path) {
  if (!env.CMC_API_KEY) throw fail("CoinMarketCap is not set up on the Worker yet (CMC_API_KEY).", 409, true);
  const res = await fetch(`https://pro-api.coinmarketcap.com${path}`, { headers: { "X-CMC_PRO_API_KEY": env.CMC_API_KEY, Accept: "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status?.error_code) {
    const msg = String(body.status?.error_message || res.statusText);
    if (res.status === 401 || res.status === 403) throw fail("CoinMarketCap rejected the API key. Check CMC_API_KEY on the Worker.", 502, true);
    if (res.status === 429) throw fail("CoinMarketCap rate limit reached. Try again in a minute.", 502, true);
    throw fail(`CoinMarketCap ${res.status}: ${msg.slice(0, 160)}`, 502, true);
  }
  return body;
}
__name(cmc, "cmc");
var mapCoin = /* @__PURE__ */ __name((c) => ({ id: c.id, name: c.name, symbol: c.symbol, rank: c.rank ?? null, slug: c.slug, chain: c.platform?.name || "" }), "mapCoin");
async function cryptoSearch(env, b) {
  const symbols = [...new Set((Array.isArray(b.symbols) ? b.symbols : []).map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z0-9]{1,12}$/.test(x)))].slice(0, 30);
  if (!symbols.length) throw fail("Give at least one ticker.", 400, true);
  const body = await cmc(env, `/v1/cryptocurrency/map?${new URLSearchParams({ symbol: symbols.join(","), listing_status: "active", limit: "5000" })}`);
  const results = Object.fromEntries(symbols.map((x) => [x, []]));
  for (const c of body.data || []) if (results[c.symbol]) results[c.symbol].push(mapCoin(c));
  for (const k of Object.keys(results)) results[k] = results[k].sort((a, b2) => (a.rank ?? 1e9) - (b2.rank ?? 1e9)).slice(0, 6);
  return { results };
}
__name(cryptoSearch, "cryptoSearch");
async function cryptoQuotes(env, b) {
  const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((x, y) => x - y).slice(0, 100);
  if (!ids.length) return { at: Date.now(), quotes: {} };
  const key = `cmc:q:${ids.join(",")}`, cached = await env.TOKENS.get(key, "json");
  if (cached) return cached;
  const body = await cmc(env, `/v2/cryptocurrency/quotes/latest?${new URLSearchParams({ id: ids.join(","), convert: "USD", skip_invalid: "true" })}`);
  const quotes = {};
  for (const [id, v] of Object.entries(body.data || {})) {
    const c = Array.isArray(v) ? v[0] : v, q = c?.quote?.USD;
    if (c && q && q.price != null) quotes[id] = { symbol: c.symbol, name: c.name, price: q.price, change24h: q.percent_change_24h ?? null, updated: q.last_updated || null };
  }
  const out = { at: Date.now(), quotes };
  await env.TOKENS.put(key, JSON.stringify(out), { expirationTtl: 60 });
  return out;
}
__name(cryptoQuotes, "cryptoQuotes");
function offFood(p) {
  const n = p.nutriments || {}, num = /* @__PURE__ */ __name((v) => v === "" || v == null || isNaN(+v) ? null : +v, "num"), r1 = /* @__PURE__ */ __name((v) => v === null ? null : Math.round(v * 10) / 10, "r1");
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal === null) {
    const kj = num(n["energy_100g"]);
    if (kj !== null) kcal = kj / 4.184;
  }
  const name = String(p.product_name || "").trim();
  if (kcal === null || !name) return null;
  const brand = Array.isArray(p.brands) ? p.brands[0] : String(p.brands || "").split(",")[0].trim();
  return {
    code: String(p.code || ""),
    name,
    brand: brand || "",
    per100: { kcal: Math.round(kcal), p: r1(num(n.proteins_100g)), c: r1(num(n.carbohydrates_100g)), f: r1(num(n.fat_100g)) },
    servingG: num(p.serving_quantity)
  };
}
__name(offFood, "offFood");
async function foods(url) {
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2 || q.length > 80) throw fail("Type at least 2 letters to search.", 400);
  const params = new URLSearchParams({ q, page_size: "20", fields: "code,product_name,brands,nutriments,serving_quantity" });
  const res = await fetch(`https://search.openfoodfacts.org/search?${params}`, {
    headers: { "User-Agent": "CalorieTracker/1.0 (https://github.com/Caloriesin-n-out/Calorie-tracker)" }
  });
  if (!res.ok) throw fail(`Food search is not answering right now (${res.status}). Try again in a minute.`);
  const data = await res.json().catch(() => ({}));
  return { foods: (data.hits || []).map(offFood).filter(Boolean).slice(0, 12) };
}
__name(foods, "foods");
async function raw(env, url) {
  const type = url.searchParams.get("type"), from = url.searchParams.get("from"), to = url.searchParams.get("to");
  if (!/^[a-z-]+$/.test(type || "") || !from || !to) throw fail("Need type, from, to.", 400);
  const rollUps = ["steps", "total-calories", "active-energy-burned"];
  if (rollUps.includes(type)) {
    return g(env, `${type}/dataPoints:dailyRollUp`, { method: "POST", body: JSON.stringify({ range: { start: civil(from), end: civil(addDays(to, 1)) }, windowSizeDays: 1 }) });
  }
  const underscore = type.replace(/-/g, "_");
  const kind = { sleep: "interval", weight: "civil", "body-fat": "civil" }[type] || (type.startsWith("daily-") ? "date" : null);
  if (!kind) throw fail("Unsupported type for raw.", 400);
  const filter = kind === "civil" ? civilFilter(underscore, from, to) : kind === "date" ? dateFilter(underscore, from, to) : `sleep.interval.end_time >= "${from}T00:00:00Z" AND sleep.interval.end_time < "${addDays(to, 1)}T00:00:00Z"`;
  return g(env, `${type}/dataPoints?${new URLSearchParams({ filter, pageSize: "50" })}`);
}
__name(raw, "raw");
var MESA_STORE_CAP = 200;
const jsonResp = /* @__PURE__ */ __name((body, status2) => new Response(JSON.stringify(body), { status: status2, headers: { "Content-Type": "application/json" } }), "jsonResp");
// One transactional store ("global") for every booking Mesa knows about.
// Records carry per-device ack receipts and never expire. A record becomes removable
// only once every known device has acked its current version; user rejections are kept
// forever as durable tombstones so a removed booking is never resurrected.
class MesaStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
  async fetch(request) {
    try {
      const op = new URL(request.url).pathname.replace(/^\//, "");
      const b = await request.json().catch(() => ({}));
      if (op === "deliver") return await this.opDeliver(b);
      if (op === "pending") return await this.opPending(b);
      if (op === "ack") return await this.opAck(b);
      if (op === "restore") return await this.opRestore(b);
      if (op === "markmsg") return await this.opMarkMsg(b);
      if (op === "msgmarks") return await this.opMsgMarks(b);
      if (op === "status") return await this.opStatus();
      return jsonResp({ error: "Unknown store operation." }, 404);
    } catch (e) {
      return jsonResp({ error: String(e && e.message || e).slice(0, 300) }, 500);
    }
  }
  async opDeliver(b) {
    let key = String(b.key || "").slice(0, 160);
    if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time || "")) return jsonResp({ error: "Need key, date and time." }, 400);
    return await this.ctx.storage.transaction(async (txn) => {
      const idx = await txn.get("idx") || [];
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const inParty = b.party ? Math.max(1, Math.min(20, Math.floor(Number(b.party)))) : null;
      const nk = nameKey(b.name);
      const baseSlug = key.split("|")[0];
      // Identity candidates: every retained record for the same slot whose key or
      // normalized name matches - the exact-key record, suffixed branch records, and
      // cross-slug aliases of one booking (request flow 'Charrua' vs email parse
      // 'Charrua Madrid'). REJECTED records are candidates too: a cancellation keeps
      // absorbing later evidence under every alias instead of resurrecting as a fresh
      // booking. A known restaurant id contradiction excludes a candidate: same name,
      // different branch is a different booking.
      const cands = [];
      for (const k of idx) {
        const p3 = k.split("#")[0].split("|");
        if (p3[1] !== b.date || p3[2] !== b.time) continue;
        const other = await txn.get("rec:" + k);
        if (!other) continue;
        if (b.rid && other.rid && b.rid !== other.rid) continue;
        const keyBase = p3[0] === baseSlug;
        const on2 = nameKey(other.name);
        const nameMatch = nk.length > 3 && on2.length > 3 && (on2.includes(nk) || nk.includes(on2));
        if (keyBase || nameMatch) cands.push(other);
      }
      // Ambiguity is never resolved by guessing: when several records could be the
      // booking and no grounded identifier decides, nothing is stored. The email
      // stays unmarked (a later scan re-evaluates it); request deliveries re-arrive
      // on the next poll. No wrong record absorbs the evidence, nothing is lost.
      const ambiguous = () => jsonResp({ ambiguous: true, candidates: cands.map((r) => r.key), created: false }, 200);
      const modFlow = b.kind === "cancelled" || b.kind === "modified" || b.status === "cancelled";
      let rec = null, created = false, split = false;
      if (b.rid) {
        // A known restaurant id decides whenever it can.
        const ridHits = cands.filter((r) => r.rid === b.rid);
        if (ridHits.length > 1) return ambiguous();
        else if (ridHits.length === 1) rec = ridHits[0];
        else if (cands.some((r) => r.rid)) rec = null; // the candidates are other known branches: genuinely distinct
        else if (cands.length === 1) rec = cands[0]; // sole plausible record: adopt and attach the id
        else if (cands.length > 1) return ambiguous();
      } else if (b.sourceRef) {
        // The request flow carries the stable Notion request id: repeated Done-polls
        // of the SAME request always land on the same record, party corrections
        // included. A different request id never silently overwrites an existing
        // request's record.
        const refHits = cands.filter((r) => r.sourceRef === b.sourceRef);
        if (refHits.length > 1) return ambiguous();
        else if (refHits.length === 1) rec = refHits[0];
        else if (cands.length === 1 && !cands[0].sourceRef) rec = cands[0]; // candidate predates request ids: adopt and attach
        else if (cands.length === 1 && inParty && cands[0].party && cands[0].party !== inParty) rec = null; // a DIFFERENT request with a different party: genuinely distinct (two branch bookings)
        else if (cands.length === 1) rec = cands[0]; // different request id but nothing differs: the same dinner re-requested
        else if (cands.length > 1) return ambiguous();
      } else if (b.sourceMsgId) {
        // Email evidence: the same slot is the same booking when exactly one record
        // matches - reminders/re-sends vary in extracted terms, modifications change
        // party, and identity is never read from terms text. With several branch
        // records and no restaurant id the parser cannot know which branch the email
        // belongs to: store nothing rather than attach it to the wrong one.
        if (cands.length > 1) {
          const again = cands.filter((r) => (Array.isArray(r.sourceMsgIds) ? r.sourceMsgIds : []).includes(b.sourceMsgId));
          if (again.length === 1) rec = again[0];
          else if (modFlow) {
            const partyHits = inParty ? cands.filter((r) => r.party === inParty) : [];
            const exact = cands.find((r) => r.key === key);
            if (partyHits.length === 1) rec = partyHits[0];
            else if (exact) rec = exact; // cancellations/modifications target the base record
            else return ambiguous();
          } else return ambiguous();
        } else if (cands.length === 1) rec = cands[0];
      } else {
        // No identifiers at all (agent/request/manual deliveries without a request
        // id). A re-delivery from the SAME flow updates the same record - repeated
        // request polling and party corrections must not duplicate the booking.
        // Otherwise a different party size means a genuinely distinct booking (chain
        // branches, same-named venues) and gets its own suffixed record.
        // Cancellations/modifications never split: they target the matched record.
        if (cands.length === 1) {
          const c = cands[0];
          const sameFlow = b.source === "request" && c.source === "request"; // only the explicit polling flow is a stable re-delivery identity; the route default 'agent' is not
          if (modFlow || sameFlow || !inParty || !c.party || c.party === inParty) rec = c;
        } else if (cands.length > 1) {
          const partyHits = inParty ? cands.filter((r) => r.party === inParty) : [];
          if (modFlow) {
            const exact = cands.find((r) => r.key === key);
            if (exact) rec = exact;
            else if (partyHits.length === 1) rec = partyHits[0];
            else return ambiguous();
          } else if (partyHits.length === 1) rec = partyHits[0];
          else if (inParty && partyHits.length === 0) rec = null; // a further distinct booking
          else return ambiguous();
        }
      }
      if (rec) key = rec.key;
      if (!rec) {
        // New record: the natural key, or a suffixed branch key when the natural key
        // already belongs to a different booking.
        if (await txn.get("rec:" + key)) {
          const bk = key;
          for (let n = 2; ; n++) {
            const k2 = (bk + "#" + n).slice(0, 160);
            if (!(await txn.get("rec:" + k2))) { key = k2; split = true; break; }
          }
        }
        if (idx.length >= MESA_STORE_CAP) {
          await txn.put("meta:storeFullAt", now);
          return jsonResp({ error: "The booking store is full (200 records). Nothing was dropped silently; this delivery was refused.", refused: true }, 507);
        }
        idx.push(key);
        await txn.put("idx", idx);
        rec = { key, createdAt: now, acks: {}, status: "booked", terms: "", name: "", date: b.date, time: b.time };
        if (split) rec.split = true;
        created = true;
      }
      // Terminal outcomes are never downgraded by deliveries: a user-rejected booking
      // stays rejected - it still absorbs replayed details (reminders, re-sends, the
      // same confirmation under another alias) without ever reviving - and a recorded
      // visit ('went') stays 'went': a scanning confirmation email must never turn a
      // past visit back into an upcoming booking.
      // A rejected booking is NEVER revived by a delivery of any kind - not by an
      // email, not by the request flow, not by an agent delivery, however labeled:
      // any delivery can be retried, and no retry may undo a user's cancellation.
      // The sole way back is POST /api/bookings/restore, which names the record.
      if (rec.status !== "rejected" && rec.status !== "went") {
        if (b.kind === "cancelled" || b.status === "cancelled") rec.status = "cancelled";
        else if (b.status === "went" && created) rec.status = "went";
        // 'went' applies only at creation and only from an explicit agent delivery; a past date alone never sets it
        else rec.status = "booked";
      }
      if (b.kind === "modified") {
        const nameSlug = key.split("|")[0];
        for (const k of idx) {
          if (k === key || k.split("|")[0] !== nameSlug) continue;
          const other = await txn.get("rec:" + k);
          if (other && other.status === "booked") { other.status = "cancelled"; other.updatedAt = now; await txn.put("rec:" + k, other); }
        }
      }
      rec.name = String(b.name || rec.name).slice(0, 120);
      if (b.rid) rec.rid = String(b.rid).slice(0, 60); // known restaurant id: branch-distinct identity survives
      if (b.sourceRef) rec.sourceRef = String(b.sourceRef).slice(0, 60); // stable request id: repeated polls never duplicate
      if (b.party) rec.party = Math.max(1, Math.min(20, Math.floor(Number(b.party))));
      if (b.terms) rec.terms = String(b.terms).slice(0, 900);
      if (b.sourceMsgId) {
        rec.sourceMsgId = String(b.sourceMsgId).slice(0, 80);
        rec.sourceMsgIds = [...new Set([...(Array.isArray(rec.sourceMsgIds) ? rec.sourceMsgIds : []), rec.sourceMsgId])].slice(-10);
      }
      if (b.source) rec.source = String(b.source).slice(0, 30);
      rec.updatedAt = now;
      await txn.put("rec:" + key, rec);
      return jsonResp({ record: rec, created }, 200);
    });
  }

  async opPending(b) {
    const deviceId = String(b.deviceId || "").slice(0, 60);
    return await this.ctx.storage.transaction(async (txn) => {
      let idx = await txn.get("idx") || [];
      const devices = await txn.get("devices") || {};
      // Late-device recovery: a device on its FIRST pull receives every retained record
      // (including fully-acked ones), so a new or reset phone rebuilds from the store.
      // Beyond the 60-day post-ack window, recovery is the email rescan / a re-delivery.
      const isNewDevice = !!deviceId && !devices[deviceId];
      if (deviceId) { devices[deviceId] = (/* @__PURE__ */ new Date()).toISOString(); await txn.put("devices", devices); }
      const out = [], drop = [];
      for (const k of idx) {
        const rec = await txn.get("rec:" + k);
        if (!rec) { drop.push(k); continue; }
        const acks = rec.acks || {};
        // A rejection tombstone is offered exactly to devices that verifiably HAD the
        // booking (an ack receipt older than the rejection) and have not acked since:
        // they must learn the cancellation. Devices that never had it are not bothered;
        // a brand-new phone is not shown cancellations of bookings it never saw.
        // Tombstones themselves are never auto-removed.
        if (rec.status === "rejected") { const ra = rec.rejectedAt || rec.updatedAt; if (deviceId && deviceId !== rec.rejectedBy && acks[deviceId] && acks[deviceId] < ra) out.push(rec); continue; }
        // Offer BEFORE pruning: a device on its first pull receives every retained
        // record (full history for a new or reset phone), including ones pruned below.
        if (deviceId && (isNewDevice || !acks[deviceId] || acks[deviceId] < rec.updatedAt)) out.push(rec);
        // Prunable when quiet >60 days and every device THAT ACKED this record is
        // current. A device that never acked does not block pruning: an unacked record
        // quiet for 60+ days belongs to a dead or reset phone; a genuinely new phone
        // still receives the full retained history above, and the email rescan
        // (automatic once on an empty device, 120-day window) covers anything older.
        const quietDays = ((/* @__PURE__ */ new Date()) - (/* @__PURE__ */ new Date(rec.updatedAt || 0))) / 864e5;
        const ackedDevs = Object.keys(acks);
        if (quietDays > 60 && ackedDevs.length > 0 && ackedDevs.every((d) => acks[d] >= rec.updatedAt)) { drop.push(k); await txn.delete("rec:" + k); }
      }
      if (drop.length) { idx = idx.filter((k) => !drop.includes(k)); await txn.put("idx", idx); }
      return jsonResp({ deliveries: out, storeFull: idx.length >= MESA_STORE_CAP, storeFullAt: await txn.get("meta:storeFullAt") || null }, 200);
    });
  }
  async opAck(b) {
    const deviceId = String(b.deviceId || "").slice(0, 60);
    if (!deviceId) return jsonResp({ error: "Need a device id." }, 400);
    const accepted = Array.isArray(b.accepted) ? b.accepted : [], rejected = Array.isArray(b.rejected) ? b.rejected : [];
    return await this.ctx.storage.transaction(async (txn) => {
      const now = (/* @__PURE__ */ new Date()).toISOString(), marked = [];
      let idx = await txn.get("idx") || [];
      for (const key of [...accepted, ...rejected].slice(0, 100)) {
        let rec = await txn.get("rec:" + String(key).slice(0, 160));
        if (!rec && rejected.includes(key)) {
          // The record is gone (pruned after full acks) but the user's cancellation must
          // not vanish with it: recreate the durable tombstone so no later email replay
          // or rescan can resurrect a booking the user removed. Tombstones protect, so
          // this is allowed past the soft capacity flag (the alert still reports it).
          const parts = String(key).split("#")[0].split("|");
          rec = { key: String(key).slice(0, 160), createdAt: now, updatedAt: now, acks: { [deviceId]: now }, status: "rejected", rejectedAt: now, rejectedBy: deviceId, name: parts[0] || "", date: parts[1] || "", time: parts[2] || "", terms: "", source: "user-rejection" };
          idx.push(rec.key); await txn.put("idx", idx);
          await txn.put("rec:" + rec.key, rec);
          continue;
        }
        if (!rec) continue;
        rec.acks = rec.acks || {};
        if (accepted.includes(key) && rec.status === "rejected" && deviceId !== rec.rejectedBy && rec.rejectedAt) {
          // A stale accept for an already-rejected record: the device has NOT learned
          // the rejection - keep its receipt older than the tombstone so the tombstone
          // is still offered to it.
          rec.acks[deviceId] = new Date(Date.parse(rec.rejectedAt) - 1).toISOString();
        } else rec.acks[deviceId] = now;
        if (rejected.includes(key) && rec.status !== "rejected") {
          rec.status = "rejected"; rec.rejectedBy = deviceId; rec.updatedAt = now;
          // The tombstone must be strictly NEWER than every other device's ack receipt:
          // a same-millisecond ack is not "current" and must still learn the rejection.
          const otherAcks = Object.entries(rec.acks).filter(([d]) => d !== deviceId).map(([, t2]) => Date.parse(t2) || 0);
          rec.rejectedAt = new Date(Math.max(Date.now(), otherAcks.length ? Math.max(...otherAcks) + 1 : 0)).toISOString();
        }
        await txn.put("rec:" + rec.key, rec);
        // The source emails are handled only now: their content sits durably in this
        // record and the record stays available to every other device from here.
        for (const mid of [...new Set([...(Array.isArray(rec.sourceMsgIds) ? rec.sourceMsgIds : []), rec.sourceMsgId].filter(Boolean))]) {
          await txn.put("msg:" + mid, String(b.mark || "")); marked.push(mid);
        }
      }
      return jsonResp({ ok: true, marked }, 200);
    });
  }
  // Explicit, authorized recovery from a user rejection: names the intended record,
  // never creates anything, never touches a record that is not currently rejected.
  // The restored booking is re-offered to every device on its next pull.
  async opRestore(b) {
    const key = String(b.key || "").slice(0, 160);
    if (!key) return jsonResp({ error: "Need a booking key." }, 400);
    return await this.ctx.storage.transaction(async (txn) => {
      const rec = await txn.get("rec:" + key);
      if (!rec) return jsonResp({ error: "No such booking record; nothing was restored." }, 404);
      if (rec.status !== "rejected") return jsonResp({ record: rec, restored: false }, 200);
      rec.status = "booked";
      delete rec.rejectedAt;
      delete rec.rejectedBy;
      // Monotonic bump, strictly newer than every device receipt, so the restored
      // booking is re-offered even after a same-millisecond reject+restore.
      rec.updatedAt = new Date(Math.max(Date.now(), Date.parse(rec.updatedAt || 0) + 1 || 0, ...Object.values(rec.acks || {}).map((t) => Date.parse(t) + 1))).toISOString();
      await txn.put("rec:" + key, rec);
      return jsonResp({ record: rec, restored: true }, 200);
    });
  }
  async opMarkMsg(b) {
    const id = String(b.id || "").slice(0, 80);
    if (!id) return jsonResp({ error: "Need a message id." }, 400);
    await this.ctx.storage.put("msg:" + id, String(b.mark || ""));
    return jsonResp({ ok: true }, 200);
  }
  async opMsgMarks(b) {
    const ids = (Array.isArray(b.ids) ? b.ids : []).slice(0, 200), out = {};
    for (const id of ids) { const v = await this.ctx.storage.get("msg:" + String(id).slice(0, 80)); if (v) out[id] = v; }
    return jsonResp(out, 200);
  }
  async opStatus() {
    const idx = await this.ctx.storage.get("idx") || [];
    const devices = await this.ctx.storage.get("devices") || {};
    return jsonResp({ records: idx.length, cap: MESA_STORE_CAP, storeFull: idx.length >= MESA_STORE_CAP, storeFullAt: await this.ctx.storage.get("meta:storeFullAt") || null, devices: Object.keys(devices).length }, 200);
  }
}
__name(MesaStore, "MesaStore");

export {
  AUTO_YES,
  b64url,
  bodyOf,
  buildEvent,
  cardStatus,
  civilFilter,
  cleanBody,
  dateFilter,
  decodeEntities,
  worker_default as default,
  guessCity,
  htmlToText,
  mapBookReq,
  MesaStore,
  mapCoin,
  mapEvent,
  mapMail,
  mapPerson,
  mapRestaurant,
  mapTask,
  mapVisit,
  offFood,
  parseBooking,
  parseFrom,
  pickNumber,
  placeFromMapsUrl,
  restaurantProps,
  rollValue,
  sampleByDay,
  sleepByDay,
  zonedToUtc
};
//# sourceMappingURL=worker.js.map

// Gym scoped pairing v2. The two-minute link contains no durable app credential.
const gymPairOriginalFetch = worker_default.fetch;
const gymPairOrigin = 'https://gymmh.github.io';
async function gymPairSign(env, kind, payload) {
 const text=kind+'.'+btoa(JSON.stringify(payload)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.APP_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text)));
 return text+'.'+Array.from(sig,x=>x.toString(16).padStart(2,'0')).join('');
}
async function gymPairVerify(env,token,kind,maxLife) {
 if(typeof token!=='string'||token.length>1000)return null;
 const [prefix,body,sig,...extra]=token.split('.');
 if(prefix!==kind||!body||!/^[a-f0-9]{64}$/.test(sig||'')||extra.length)return null;
 try {
  const payload=JSON.parse(atob(body.replace(/-/g,'+').replace(/_/g,'/'))),now=Math.floor(Date.now()/1000);
  if(!Number.isInteger(payload.iat)||!Number.isInteger(payload.exp)||payload.iat>now+10||payload.exp<=now||payload.exp-payload.iat>maxLife||!/^[a-f0-9]{64}$/.test(payload.nonce||''))return null;
  const expected=await gymPairSign(env,kind,payload);
  return await keyOk(token,expected)?payload:null;
 }catch{return null}
}
worker_default.fetch=async function(request,env,ctx) {
 const path=new URL(request.url).pathname,origin=request.headers.get('Origin');
 if(request.method==='OPTIONS')return gymPairOriginalFetch.call(this,request,env,ctx);
 const scoped=(request.headers.get('X-App-Key')||'').startsWith('gym2.');
 if(!path.startsWith('/api/gym/')&&!scoped)return gymPairOriginalFetch.call(this,request,env,ctx);
 try {
  if(path==='/api/gym/pair'&&request.method==='POST') {
   if(origin!=='https://mydayappmh.github.io'||!await keyOk(request.headers.get('X-App-Key'),env.APP_KEY))throw fail('MyDay connection required.',401,true);
   const now=Math.floor(Date.now()/1000),nonce=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
   return json({pair:await gymPairSign(env,'pair2',{iat:now,exp:now+120,nonce}),expiresIn:120},200,request,env);
  }
  if(path==='/api/gym/redeem'&&request.method==='POST') {
   if(origin!==gymPairOrigin)throw fail('Open the Gym app to connect.',403,true);
   const body=await request.json(),p=await gymPairVerify(env,body.pair,'pair2',120);
   if(!p)throw fail('Connection link expired or invalid. Open Gym from connected MyDay again.',401,true);
   // Retries within two minutes return the same scoped credential, not new privileges.
   return json({key:await gymPairSign(env,'gym2',{iat:p.iat,exp:p.iat+31536000,nonce:p.nonce}),scope:'gym-completion',expiresAt:new Date((p.iat+31536000)*1000).toISOString()},200,request,env);
  }
  const permission=origin===gymPairOrigin&&await gymPairVerify(env,request.headers.get('X-App-Key'),'gym2',31536000);
  if(!permission)throw fail('Gym connection expired or missing. Open Gym from connected MyDay.',401,true);
  if(path==='/api/gym/status'&&request.method==='GET') {
   const result=await gcal(env,'users/me/calendarList?maxResults=1');
   if(!Array.isArray(result.items)||!result.items.length)throw fail('Google Calendar did not confirm access.',502,true);
   return json({connected:true,scope:'gym-completion',writeVerified:false},200,request,env);
  }
  if(path==='/api/calendar/complete'&&request.method==='POST') {
   const body=await request.json();if(body.source!=='gym')throw fail('Gym connections can only complete Gym workouts.',403,true);
   return json(await calendarComplete(env,body),200,request,env);
  }
  throw fail('This connection only permits Gym workout completion and connection checks.',403,true);
 }catch(e){return json({error:e.message},e.status||500,request,env)}
};

async function golfCalendarComplete(env, b) {
  if (b.source !== 'golf' || !/^[A-Za-z0-9_-]{3,120}$/.test(String(b.sourceId || ''))) throw fail('A stable Golf round ID is required.', 400, true);
  const f = Date.parse(b.start || ''), t = Date.parse(b.end || '');
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(b.start || '') || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(b.end || '') || !Number.isFinite(f) || !Number.isFinite(t) || t <= f || t - f > 24 * 3600e3 || t > Date.now() + 5 * 60e3) throw fail('Real round start and finish timestamps are required.', 400, true);
  const playedDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'});
  if(b.date!==playedDay.format(new Date(f))||b.date!==playedDay.format(new Date(t)))throw fail('Played date must match start and finish times.',400,true);
  const key = 'golf|' + b.sourceId;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const id = 'gf' + Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
  const path = 'calendars/primary/events/' + id;
  const mapGolf=ev=>({id:ev.id,start:ev.start?.dateTime,end:ev.end?.dateTime,link:ev.htmlLink||null,title:'Golf',canLink:!ev.attendees?.some(a=>!a.self)&&ev.organizer?.self!==false&&!ev.extendedProperties?.private?.sportsSource});
  const result = ev => {
    if (ev.status === 'cancelled') return { canceled: true, eventId: id };
    if (ev.extendedProperties?.private?.sportsSource !== key) throw fail('This calendar ID is already in use. No event was changed.', 409, true);
    if (Date.parse(ev.start?.dateTime) !== f || Date.parse(ev.end?.dateTime) !== t) return { event: mapGolf(ev), moved: true };
    return { event: mapGolf(ev) };
  };
  try { return result(await gcal(env, path)); } catch (e) { if (e.googleStatus !== 404) throw e; }
  const savedId = await env.TOKENS.get('sports-event:' + key);
  if (savedId) return result(await gcal(env, 'calendars/primary/events/' + encodeURIComponent(savedId)));
  // A previous manual link may not have the deterministic event ID. Find its exact source binding.
  const bound = await gcal(env, 'calendars/primary/events?' + new URLSearchParams({ privateExtendedProperty: 'sportsSource=' + key, maxResults: '3' }));
  if (bound.nextPageToken || (bound.items || []).length > 1) throw fail('More than one calendar entry has this round binding. Review required.', 409, true);
  if (bound.items?.length) { await env.TOKENS.put('sports-event:' + key, bound.items[0].id); return result(bound.items[0]); }
  const marker='';
  let candidates = [];
  if (marker) {
    const linked = await gcal(env, 'calendars/primary/events?' + new URLSearchParams({ q: marker, maxResults: '100' }));
    candidates = (linked.items || []).filter(ev => ev.status !== 'cancelled' && String(ev.description || '').includes(marker));
    if (linked.nextPageToken || candidates.length > 1) throw fail('This MyDay plan has more than one calendar entry. Review required.', 409, true);
  }
  if (!candidates.length) {
    const nearby = await gcal(env, 'calendars/primary/events?' + new URLSearchParams({ timeMin: new Date(f).toISOString(), timeMax: new Date(t).toISOString(), singleEvents: 'true', maxResults: '100' }));
    if (nearby.nextPageToken) throw fail('Could not check every overlapping calendar entry. Retry after reviewing Calendar.', 409, true);
    candidates = (nearby.items || []).filter(ev => ev.status !== 'cancelled' && /\b(golf|green fee)\b/i.test(ev.summary || '') && (ev.start?.date===b.date || (Date.parse(ev.start?.dateTime) < t && Date.parse(ev.end?.dateTime) > f)));
    if (b.linkEventId) {
      const chosen = candidates.find(ev => ev.id === b.linkEventId);
      if (!chosen) throw fail('That calendar entry no longer matches. Refresh before linking.', 409, true);
      candidates = [chosen];
    } else if (candidates.length && !b.allowSeparate) return { needsReview: true, candidates: candidates.map(ev => mapGolf(ev)).filter(Boolean) };
    else candidates = [];
  }
  if (candidates.length) {
    const ev = candidates[0], oldKey = ev.extendedProperties?.private?.sportsSource;
    if (ev.attendees?.some(a => !a.self) || ev.organizer?.self === false || (oldKey && oldKey !== key)) throw fail('This entry is invited or already linked to a different round. No change was made.', 409, true);
    const changed = await gcal(env, 'calendars/primary/events/' + encodeURIComponent(ev.id) + '?sendUpdates=none', { method: 'PATCH', headers: ev.etag ? { 'If-Match': ev.etag } : {}, body: JSON.stringify({ start: { dateTime: new Date(f).toISOString(), timeZone: 'Europe/Madrid' }, end: { dateTime: new Date(t).toISOString(), timeZone: 'Europe/Madrid' }, description: String(ev.description || '') + '\nCompleted round saved in GolfCaddie.\n[sports-source:' + key + ']', extendedProperties: { private: { ...(ev.extendedProperties?.private || {}), sportsSource: key } } }) });
    await env.TOKENS.put('sports-event:' + key, ev.id);
    return result(changed);
  }
  const title = 'Golf';
  const ev = { id, summary: title, start: { dateTime: new Date(f).toISOString(), timeZone: 'Europe/Madrid' }, end: { dateTime: new Date(t).toISOString(), timeZone: 'Europe/Madrid' }, description: 'Completed round saved in GolfCaddie.\n[sports-source:' + key + ']' + (marker ? '\n' + marker : ''), extendedProperties: { private: { sportsSource: key } } };
  try { return result(await gcal(env, 'calendars/primary/events?sendUpdates=none', { method: 'POST', body: JSON.stringify(ev) })); }
  catch (e) { if (e.googleStatus === 409) return result(await gcal(env, path)); throw e; }
}


const golfPairOriginalFetch=worker_default.fetch;
const golfPairOrigin='https://golfcaddie-ai.github.io';
worker_default.fetch=async function(request,env,ctx) {
 const path=new URL(request.url).pathname,origin=request.headers.get('Origin');
 if(request.method==='OPTIONS'&&path.startsWith('/api/golf/')&&[golfPairOrigin,'https://mydayappmh.github.io'].includes(origin))return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'X-App-Key, Content-Type','Vary':'Origin'}});
 if(request.method==='OPTIONS')return golfPairOriginalFetch.call(this,request,env,ctx);
 const scoped=(request.headers.get('X-App-Key')||'').startsWith('golf2.');
 if(!path.startsWith('/api/golf/')&&!scoped)return golfPairOriginalFetch.call(this,request,env,ctx);
 const reply=(body,status)=>{const r=json(body,status,request,env);if([golfPairOrigin,'https://mydayappmh.github.io'].includes(origin))r.headers.set('Access-Control-Allow-Origin',origin);return r};
 try {
  if(path==='/api/golf/pair'&&request.method==='POST') {
   if(origin!=='https://mydayappmh.github.io'||!await keyOk(request.headers.get('X-App-Key'),env.APP_KEY))throw fail('MyDay connection required.',401,true);
   const now=Math.floor(Date.now()/1000),nonce=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
   return reply({pair:await gymPairSign(env,'pairg2',{iat:now,exp:now+120,nonce}),expiresIn:120},200);
  }
  if(path==='/api/golf/redeem'&&request.method==='POST') {
   if(origin!==golfPairOrigin)throw fail('Open the Golf app to connect.',403,true);
   const body=await request.json(),p=await gymPairVerify(env,body.pair,'pairg2',120);
   if(!p)throw fail('Connection link expired or invalid. Open Golf from connected MyDay again.',401,true);
   // Retries within two minutes return the same scoped credential, not new privileges.
   return reply({key:await gymPairSign(env,'golf2',{iat:p.iat,exp:p.iat+31536000,nonce:p.nonce}),scope:'golf-completion',expiresAt:new Date((p.iat+31536000)*1000).toISOString()},200);
  }
  const permission=origin===golfPairOrigin&&await gymPairVerify(env,request.headers.get('X-App-Key'),'golf2',31536000);
  if(!permission)throw fail('Golf connection expired or missing. Open Golf from connected MyDay.',401,true);
  if(path==='/api/golf/status'&&request.method==='GET') {
   const result=await gcal(env,'users/me/calendarList?maxResults=1');
   if(!Array.isArray(result.items)||!result.items.length)throw fail('Google Calendar did not confirm access.',502,true);
   return reply({connected:true,scope:'golf-completion',writeVerified:false},200);
  }
  if(path==='/api/golf/complete'&&request.method==='POST') {
   const body=await request.json();if(body.source!=='golf')throw fail('Golf connections can only complete Golf rounds.',403,true);
   return reply(await golfCalendarComplete(env,body),200);
  }
  throw fail('This connection only permits Golf round completion and connection checks.',403,true);
 }catch(e){return reply({error:e.message},e.status||500)}
};
/* ---------------- Shared Google Tasks and read-only calendar ---------------- */
// Additive shared-account connector. No credential values belong in this source.
const SHARED_EMAIL = 'anaymatti@gmail.com';
const SHARED_SERVICE = 'shared-tasks';
const SHARED_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/tasks', 'https://www.googleapis.com/auth/calendar.readonly'];
const SHARED_CONFIG = 'sharedTasks:config';
const SHARED_IDENTITY = 'sharedTasks:identity';
function authService(value) {
  if (value === null || value === undefined || value === '' || value === 'health') return 'health';
  if (value === 'calendar' || value === SHARED_SERVICE) return value;
  throw fail('Unknown connection service.', 400, true);
}
async function verifySharedGrant(env, tok) {
  const granted = new Set(String(tok.scope || '').split(/\s+/));
  for (const s of SHARED_SCOPES.filter(s => s.startsWith('https://'))) {
    if (!granted.has(s)) throw fail('Shared Tasks and calendar permissions were not both approved. Existing connections were kept.', 403, true);
  }
  const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const who = await r.json().catch(() => ({}));
  if (!r.ok || who.email_verified !== true || String(who.email || '').toLowerCase() !== SHARED_EMAIL || !who.sub) {
    throw fail('Choose the shared anaymatti@gmail.com account. No existing connection was replaced.', 403, true);
  }
  const old = await env.TOKENS.get(SHARED_IDENTITY, 'json');
  if (old?.sub && old.sub !== who.sub) throw fail('Shared account identity changed. Existing connections were kept.', 403, true);
  return { sub: who.sub, email: SHARED_EMAIL };
}
async function sharedConfig(env) { return (await env.TOKENS.get(SHARED_CONFIG, 'json')) || null; }
async function sharedStatus(env) {
  const identity = await env.TOKENS.get(SHARED_IDENTITY, 'json');
  const config = await sharedConfig(env);
  return { connected: !!(await env.TOKENS.get('refreshToken:shared-tasks')), account: identity?.email || null, list: config ? { id: config.listId, title: config.listTitle } : null };
}
async function sharedGoogle(env, service, path, init = {}) {
  const token = await accessToken(env, SHARED_SERVICE);
  const origin = service === 'tasks' ? 'https://tasks.googleapis.com/tasks/v1/' : 'https://www.googleapis.com/calendar/v3/';
  const r = await fetch(origin + path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) await env.TOKENS.delete('accessToken:shared-tasks');
    const raw = String(data.error?.message || '');
    if (r.status === 403 && /not been used|disabled|accessNotConfigured/i.test(raw)) throw fail(`The Google ${service === 'tasks' ? 'Tasks' : 'Calendar'} API needs enabling in the app's Google Cloud project.`, 403, true);
    if (r.status === 401) throw fail('Shared Google access needs reconnecting. Personal connections were kept.', 401, true);
    if (r.status === 403) throw fail('Shared Google permission was refused. Check the connection and selected list.', 403, true);
    if (r.status === 404) throw fail('The shared list or task no longer exists, or access was removed. Refresh the shared list.', 404, true);
    if (r.status === 412) throw fail('This task changed on another device. Refresh before changing it again.', 409, true);
    throw fail(`Shared Google request failed (${r.status}). Try refreshing.`, 502, true);
  }
  return data;
}
async function sharedPages(env, service, path, params = {}) {
  const out = []; let pageToken = null; const seen = new Set();
  do {
    const q = new URLSearchParams({ ...params, ...(pageToken ? { pageToken } : {}) });
    const page = await sharedGoogle(env, service, `${path}?${q}`);
    out.push(...(page.items || []));
    pageToken = page.nextPageToken || null;
    if (pageToken && (seen.has(pageToken) || seen.size >= 1000)) throw fail('The shared list could not be loaded completely. Try refreshing.', 502, true);
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  return out;
}
async function sharedLists(env) {
  const items = await sharedPages(env, 'tasks', 'users/@me/lists', { maxResults: '100' });
  return { account: SHARED_EMAIL, lists: items.map(x => ({ id: x.id, title: x.title || '(untitled list)' })) };
}
async function sharedSelect(env, body) {
  const listId = String(body.listId || '');
  if (!listId || listId.length > 1000) throw fail('Choose an existing shared task list.', 400, true);
  const available = await sharedLists(env);
  const selected = available.lists.find(x => x.id === listId);
  if (!selected) throw fail('That list is not available in the shared account.', 403, true);
  const identity = await env.TOKENS.get(SHARED_IDENTITY, 'json');
  if (!identity?.sub || identity.email !== SHARED_EMAIL) throw fail('Reconnect the shared account first.', 409, true);
  const config = { listId: selected.id, listTitle: selected.title, accountSub: identity.sub };
  await env.TOKENS.put(SHARED_CONFIG, JSON.stringify(config));
  return { account: SHARED_EMAIL, list: selected };
}
async function requireSharedList(env) {
  const identity = await env.TOKENS.get(SHARED_IDENTITY, 'json');
  const config = await sharedConfig(env);
  if (!config || !identity?.sub || config.accountSub !== identity.sub) throw fail('Choose your shared Google task list in Settings first.', 409, true);
  return config;
}
function sharedCivilDay(value) {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}
function validSharedDay(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
}
function mapGoogleTask(task, listId) {
  const completed = task.status === 'completed';
  // Google Tasks API due is a civil date, never a scheduled time.
  const done = completed && task.completed ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(task.completed)) : null;
  return { id: `gtask:${encodeURIComponent(listId)}:${encodeURIComponent(task.id)}`, upstreamId: task.id, listId, source: 'shared-google', title: task.title || '(untitled)', status: completed ? 'Done' : 'Not started', due: sharedCivilDay(task.due), done, completedAt: task.completed || null, types: [], tags: [], waiting: false, next: '', notes: task.notes || '', url: task.webViewLink || null, people: [], crm: false, parent: task.parent || null, position: task.position || '', etag: task.etag || null, updated: task.updated || null };
}
async function sharedTasks(env, url) {
  const date = url.searchParams.get('date');
  if (!validSharedDay(date)) throw fail('Bad date.', 400, true);
  const config = await requireSharedList(env);
  const items = await sharedPages(env, 'tasks', `lists/${encodeURIComponent(config.listId)}/tasks`, { maxResults: '100', showCompleted: 'true', showHidden: 'true', showDeleted: 'true' });
  const rows = items.filter(x => !x.deleted).map(x => mapGoogleTask(x, config.listId));
  return { account: SHARED_EMAIL, list: { id: config.listId, title: config.listTitle }, open: rows.filter(x => x.status !== 'Done'), doneOn: rows.filter(x => x.status === 'Done' && x.done === date), at: Date.now() };
}
async function sharedAction(env, action, body) {
  const config = await requireSharedList(env);
  const base = `lists/${encodeURIComponent(config.listId)}/tasks`;
  if (action === 'add') {
    const title = String(body.title || '').trim();
    if (!title || title.length > 200) throw fail('Give the task a title (up to 200 characters).', 400, true);
    if (body.due && !validSharedDay(body.due)) throw fail('Bad due date.', 400, true);
    // No CRM/mail notes or person/type metadata are copied into the shared account.
    const created = await sharedGoogle(env, 'tasks', base, { method: 'POST', body: JSON.stringify({ title, ...(body.due ? { due: `${body.due}T00:00:00.000Z` } : {}) }) });
    return { task: mapGoogleTask(created, config.listId) };
  }
  if (!['done', 'reopen'].includes(action)) throw fail('Not found.', 404, true);
  const taskId = String(body.upstreamId || '');
  if (!taskId || taskId.length > 1000 || body.listId !== config.listId) throw fail('Refresh the selected shared task list first.', 400, true);
  if (!body.etag || typeof body.etag !== 'string' || /[\r\n]/.test(body.etag)) throw fail('Refresh this task before changing it.', 409, true);
  const path = `${base}/${encodeURIComponent(taskId)}`;
  const current = await sharedGoogle(env, 'tasks', path);
  if (current.deleted || current.etag !== body.etag) throw fail('This task changed on another device. Refresh before changing it again.', 409, true);
  const patch = action === 'done' ? { status: 'completed' } : { status: 'needsAction', completed: null };
  const updated = await sharedGoogle(env, 'tasks', path, { method: 'PATCH', headers: { 'If-Match': current.etag }, body: JSON.stringify(patch) });
  return { task: mapGoogleTask(updated, config.listId) };
}
async function sharedCalendar(env, url) {
  const from = Date.parse(url.searchParams.get('from') || ''), to = Date.parse(url.searchParams.get('to') || '');
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 8 * 86400e3) throw fail('Bad time range.', 400, true);
  const cal = await sharedGoogle(env, 'calendar', 'calendars/primary');
  const id = cal.id;
  if (!id) throw fail('The shared calendar could not be identified.', 502, true);
  const name = cal.summary || SHARED_EMAIL;
  const items = await sharedPages(env, 'calendar', `calendars/${encodeURIComponent(id)}/events`, { timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
  const events = items.map(e => { const x = mapEvent(e, name); return x ? { ...x, calendarId: id, source: 'shared-google', readOnly: true } : null; }).filter(e => e && e.start);
  return { events, errors: [], calendars: [name], calendarList: [{ id, summary: name, primary: true, accessRole: 'reader', source: 'shared-google', readOnly: true }], at: Date.now() };
}
