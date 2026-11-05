// Run with: npm test (from the worker folder). Google, Gmail and Notion are simulated; nothing leaves the machine.
import worker, { htmlToText, buildEvent, parseFrom, decodeEntities, cleanBody, bodyOf, b64url, mapRestaurant, restaurantProps, guessCity, placeFromMapsUrl, mapVisit } from '../worker.js';
import assert from 'node:assert/strict';

const store = new Map([['refreshToken', 'HEALTH_RT'], ['refreshToken:calendar', 'CAL_RT']]);
const TOKENS = { get: async (k, type) => { const v = store.get(k) ?? null; return type === 'json' && v ? JSON.parse(v) : v; }, put: async (k, v) => { store.set(k, v); }, delete: async k => { store.delete(k); } };
const env = { TOKENS, ALLOWED_ORIGIN: 'https://me.github.io', APP_KEY: 'sekret', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'cs',
  NOTION_TOKEN: 'ntn_x', NOTION_TASKS_DB: '2e2e528f-adf8-8195-bced-f39c537ae294', NOTION_PEOPLE_DB: '1af97b4b-1373-4867-b105-b6afc71ff37f', NOTION_MEETINGS_DB: '6311b063-37a4-468b-b661-111f32c063b2', NOTION_VISITS_DB: '54f5007a-41c1-463d-9fe3-1f4939d31fa6', NOTION_RESTAURANTS_DB: 'f5ce7d95-2e83-46f0-a0f4-3e7e441f632f', CMC_API_KEY: 'cmc_key' };
let calls = [], calMode = 'ok', notionMode = 'ok', tokenCalls = [], cmcMode = 'ok', cmcCalls = 0;
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const PID = '2e2e528f-adf8-8195-bced-f39c537ae294';
function page(id, name, status, due, done = null, extra = {}) {
  return { id, url: 'https://notion.so/' + id, properties: { Name: { title: [{ plain_text: name }] }, Status: { status: { name: status } }, 'Due Date': { date: due ? { start: due } : null }, 'Completion Date': { date: done ? { start: done } : null },
    Type: { multi_select: [{ name: 'Personal' }] }, Tags: { multi_select: [] }, 'Waiting on': { checkbox: false }, 'Next Step': { rich_text: [] }, ...extra } };
}
const person = (id, name, email) => ({ id, url: 'https://notion.so/' + id, properties: { Name: { title: [{ plain_text: name }] }, Email: { email }, Role: { rich_text: [{ plain_text: 'CFO' }] }, Company: { relation: [{ id: 'co1' }] }, Tier: { select: { name: 'A - Key' } },
  'History summary': { rich_text: [{ plain_text: 'Wants a pilot.' }] }, 'Last Contacted': { formula: { type: 'date', date: { start: '2026-10-01' } } }, 'Follow-up Status': { formula: { type: 'string', string: 'Overdue' } }, 'Latest Interaction': { rollup: { type: 'date', date: null } } } });
const RID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const restaurant = (id, name, over = {}) => ({ id, url: 'https://notion.so/' + id, properties: { Name: { title: [{ plain_text: name }] }, City: { select: { name: 'Costa Brava' } }, Area: { rich_text: [{ plain_text: 'Llafranc' }] },
  Cuisine: { select: { name: 'Japanese' } }, Meal: { multi_select: [{ name: 'Lunch' }] }, Tags: { multi_select: [{ name: 'Sea view' }] }, Price: { select: null }, Favourite: { checkbox: true }, 'Booking method': { select: { name: 'CoverManager' } },
  'Booking link': { url: 'https://book.example/far' }, 'Platform id': { rich_text: [] }, Website: { url: null }, Phone: { phone_number: '+34 972 000 000' }, WhatsApp: { phone_number: null },
  'Card needed': { select: { name: 'Unknown' } }, 'Deposit / policy': { rich_text: [] }, Notes: { rich_text: [] }, 'Last visit': { date: null }, Visits: { number: null }, ...over }, created_time: '2026-11-02T10:00:00.000Z' });
const msg = (id, thread, from, subject, labels, ms) => ({ id, threadId: thread, labelIds: labels, snippet: 'Hi &#39;there&#39; &amp; co', internalDate: String(ms), payload: { headers: [{ name: 'From', value: from }, { name: 'To', value: 'me@x.com' }, { name: 'Subject', value: subject }] } });

const visitPage = (id, d, r) => ({ id, properties: { Visit: { title: [{ plain_text: 'Far Nomo' }] }, Restaurant: { relation: [{ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }] }, Date: { date: { start: d } }, 'What we ate': { rich_text: [{ plain_text: 'Gyoza' }] }, Rating: { number: r }, Notes: { rich_text: [] } } });
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push({ url, init });
  if (url.includes('/databases/54f5007a-41c1-463d-9fe3-1f4939d31fa6/query')) return J({ results: [visitPage('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '2026-05-01', 8), visitPage('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '2026-11-02', 9)], has_more: false });
  if (url.endsWith('/v1/pages') && init.method === 'POST' && JSON.parse(init.body).parent.database_id === '54f5007a-41c1-463d-9fe3-1f4939d31fa6') return J({ id: 'v3', properties: JSON.parse(init.body).properties });
  if (url.endsWith('/pages/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1')) return J(visitPage('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '2026-05-01', 8));
  if (url.includes('maps.app.goo.gl')) { const r = new Response('<title>x</title>'); Object.defineProperty(r, 'url', { value: 'https://www.google.com/maps/place/Casa+Juli%C3%A1n+de+Tolosa,+C.+de+la+Cava+Baja,+18,+28005+Madrid/@40.41,-3.71,17z/data=!4m6' }); return r; }
  const dec = decodeURIComponent(url.replace(/\+/g, ' ')), body = init.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : null;
  if (url.includes('oauth2.googleapis.com/token')) { tokenCalls.push(String(init.body)); return J({ access_token: 'AT', expires_in: 3599 }); }
  // Google Health
  if (url.includes('health.googleapis.com')) {
    if (url.includes('steps/dataPoints:dailyRollUp')) return J({ rollupDataPoints: [{ civilStartTime: { date: { year: 2026, month: 10, day: 30 } }, steps: { countSum: '9001' } }] });
    if (url.includes('/weight/dataPoints')) { assert.match(dec, /weight\.sample_time\.civil_time >= "2026-10-29" AND weight\.sample_time\.civil_time < "2026-10-31"/); return J({ dataPoints: [] }); }
    return J({ dataPoints: [], rollupDataPoints: [] });
  }
  // Calendar
  if (url.includes('/calendarList')) {
    if (calMode === 'noscope') return J({ error: { code: 403, message: 'Request had insufficient authentication scopes.', errors: [{ reason: 'insufficientPermissions' }] } }, 403);
    return J({ items: [{ id: 'me@x.com', summary: 'Me', primary: true, selected: true }, { id: 'team@group', summary: 'Team', summaryOverride: 'Work team', selected: true }, { id: 'off@group', summary: 'Hidden', selected: false }] });
  }
  if (url.includes('/calendars/me%40x.com/events') && init.method === 'POST') {
    assert.match(url, /conferenceDataVersion=1/);
    return J({ id: 'newev', iCalUID: 'nu', summary: body.summary, start: body.start, end: body.end, htmlLink: 'https://cal/x', attendees: body.attendees, conferenceData: body.conferenceData && { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/new' }] } });
  }
  if (url.includes('/calendars/primary/events') && init.method === 'POST') {
    return J({ id: 'newev', iCalUID: 'nu', summary: body.summary, start: body.start, end: body.end, htmlLink: 'https://cal/x', attendees: body.attendees });
  }
  if (url.includes('/calendars/me%40x.com/events')) return J({ items: [
    { id: 'e2', iCalUID: 'u2', summary: 'Standup', start: { dateTime: '2026-11-01T09:30:00+01:00' }, end: { dateTime: '2026-11-01T09:45:00+01:00' }, hangoutLink: 'https://meet.google.com/abc',
      attendees: [{ displayName: 'Me', email: 'me@x.com', self: true, responseStatus: 'accepted' }, { email: 'a@y.com', responseStatus: 'tentative' }, { email: 'room@r', resource: true }], organizer: { email: 'boss@y.com' }, description: 'Agenda:<br><a href="https://docs.example/x">Doc</a> &amp; more' },
    { id: 'e3', iCalUID: 'u3', summary: 'Declined', start: { dateTime: '2026-11-01T11:00:00+01:00' }, end: { dateTime: '2026-11-01T12:00:00+01:00' }, attendees: [{ email: 'me@x.com', self: true, responseStatus: 'declined' }] },
    { id: 'e1', iCalUID: 'u1', summary: 'Birthday', start: { date: '2026-11-01' }, end: { date: '2026-11-02' } }] });
  if (url.includes('/calendars/team%40group/events')) return J({ items: [{ id: 'e2b', iCalUID: 'u2', summary: 'Standup', start: { dateTime: '2026-11-01T09:30:00+01:00' }, end: { dateTime: '2026-11-01T09:45:00+01:00' } }, { id: 'e6', iCalUID: 'u6', summary: 'Lunch', start: { dateTime: '2026-11-01T13:00:00+01:00' }, end: { dateTime: '2026-11-01T14:00:00+01:00' }, transparency: 'transparent' }] });
  // Gmail
  if (url.startsWith('https://gmail.googleapis.com')) {
    if (calMode === 'nogmail') return J({ error: { code: 403, message: 'Request had insufficient authentication scopes.' } }, 403);
    if (dec.includes('format=full')) {
      const e = x => Buffer.from(x, 'utf8').toString('base64url');
      if (url.includes('/messages/abc123def456')) return J({ id: 'abc123def456', snippet: 'snip', payload: { mimeType: 'multipart/mixed', parts: [
        { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/plain', body: { data: e('Hi Matthias,\n\nCan we move kickoff to the 16th? Caf\u00e9 at 9?\n\nThanks,\nDana\n\nOn Mon, 2 Nov 2026 at 09:00, Matthias <me@x.com> wrote:\n> earlier text\n> more') } }, { mimeType: 'text/html', body: { data: e('<p>html version</p>') } }] },
        { mimeType: 'application/pdf', filename: 'terms.pdf', body: { size: 2048 } }] } });
      if (url.includes('/messages/f00dfeed0001')) return J({ id: 'f00dfeed0001', snippet: '', payload: { mimeType: 'text/html', body: { data: e('<html><head><style>p{color:red}</style></head><body><p>Hello <b>there</b></p><div>Second line &amp; more</div></body></html>') } } });
      if (url.includes('/messages/f00dfeed0002')) return J({ id: 'f00dfeed0002', snippet: 'Only a snippet', payload: { mimeType: 'multipart/mixed', parts: [] } });
      if (url.includes('/messages/f00dfeed0003')) return J({ id: 'f00dfeed0003', payload: { mimeType: 'text/plain', body: { data: e('word '.repeat(600)) } } });
    }
    if (url.includes('/profile')) return J({ emailAddress: 'me@x.com' });
    if (url.includes('/labels/INBOX')) return J({ threadsUnread: 7, messagesUnread: 9 });
    if (url.includes('/messages?')) {
      if (dec.includes('labelIds=INBOX')) {
        assert.match(dec, /labelIds=UNREAD/);
        for (const c of ['social', 'promotions', 'updates', 'forums']) assert.ok(dec.includes(`-category:${c}`), `inbox query leaves out ${c}`);
        return J({ messages: [{ id: 'm1' }, { id: 'm2' }] });
      }
      assert.match(dec, /q=\(from:a@y\.com OR to:a@y\.com\)/); return J({ messages: [{ id: 't1' }, { id: 't2' }, { id: 't3' }] });
    }
    if (url.includes('/messages/m1')) return J(msg('m1', 'th1', '"Dana Fox" <Dana@Acme.example>', 'Re: pilot terms &amp; dates', ['INBOX', 'UNREAD', 'STARRED'], Date.UTC(2026, 10, 2, 8, 0)));
    if (url.includes('/messages/m2')) return J(msg('m2', 'th2', 'news@shop.example', 'Sale', ['INBOX', 'UNREAD'], Date.UTC(2026, 10, 2, 7, 0)));
    if (url.includes('/messages/t1')) return J(msg('t1', 'thA', 'a@y.com', 'Pilot', ['INBOX'], Date.UTC(2026, 9, 30)));
    if (url.includes('/messages/t2')) return J(msg('t2', 'thA', 'ME@x.com', 'Re: Pilot', ['SENT'], Date.UTC(2026, 9, 29)));
    if (url.includes('/messages/t3')) return J(msg('t3', 'thB', 'a@y.com', 'Lunch?', ['INBOX'], Date.UTC(2026, 9, 20)));
  }
  // CoinMarketCap
  if (url.startsWith('https://pro-api.coinmarketcap.com')) {
    assert.equal(init.headers['X-CMC_PRO_API_KEY'], 'cmc_key');
    if (cmcMode === 'badkey') return J({ status: { error_code: 1002, error_message: 'API key invalid' } }, 401);
    if (cmcMode === 'limit') return J({ status: { error_code: 1008, error_message: 'rate limit' } }, 429);
    if (url.includes('/v1/cryptocurrency/map')) return J({ status: { error_code: 0 }, data: [
      { id: 1, rank: 1, name: 'Bitcoin', symbol: 'BTC', slug: 'bitcoin' }, { id: 9001, rank: null, name: 'Fake Bitcoin', symbol: 'BTC', slug: 'fake-btc', platform: { name: 'Ethereum' } },
      { id: 32196, rank: 12, name: 'Hyperliquid', symbol: 'HYPE', slug: 'hyperliquid' }] });
    if (url.includes('/v2/cryptocurrency/quotes/latest')) { cmcCalls++; return J({ status: { error_code: 0 }, data: {
      1: { id: 1, name: 'Bitcoin', symbol: 'BTC', quote: { USD: { price: 77742.47, percent_change_24h: -0.12, last_updated: '2026-11-02T12:00:00Z' } } },
      32196: [{ id: 32196, name: 'Hyperliquid', symbol: 'HYPE', quote: { USD: { price: 85.71, percent_change_24h: -2.22 } } }],
      777: { id: 777, name: 'NoPrice', symbol: 'NOP', quote: { USD: { price: null } } } } }); }
  }
  // Notion
  if (url.includes('api.notion.com')) {
    assert.equal(init.headers.Authorization, 'Bearer ntn_x');
    if (notionMode === 'unshared') return J({ message: 'Could not find database' }, 404);
    if (url.endsWith('/databases/1af97b4b-1373-4867-b105-b6afc71ff37f/query')) {
      const em = body.filter.or.map(f => f.email.contains);
      return J({ results: [person('per1', 'Dana Fox', 'DANA@acme.example'), person('per2', 'Alexandra', 'a@y.com.au'), person('per3', 'Alex Young', 'a@y.com')].filter(p => em.some(e => p.properties.Email.email.toLowerCase().includes(e))) });
    }
    if (url.endsWith('/pages/co1')) return J({ id: 'co1', properties: { Name: { type: 'title', title: [{ plain_text: 'Acme Corp' }] } } });
    if (url.endsWith('/databases/f5ce7d95-2e83-46f0-a0f4-3e7e441f632f/query')) {
      return body.start_cursor ? J({ results: [restaurant('r2', 'Filandón', { City: { select: { name: 'Madrid' } }, Favourite: { checkbox: false } })], has_more: false })
        : J({ results: [restaurant('r1', 'Far Nomo')], has_more: true, next_cursor: 'c2' });
    }
    if (url.includes('/pages/' + RID) && init.method === 'PATCH') return J(restaurant(RID, 'Far Nomo', { 'Card needed': body.properties?.['Card needed'] || { select: { name: 'Unknown' } }, Visits: body.properties?.Visits || { number: null } }));
    if (url.endsWith('/databases/2e2e528f-adf8-8195-bced-f39c537ae294/query')) {
      if (body.filter.property === 'Completion Date') return J({ results: [page('p3', 'Sent invoice', 'Done', '2026-10-30', '2026-11-01')] });
      if (body.filter.and[0].or) return J({ results: [page('t9', 'Send pilot terms', 'Not started', '2026-11-03', null, { 'Waiting on': { checkbox: true }, Person: { relation: [{ id: 'per3' }] } })] });
      return J({ results: [page('p1', 'Pay rent', 'Not started', '2026-10-30'), page('p2', 'Plan trip', 'In progress', null)] });
    }
    if (url.includes('/pages/') && init.method === 'PATCH') return J(page(url.split('/pages/')[1], 'Pay rent', body.properties.Status.status.name, '2026-10-30', body.properties['Completion Date'].date?.start || null));
    if (url.endsWith('/v1/pages') && init.method === 'POST') {
      if (body.parent.database_id === env.NOTION_RESTAURANTS_DB) return J(restaurant('rnew', body.properties.Name.title[0].text.content, { City: body.properties.City }));
      if (body.parent.database_id === env.NOTION_MEETINGS_DB) return J({ id: 'meet1', url: 'https://notion.so/meet1', properties: body.properties });
      return J(page('new1', body.properties.Name.title[0].text.content, 'Not started', body.properties['Due Date']?.date.start || null));
    }
  }
  return J({ error: { message: 'unexpected ' + url } }, 404);
};
const req = (path, key = 'sekret', init = {}) => worker.fetch(new Request('https://x.test' + path, { ...init, headers: { 'X-App-Key': key, Origin: 'https://me.github.io', ...(init.headers || {}) } }), env);
const post = (path, b) => req(path, 'sekret', { method: 'POST', body: JSON.stringify(b), headers: { 'Content-Type': 'application/json' } });
const form = (path, b) => worker.fetch(new Request('https://x.test' + path, { method: 'POST', body: b, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, redirect: 'manual' }), env);
let res, r;

// ---- helpers
assert.equal(htmlToText('A<br>B &amp; C<p>x</p>'), 'A\nB & C\nx');
assert.deepEqual(parseFrom('"Dana Fox" <Dana@Acme.example>'), { name: 'Dana Fox', email: 'dana@acme.example' });
assert.deepEqual(parseFrom('news@shop.example'), { name: 'news@shop.example', email: 'news@shop.example' });
assert.equal(decodeEntities('It&#39;s &amp; &quot;ok&quot;'), 'It\'s & "ok"');

// ---- auth and CORS
assert.equal((await req('/api/status', 'bad')).status, 401);
r = await (await req('/api/status')).json(); assert.equal(r.connected, true); assert.equal(r.calendarConnected, true); assert.equal(r.notion, true); assert.equal(r.meetingsDb, true);
res = await worker.fetch(new Request('https://x.test/api/tasks/add', { method: 'OPTIONS', headers: { Origin: 'https://me.github.io' } }), env);
assert.equal(res.status, 204); assert.match(res.headers.get('Access-Control-Allow-Methods'), /POST/); assert.match(res.headers.get('Access-Control-Allow-Headers'), /Content-Type/);
assert.equal((await worker.fetch(new Request('https://x.test/api/status', { headers: { Origin: 'https://evil.example', 'X-App-Key': 'sekret' } }), env)).headers.get('Access-Control-Allow-Origin'), null);

// ---- separate Google logins: health never carries calendar or gmail scopes
let loc = (await form('/auth/start', 'key=sekret&service=health')).headers.get('Location');
const hs = new URL(loc).searchParams.get('scope');
assert.match(hs, /googlehealth\.sleep/); assert.ok(!/calendar|gmail/.test(hs), 'health scopes stay health only');
loc = (await form('/auth/start', 'key=sekret&service=calendar')).headers.get('Location');
const cs = new URL(loc).searchParams.get('scope').split(' ');
assert.deepEqual(cs.sort(), ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/gmail.readonly']);
assert.equal((await form('/auth/start', 'key=wrong&service=calendar')).status, 401);
const calState = new URL(loc).searchParams.get('state'), realFetch = globalThis.fetch;
globalThis.fetch = async (u, i) => String(u).includes('oauth2.googleapis.com/token') && String(i.body).includes('authorization_code') ? J({ access_token: 'X', refresh_token: 'CAL_RT2', expires_in: 3599, scope: cs.join(' ') }) : realFetch(u, i);
res = await worker.fetch(new Request(`https://x.test/auth/callback?state=${calState}&code=abc`), env); globalThis.fetch = realFetch;
assert.match(await res.text(), /Google Calendar and Gmail connected/);
assert.equal(store.get('refreshToken:calendar'), 'CAL_RT2'); assert.equal(store.get('refreshToken'), 'HEALTH_RT', 'health login untouched');
store.set('refreshToken:calendar', 'CAL_RT'); store.delete('accessToken:calendar');

// ---- health sync still works
res = await req('/api/days?from=2026-10-29&to=2026-10-30'); r = await res.json();
assert.deepEqual(r.errors, [], JSON.stringify(r.errors)); assert.equal(r.days['2026-10-30'].steps, 9001);
assert.ok(!tokenCalls.some(b => b.includes('CAL_RT') && calls.some(c => c.url.includes('health.googleapis.com') && false)), 'sanity');

// ---- calendar read
const range = 'from=2026-10-31T23:00:00.000Z&to=2026-11-01T23:00:00.000Z';
assert.equal((await req('/api/calendar?from=x&to=y')).status, 400);
res = await req('/api/calendar?' + range); r = await res.json();
assert.deepEqual(r.events.map(e => e.title), ['Birthday', 'Standup', 'Lunch']); assert.equal(r.events[1].video, 'https://meet.google.com/abc');
assert.equal(r.events[1].attendees.length, 2); assert.equal(r.events[1].attendees.find(a => !a.self).email, 'a@y.com'); assert.equal(r.events[1].description, 'Agenda:\nDoc (https://docs.example/x) & more');
calMode = 'noscope'; store.set('accessToken:calendar', 'AT');
res = await req('/api/calendar?' + range); assert.equal(res.status, 403); assert.match((await res.json()).error, /Calendar permission is missing/); calMode = 'ok';

// ---- add an event
assert.throws(() => buildEvent({ title: '' }), /title/); assert.throws(() => buildEvent({ title: 'x', start: '2026-11-02T10:00:00Z', end: '2026-11-02T09:00:00Z' }), /Bad start/);
assert.throws(() => buildEvent({ title: 'x', start: '2026-11-02T10:00:00Z', end: '2026-11-02T11:00:00Z', guests: ['nope'] }), /guest/);
assert.throws(() => buildEvent({ title: 'x', allDay: true, start: '2026-11-02', end: '2026-11-02' }), /all-day/);
let ev = buildEvent({ title: ' Dentist ', start: '2026-11-02T09:00:00+01:00', end: '2026-11-02T09:45:00+01:00', timeZone: 'Europe/Vienna' });
assert.equal(ev.body.summary, 'Dentist'); assert.equal(ev.body.start.dateTime, '2026-11-02T08:00:00.000Z'); assert.equal(ev.body.start.timeZone, 'Europe/Vienna'); assert.match(ev.query, /sendUpdates=none/, 'no guests, nobody is emailed');
ev = buildEvent({ title: 'Sync', start: '2026-11-02T09:00:00Z', end: '2026-11-02T10:00:00Z', guests: ['A@Y.com', 'a@y.com'], meet: true });
assert.deepEqual(ev.body.attendees, [{ email: 'a@y.com' }]); assert.match(ev.query, /sendUpdates=all/); assert.equal(ev.body.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
res = await post('/api/calendar/add', { title: 'Focus block', start: '2026-11-02T14:00:00+01:00', end: '2026-11-02T15:00:00+01:00', timeZone: 'Europe/Vienna', location: 'Desk' }); r = await res.json();
assert.equal(res.status, 200, JSON.stringify(r)); assert.equal(r.event.title, 'Focus block');
assert.equal((await post('/api/calendar/add', { title: '' })).status, 400); assert.equal((await req('/api/calendar/add')).status, 405);

// ---- Gmail
res = await req('/api/mail/inbox'); r = await res.json();
assert.equal(res.status, 200, JSON.stringify(r)); assert.equal(r.account, 'me@x.com'); assert.equal(r.unread, 2, 'unread counts the Primary mail that was returned');
assert.equal(r.messages.length, 2); assert.equal(r.messages[0].from.email, 'dana@acme.example'); assert.equal(r.messages[0].subject, 'Re: pilot terms & dates');
assert.equal(r.messages[0].crm.name, 'Dana Fox'); assert.equal(r.messages[0].crm.tier, 'A - Key'); assert.equal(r.messages[0].starred, true); assert.equal(r.messages[1].crm, null);
assert.equal(r.messages[0].snippet, "Hi 'there' & co");
res = await post('/api/mail/threads', { emails: ['a@y.com', 'bad', 'a@y.com'] }); r = await res.json();
assert.equal(res.status, 200, JSON.stringify(r)); assert.deepEqual(r.messages.map(m => m.threadId), ['thA', 'thB'], 'one row per thread'); assert.equal(r.messages[0].mine, false);
assert.deepEqual(await (await post('/api/mail/threads', { emails: [] })).json(), { account: '', messages: [] });
calMode = 'nogmail'; store.set('accessToken:calendar', 'AT');
res = await req('/api/mail/inbox'); assert.equal(res.status, 403); assert.match((await res.json()).error, /Gmail permission is missing/); calMode = 'ok';
assert.equal(store.get('lastError') ?? null, null, 'mail and calendar problems never look like a Fitbit error');

// ---- one mail's text for the inline view
assert.equal(cleanBody('Sure!\n\nOn Mon, 2 Nov 2026 at 09:00, Dana <d@x.com> wrote:\n> old\n> older').text, 'Sure!', 'a short reply loses its quoted history');
assert.equal(cleanBody('On Mon, 2 Nov 2026 at 09:00, Dana <d@x.com> wrote:\nonly quoted text here').text.length > 0, true, 'never cut to nothing');
assert.equal(cleanBody('A short note that is long enough to keep.\n> quoted line\nand a last line').text, 'A short note that is long enough to keep.\nand a last line');
assert.equal(cleanBody('x'.repeat(10) + ' ' + 'y '.repeat(2000), 100).truncated, true);
assert.equal(b64url(Buffer.from('Caf\u00e9', 'utf8').toString('base64url')), 'Caf\u00e9');
assert.equal(b64url('***not base64***'), '');
res = await post('/api/mail/message', { id: 'abc123def456' }); r = await res.json();
assert.equal(res.status, 200, JSON.stringify(r)); assert.match(r.text, /^Hi Matthias,\n\nCan we move kickoff to the 16th\? Caf\u00e9 at 9\?\n\nThanks,\nDana$/, r.text); assert.ok(!/earlier text|wrote/.test(r.text), 'quoted history is cut');
assert.deepEqual(r.files, [{ name: 'terms.pdf', size: 2048 }]); assert.equal(r.truncated, false);
r = await (await post('/api/mail/message', { id: 'f00dfeed0001' })).json(); assert.equal(r.text, 'Hello there\n\nSecond line & more', 'html-only mail becomes text without the style block');
r = await (await post('/api/mail/message', { id: 'f00dfeed0002' })).json(); assert.equal(r.text, 'Only a snippet', 'falls back to the snippet');
r = await (await post('/api/mail/message', { id: 'f00dfeed0003' })).json(); assert.equal(r.truncated, true); assert.ok(r.text.length <= 1800);
assert.equal((await post('/api/mail/message', { id: '../../users/me/drafts' })).status, 400); assert.equal((await post('/api/mail/message', {})).status, 400); assert.equal((await req('/api/mail/message')).status, 405);
calMode = 'nogmail'; store.set('accessToken:calendar', 'AT'); res = await post('/api/mail/message', { id: 'abc123def456' }); assert.equal(res.status, 403); calMode = 'ok';
assert.ok(!calls.some(c => c.url.includes('/messages/abc123def456') && c.init.method && c.init.method !== 'GET'), 'reading a mail never writes to it');

// ---- Notion tasks, CRM brief, meeting notes
r = await (await req('/api/tasks?date=2026-11-01')).json(); assert.deepEqual(r.open.map(t => t.title), ['Pay rent', 'Plan trip']); assert.deepEqual(r.doneOn.map(t => t.title), ['Sent invoice']);
res = await post('/api/tasks/done', { id: PID, date: '2026-11-01' }); assert.equal((await res.json()).task.status, 'Done');
assert.equal((await post('/api/tasks/done', { id: '../x', date: '2026-11-01' })).status, 400);
res = await post('/api/tasks/reopen', { id: PID, status: 'Done' }); assert.equal((await res.json()).task.status, 'Not started', 'reopen can never set Done');
res = await post('/api/tasks/add', { title: ' Reply: pilot ', due: '2026-11-03', person: PID, notes: 'From Dana\nhttps://mail.google.com/x' }); r = await res.json();
assert.equal(r.task.title, 'Reply: pilot'); const added = JSON.parse(calls.filter(c => c.url.endsWith('/v1/pages')).at(-1).init.body).properties;
assert.equal(added.Notes.rich_text[0].text.content, 'From Dana\nhttps://mail.google.com/x'); assert.deepEqual(added.Person, { relation: [{ id: PID }] });
assert.equal((await post('/api/tasks/add', { title: 'x', person: 'bad' })).status, 400);
res = await post('/api/brief', { emails: ['dana@acme.example', 'a@y.com', 'ghost@z.com', 'x'] }); r = await res.json();
assert.deepEqual(r.people.map(p => p.name).sort(), ['Alex Young', 'Dana Fox'], 'a@y.com.au must not match a@y.com'); assert.equal(r.people.find(p => p.name === 'Dana Fox').company, 'Acme Corp'); assert.deepEqual(r.unmatched, ['ghost@z.com']);
assert.equal(r.people.find(p => p.name === 'Alex Young').tasks[0].waiting, true);
res = await post('/api/meetings/new', { title: 'Pitch review', start: '2026-11-02T11:00:00+01:00', end: '2026-11-02T12:00:00+01:00', attendees: [PID, 'junk'] }); r = await res.json();
assert.equal(res.status, 200, JSON.stringify(r)); assert.equal(r.url, 'https://notion.so/meet1');
const mp = JSON.parse(calls.filter(c => c.url.endsWith('/v1/pages')).at(-1).init.body);
assert.equal(mp.parent.database_id, env.NOTION_MEETINGS_DB); assert.equal(mp.properties.Name.title[0].text.content, 'Pitch review'); assert.deepEqual(mp.properties.Date.date, { start: '2026-11-02T11:00:00+01:00', end: '2026-11-02T12:00:00+01:00' });
assert.deepEqual(mp.properties.Attendees.relation, [{ id: PID }], 'only valid page ids are linked');
await post('/api/meetings/new', {}); assert.equal(JSON.parse(calls.filter(c => c.url.endsWith('/v1/pages')).at(-1).init.body).properties.Name.title[0].text.content, 'Meeting');
res = await worker.fetch(new Request('https://x.test/api/meetings/new', { method: 'POST', body: '{}', headers: { 'X-App-Key': 'sekret' } }), { ...env, NOTION_MEETINGS_DB: undefined }); assert.equal(res.status, 409);
notionMode = 'unshared'; r = await (await req('/api/tasks?date=2026-11-01')).json(); assert.match(r.error, /share the task database/); notionMode = 'ok';

// ---- CoinMarketCap
res = await post('/api/crypto/search', { symbols: ['btc', 'HYPE', 'bad symbol!', 'btc'] }); r = await res.json();
assert.equal(res.status, 200, JSON.stringify(r)); assert.deepEqual(Object.keys(r.results).sort(), ['BTC', 'HYPE']);
assert.deepEqual(r.results.BTC.map(c => c.id), [1, 9001], 'best rank first, unranked last'); assert.equal(r.results.BTC[1].chain, 'Ethereum');
const cmcUrl = calls.filter(c => c.url.includes('/v1/cryptocurrency/map')).at(-1).url; assert.match(decodeURIComponent(cmcUrl), /symbol=BTC,HYPE/);
assert.equal((await post('/api/crypto/search', { symbols: [] })).status, 400);
res = await post('/api/crypto/quotes', { ids: [32196, 1, 1, 'x', -5, 1.5] }); r = await res.json();
assert.equal(r.quotes[1].price, 77742.47); assert.equal(r.quotes[1].change24h, -0.12); assert.equal(r.quotes[32196].symbol, 'HYPE'); assert.equal(r.quotes[777], undefined, 'coins without a price are dropped');
assert.match(decodeURIComponent(calls.filter(c => c.url.includes('quotes/latest')).at(-1).url), /id=1,32196/);
await post('/api/crypto/quotes', { ids: [1, 32196] }); assert.equal(cmcCalls, 1, 'the second ask within a minute comes from the cache');
assert.deepEqual((await (await post('/api/crypto/quotes', { ids: [] })).json()).quotes, {});
store.delete('cmc:q:1,32196'); cmcMode = 'badkey'; res = await post('/api/crypto/quotes', { ids: [1, 32196] }); assert.match((await res.json()).error, /rejected the API key/);
cmcMode = 'limit'; res = await post('/api/crypto/search', { symbols: ['BTC'] }); assert.match((await res.json()).error, /rate limit/); cmcMode = 'ok';
res = await worker.fetch(new Request('https://x.test/api/crypto/quotes', { method: 'POST', body: '{"ids":[1]}', headers: { 'X-App-Key': 'sekret' } }), { ...env, CMC_API_KEY: undefined }); assert.equal(res.status, 409);
assert.equal((await (await req('/api/status')).json()).crypto, true);
assert.equal(store.get('lastError') ?? null, null, 'price problems never look like a Fitbit error');

// ---- Restaurants (Mesa)
res = await post('/api/restaurants/list', {}); r = await res.json();
assert.equal(res.status, 200, JSON.stringify(r)); assert.deepEqual(r.restaurants.map(x => x.name), ['Far Nomo', 'Filandón'], 'follows the pagination cursor');
assert.deepEqual(r.restaurants[0], { id: 'r1', url: 'https://notion.so/r1', name: 'Far Nomo', city: 'Costa Brava', area: 'Llafranc', cuisine: 'Japanese', meals: ['Lunch'], tags: ['Sea view'], price: '', favourite: true, method: 'CoverManager',
  bookingLink: 'https://book.example/far', platformId: '', website: '', phone: '+34 972 000 000', whatsapp: '', card: 'Unknown', policy: '', notes: '', lastVisit: null, visits: 0, wishlist: '', why: '', added: '2026-11-02' });
assert.equal((await req('/api/restaurants/list')).status, 405, 'POST only');
res = await post('/api/restaurants/update', { id: RID, fields: { card: 'Yes - deposit', visits: 2, lastVisit: '2026-11-07', policy: 'EUR 20 per person' } }); r = await res.json();
assert.equal(res.status, 200, JSON.stringify(r)); assert.equal(r.restaurant.card, 'Yes - deposit'); assert.equal(r.restaurant.visits, 2);
const rp = JSON.parse(calls.filter(c => c.url.includes('/pages/' + RID)).at(-1).init.body).properties;
assert.deepEqual(rp['Card needed'], { select: { name: 'Yes - deposit' } }); assert.deepEqual(rp['Last visit'], { date: { start: '2026-11-07' } }); assert.equal(rp['Deposit / policy'].rich_text[0].text.content, 'EUR 20 per person');
for (const m of ['Myrestoo', 'Agora POS']) { res = await post('/api/restaurants/update', { id: RID, fields: { method: m } }); assert.equal(res.status, 200, m); assert.deepEqual(JSON.parse(calls.filter(c => c.url.includes('/pages/' + RID)).at(-1).init.body).properties['Booking method'], { select: { name: m } }, m); }
res = await post('/api/restaurants/update', { id: RID, fields: { tags: ['Terrace', 'Terrace', 'Romantic'] } }); assert.equal(res.status, 200);
assert.deepEqual(JSON.parse(calls.filter(c => c.url.includes('/pages/' + RID)).at(-1).init.body).properties.Tags, { multi_select: [{ name: 'Terrace' }, { name: 'Romantic' }] }, 'tags are de-duplicated');
for (const bad of [{ card: 'Maybe' }, { method: 'Fax' }, { bookingLink: 'javascript:alert(1)' }, { phone: 'call me' }, { visits: -1 }, { visits: 1.5 }, { lastVisit: 'tomorrow' }, { city: 'Paris' }, { meals: ['Snack'] }, { tags: ['Haunted'] }, { name: '' }]) {
  assert.equal((await post('/api/restaurants/update', { id: RID, fields: bad })).status, 400, JSON.stringify(bad));
}
assert.equal((await post('/api/restaurants/update', { id: 'nope', fields: { card: 'No' } })).status, 400);
assert.equal((await post('/api/restaurants/update', { id: RID, fields: { secret: 'x' } })).status, 400, 'unknown fields are ignored, leaving nothing to change');
res = await post('/api/restaurants/add', { name: '  Nuevo  ', city: 'Madrid', cuisine: 'Tapas, bar' }); r = await res.json();
assert.equal(res.status, 200, JSON.stringify(r)); assert.equal(r.restaurant.name, 'Nuevo');
const ap = JSON.parse(calls.filter(c => c.url.endsWith('/v1/pages')).at(-1).init.body);
assert.equal(ap.parent.database_id, env.NOTION_RESTAURANTS_DB); assert.deepEqual(ap.properties['Card needed'], { select: { name: 'Unknown' } }); assert.equal(ap.properties.Cuisine.select.name, 'Tapas  bar', 'commas are not allowed in a select option');
assert.equal((await post('/api/restaurants/add', { name: 'No city' })).status, 400);
res = await worker.fetch(new Request('https://x.test/api/restaurants/list', { method: 'POST', body: '{}', headers: { 'X-App-Key': 'sekret' } }), { ...env, NOTION_RESTAURANTS_DB: undefined }); assert.equal(res.status, 409);
notionMode = 'unshared'; r = await (await post('/api/restaurants/list', {})).json(); assert.match(r.error, /Connections/); notionMode = 'ok';
assert.equal((await (await req('/api/status')).json()).restaurantsDb, true);
assert.deepEqual(Object.keys(restaurantProps({ name: 'X', city: 'Vienna' }, true)), ['Name', 'City']);

// ---- Wishlist (places not visited yet, same database)
res = await post('/api/restaurants/add', { name: 'Gresca', city: 'Madrid', wishlist: 'Want to try', why: 'Recommended by Ana, tasting menu' }); r = await res.json();
assert.equal(res.status, 200, JSON.stringify(r));
const wp = JSON.parse(calls.filter(c => c.url.endsWith('/v1/pages')).at(-1).init.body).properties;
assert.deepEqual(wp.Wishlist, { select: { name: 'Want to try' } }); assert.equal(wp['Why / recommended by'].rich_text[0].text.content, 'Recommended by Ana, tasting menu');
res = await post('/api/restaurants/update', { id: RID, fields: { wishlist: '', visits: 1, favourite: true } }); assert.equal(res.status, 200, 'clearing the wishlist flag means "I have been"');
assert.deepEqual(JSON.parse(calls.filter(c => c.url.includes('/pages/' + RID)).at(-1).init.body).properties.Wishlist, { select: null });
assert.equal((await post('/api/restaurants/update', { id: RID, fields: { wishlist: 'Been' } })).status, 400, 'Been is not stored: clear the flag instead');
assert.deepEqual(mapRestaurant({ id: 'w', properties: { Name: { title: [{ plain_text: 'W' }] }, Wishlist: { select: { name: 'Booked' } }, 'Why / recommended by': { rich_text: [{ plain_text: 'Tip' }] } }, created_time: '2026-11-04T08:00:00Z' }).wishlist, 'Booked');
res = await post('/api/restaurants/archive', { id: RID }); r = await res.json(); assert.equal(res.status, 200, JSON.stringify(r));
assert.deepEqual(JSON.parse(calls.filter(c => c.url.includes('/pages/' + RID)).at(-1).init.body), { archived: true });
await post('/api/restaurants/archive', { id: RID, archived: false }); assert.deepEqual(JSON.parse(calls.filter(c => c.url.includes('/pages/' + RID)).at(-1).init.body), { archived: false }, 'undo restores');
assert.equal((await post('/api/restaurants/archive', { id: 'nope' })).status, 400);
assert.equal((await req('/api/restaurants/archive')).status, 405, 'POST only');

// ---- Share from Google Maps -> wishlist
res = await post('/api/restaurants/share', { text: 'Casa Orellana\nCalle Orellana, 6, 28004 Madrid\nhttps://maps.app.goo.gl/abc123' }); r = await res.json();
assert.equal(res.status, 200, JSON.stringify(r)); assert.equal(r.existing, false); assert.equal(r.resolved.city, 'Madrid');
let sp = JSON.parse(calls.filter(c => c.url.endsWith('/v1/pages')).at(-1).init.body).properties;
assert.equal(sp.Name.title[0].text.content, 'Casa Orellana'); assert.deepEqual(sp.Wishlist, { select: { name: 'Want to try' } }); assert.match(sp.Notes.rich_text[0].text.content, /maps\.app\.goo\.gl\/abc123/);
assert.ok(!calls.some(c => c.url.includes('maps.app.goo.gl')), 'name and address came with the share, so no lookup is needed');
res = await post('/api/restaurants/share', { url: 'https://maps.app.goo.gl/xyz' }); r = await res.json();
assert.equal(res.status, 200, JSON.stringify(r)); assert.equal(r.resolved.name, 'Casa Julián de Tolosa'); assert.equal(r.resolved.city, 'Madrid'); assert.match(r.resolved.address, /Cava Baja/);
res = await post('/api/restaurants/share', { text: 'Far Nomo\nLlafranc\nhttps://maps.app.goo.gl/q' }); r = await res.json();
assert.equal(res.status, 200); assert.equal(r.existing, true, 'a place already in the list is not added twice'); assert.equal(r.restaurant.name, 'Far Nomo');
assert.equal((await post('/api/restaurants/share', {})).status, 400);
assert.equal(guessCity('Carrer Major 1, 17255 Begur'), 'Costa Brava'); assert.equal(guessCity('Walfischgasse 5, 1010 Wien'), 'Vienna'); assert.equal(guessCity('Rua Augusta, Lisboa'), '');
assert.deepEqual(placeFromMapsUrl('https://consent.google.com/m?continue=' + encodeURIComponent('https://www.google.com/maps/place/Gresca,+Barcelona/@41,2')), { name: 'Gresca', address: 'Barcelona' });

// ---- Visit log
res = await post('/api/visits/list', {}); r = await res.json();
assert.equal(res.status, 200, JSON.stringify(r)); assert.equal(r.visits.length, 2); assert.equal(r.visits[0].date, '2026-11-02', 'newest first'); assert.deepEqual(r.visits[0], { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', restaurantId: RID, date: '2026-11-02', ate: 'Gyoza', rating: 9, notes: '' });
res = await post('/api/visits/add', { restaurantId: RID, name: 'Far Nomo', date: '2026-11-07', ate: 'Gyoza, black cod', rating: 9, notes: 'Window table' }); r = await res.json();
assert.equal(res.status, 200, JSON.stringify(r));
const vp = JSON.parse(calls.filter(c => c.url.endsWith('/v1/pages')).at(-1).init.body);
assert.equal(vp.parent.database_id, '54f5007a-41c1-463d-9fe3-1f4939d31fa6'); assert.deepEqual(vp.properties.Restaurant, { relation: [{ id: RID }] }); assert.equal(vp.properties.Rating.number, 9); assert.match(vp.properties.Visit.title[0].text.content, /Far Nomo · 2026-11-07/);
const sync = JSON.parse(calls.filter(c => c.url.includes('/pages/' + RID) && c.init.method === 'PATCH').at(-1).init.body).properties;
assert.deepEqual(sync.Visits, { number: 2 }, 'visit count is recomputed from the log'); assert.deepEqual(sync['Last visit'], { date: { start: '2026-11-02' } }); assert.deepEqual(sync.Wishlist, { select: null }, 'a visited place leaves the wishlist');
for (const bad of [{ restaurantId: 'nope', date: '2026-11-07' }, { restaurantId: RID, date: 'yesterday' }, { restaurantId: RID, date: '2026-11-07', rating: 11 }, { restaurantId: RID, date: '2026-11-07', rating: 7.5 }]) assert.equal((await post('/api/visits/add', bad)).status, 400, JSON.stringify(bad));
res = await post('/api/visits/add', { restaurantId: RID, name: 'Far Nomo', date: '2026-11-08' }); assert.equal(res.status, 200, 'score and notes are optional');
res = await post('/api/visits/delete', { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1' }); r = await res.json(); assert.equal(res.status, 200, JSON.stringify(r));
assert.ok(calls.some(c => c.url.endsWith('/pages/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') && c.init.method === 'PATCH' && JSON.parse(c.init.body).archived === true), 'deleting a visit archives it');
res = await worker.fetch(new Request('https://x.test/api/visits/list', { method: 'POST', body: '{}', headers: { 'X-App-Key': 'sekret' } }), { ...env, NOTION_VISITS_DB: undefined }); assert.equal(res.status, 409);

console.log('worker tests passed');
