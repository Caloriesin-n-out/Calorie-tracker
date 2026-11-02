// Run with: npm test (from the worker folder). Google, Gmail and Notion are simulated; nothing leaves the machine.
import worker, { htmlToText, buildEvent, parseFrom, decodeEntities } from '../worker.js';
import assert from 'node:assert/strict';

const store = new Map([['refreshToken', 'HEALTH_RT'], ['refreshToken:calendar', 'CAL_RT']]);
const TOKENS = { get: async (k, type) => { const v = store.get(k) ?? null; return type === 'json' && v ? JSON.parse(v) : v; }, put: async (k, v) => { store.set(k, v); }, delete: async k => { store.delete(k); } };
const env = { TOKENS, ALLOWED_ORIGIN: 'https://me.github.io', APP_KEY: 'sekret', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'cs',
  NOTION_TOKEN: 'ntn_x', NOTION_TASKS_DB: '2e2e528f-adf8-8195-bced-f39c537ae294', NOTION_PEOPLE_DB: '1af97b4b-1373-4867-b105-b6afc71ff37f', NOTION_MEETINGS_DB: '6311b063-37a4-468b-b661-111f32c063b2', CMC_API_KEY: 'cmc_key' };
let calls = [], calMode = 'ok', notionMode = 'ok', tokenCalls = [], cmcMode = 'ok', cmcCalls = 0;
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const PID = '2e2e528f-adf8-8195-bced-f39c537ae294';
function page(id, name, status, due, done = null, extra = {}) {
  return { id, url: 'https://notion.so/' + id, properties: { Name: { title: [{ plain_text: name }] }, Status: { status: { name: status } }, 'Due Date': { date: due ? { start: due } : null }, 'Completion Date': { date: done ? { start: done } : null },
    Type: { multi_select: [{ name: 'Personal' }] }, Tags: { multi_select: [] }, 'Waiting on': { checkbox: false }, 'Next Step': { rich_text: [] }, ...extra } };
}
const person = (id, name, email) => ({ id, url: 'https://notion.so/' + id, properties: { Name: { title: [{ plain_text: name }] }, Email: { email }, Role: { rich_text: [{ plain_text: 'CFO' }] }, Company: { relation: [{ id: 'co1' }] }, Tier: { select: { name: 'A - Key' } },
  'History summary': { rich_text: [{ plain_text: 'Wants a pilot.' }] }, 'Last Contacted': { formula: { type: 'date', date: { start: '2026-10-01' } } }, 'Follow-up Status': { formula: { type: 'string', string: 'Overdue' } }, 'Latest Interaction': { rollup: { type: 'date', date: null } } } });
const msg = (id, thread, from, subject, labels, ms) => ({ id, threadId: thread, labelIds: labels, snippet: 'Hi &#39;there&#39; &amp; co', internalDate: String(ms), payload: { headers: [{ name: 'From', value: from }, { name: 'To', value: 'me@x.com' }, { name: 'Subject', value: subject }] } });

globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push({ url, init });
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
    if (url.endsWith('/databases/2e2e528f-adf8-8195-bced-f39c537ae294/query')) {
      if (body.filter.property === 'Completion Date') return J({ results: [page('p3', 'Sent invoice', 'Done', '2026-10-30', '2026-11-01')] });
      if (body.filter.and[0].or) return J({ results: [page('t9', 'Send pilot terms', 'Not started', '2026-11-03', null, { 'Waiting on': { checkbox: true }, Person: { relation: [{ id: 'per3' }] } })] });
      return J({ results: [page('p1', 'Pay rent', 'Not started', '2026-10-30'), page('p2', 'Plan trip', 'In progress', null)] });
    }
    if (url.includes('/pages/') && init.method === 'PATCH') return J(page(url.split('/pages/')[1], 'Pay rent', body.properties.Status.status.name, '2026-10-30', body.properties['Completion Date'].date?.start || null));
    if (url.endsWith('/v1/pages') && init.method === 'POST') {
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

console.log('worker tests passed');
