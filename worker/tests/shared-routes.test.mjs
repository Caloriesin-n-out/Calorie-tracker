// Full current-bundle integration fixtures. No real APIs, credentials or account writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
if (!globalThis.crypto) Object.defineProperty(globalThis,'crypto',{value:webcrypto});
let src=fs.readFileSync(process.argv[2] || new URL('../worker.js', import.meta.url),'utf8');
src+='\nexport {gymPairSign};\n';
const testPath='/tmp/myday-routes-test-'+process.pid+'.mjs';
fs.writeFileSync(testPath,src);
const {default:worker,MesaStore,gymPairSign,buildEvent}=await import('file://'+testPath+'?'+Date.now());
class Storage {
 constructor(){this.m=new Map();}
 async get(k){return structuredClone(this.m.get(k));}
 async put(k,v){this.m.set(k,structuredClone(v));}
 async delete(k){this.m.delete(k);}
 async transaction(fn){return fn(this);}
}
const storage=new Storage();
const mesa=new MesaStore({storage},{});
const kv=new Map();
const env={APP_KEY:'fixture-app-key',GOOGLE_CLIENT_ID:'fixture-client',GOOGLE_CLIENT_SECRET:'fixture-secret',ALLOWED_ORIGIN:'https://mydayappmh.github.io',TOKENS:{async get(k,t){const v=kv.get(k)||null;return t==='json'&&v?JSON.parse(v):v;},async put(k,v){kv.set(k,v);},async delete(k){kv.delete(k);}},MESA_STORE:{idFromName:n=>n,get:()=>({fetch:(u,opts)=>mesa.fetch(new Request(u,opts))})}};
let network=[];let handler=()=>{throw Error('Unexpected network call')};
globalThis.fetch=async(u,opts={})=>{network.push({u:String(u),opts});return handler(String(u),opts);};
const J=(x,s=200)=>new Response(JSON.stringify(x),{status:s});
const request=(path,{body,method,key=env.APP_KEY,origin='https://mydayappmh.github.io'}={})=>worker.fetch(new Request('https://fixture.invalid'+path,{method:method||(body?'POST':'GET'),headers:{'X-App-Key':key,Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,{});
assert.equal((await request('/api/shared-tasks/status',{key:''})).status,401);
let r=await request('/api/shared-tasks/status');assert.equal(r.status,200);assert.deepEqual(await r.json(),{connected:false,account:null,list:null});
assert.equal((await request('/api/shared-tasks/status',{method:'POST'})).status,405);
assert.equal((await request('/api/shared-tasks/nonsense',{body:{}})).status,404);
assert.equal((await request('/api/shared-tasks/lists')).status,409);
for (const [kind,origin] of [['gym2','https://gymmh.github.io'],['golf2','https://golfcaddie-ai.github.io']]) {
 const now=Math.floor(Date.now()/1000);const token=await gymPairSign(env,kind,{iat:now,exp:now+3600,nonce:'a'.repeat(64)});
 for (const path of ['/api/shared-tasks/status','/api/shared-tasks/lists','/api/shared-calendar']) {
  assert.equal((await request(path,{key:token,origin})).status,403,kind+' escaped its original restrictions');
 }
}
assert.equal(network.length,0,'Disconnected/restricted requests must never contact Google');
// Existing booking delivery/list/ack/restore use the unchanged real MesaStore with in-memory storage.
assert.equal(typeof MesaStore,'function');
const booking={key:'fixture-place|2026-11-23|20:00',name:'Fixture Place',date:'2026-11-23',time:'20:00',party:2,source:'request',sourceRef:'fixture-request'};
r=await request('/api/bookings/deliver',{body:booking});assert.equal(r.status,200,await r.clone().text());
r=await request('/api/bookings/deliveries',{body:{deviceId:'fixture-phone'}});let b=await r.json();assert.equal(r.status,200);assert.equal(b.deliveries.length,1);assert.equal(b.deliveries[0].key,booking.key);
r=await request('/api/bookings/ack',{body:{deviceId:'fixture-phone',accepted:[booking.key]}});assert.equal(r.status,200);
r=await request('/api/bookings/deliveries',{body:{deviceId:'fixture-phone'}});assert.equal((await r.json()).deliveries.length,0);
r=await request('/api/bookings/deliveries',{body:{deviceId:'fixture-new-phone'}});assert.equal((await r.json()).deliveries.length,1);
r=await request('/api/bookings/ack',{body:{deviceId:'fixture-phone',rejected:[booking.key]}});assert.equal(r.status,200);
r=await request('/api/bookings/restore',{body:{key:booking.key}});b=await r.json();assert.equal(r.status,200);assert.equal(b.restored,true);
// Existing gym completion route remains routed to its stable-ID validator.
r=await request('/api/calendar/complete',{body:{source:'gym',sourceId:'?'}});assert.equal(r.status,400);
// Existing calendar target validation is still active and never falls back to primary.
kv.set('accessToken:calendar','fixture-personal-token');
handler=(u,opts)=>{assert.equal(opts.method,undefined);assert(u.includes('calendarList'));return J({items:[{id:'read-only',accessRole:'reader'},{id:'editable',accessRole:'writer'}]});};
r=await request('/api/calendar/add',{body:{title:'Fixture',start:'2026-11-23T19:00:00+01:00',end:'2026-11-23T20:00:00+01:00',calendarId:'read-only'}});assert.equal(r.status,400);assert.match((await r.json()).error,/read.only/i);
r=await request('/api/calendar/add',{body:{title:'Fixture',start:'2026-11-23T19:00:00+01:00',end:'2026-11-23T20:00:00+01:00',calendarId:'missing'}});assert.equal(r.status,400);assert.match((await r.json()).error,/Unknown calendar/);
// Shared routes dispatch to isolated provider token, never personal token or Notion.
kv.set('refreshToken:shared-tasks','fixture-rt');kv.set('accessToken:shared-tasks','fixture-shared-token');kv.set('sharedTasks:identity',JSON.stringify({sub:'fixture-sub',email:'anaymatti@gmail.com'}));kv.set('sharedTasks:config',JSON.stringify({listId:'fixture-list',listTitle:'Fixtures',accountSub:'fixture-sub'}));
handler=(u,opts)=>{assert.equal(opts.headers.Authorization,'Bearer fixture-shared-token');assert(u.startsWith('https://tasks.googleapis.com/'));assert(u.includes('/lists/fixture-list/tasks'));return J({items:[{id:'fixture-task',title:'Fixture',etag:'fixture-etag',status:'needsAction',due:'2026-11-23T00:00:00Z'}]});};
r=await request('/api/shared-tasks?date=2026-11-23');b=await r.json();assert.equal(r.status,200);assert.equal(b.open.length,1);assert.equal(b.open[0].due,'2026-11-23');
// OAuth service allowlist rejects typos instead of changing Health storage.
r=await request('/auth/start?service=shraed');assert.equal(r.status,400);
// Existing personal Calendar callback keeps the original grant namespace and does not call shared userinfo.
kv.set('refreshToken','fixture-health-untouched');kv.set('state:fixture-calendar-state','calendar');
handler=(u,opts)=>{assert.equal(u,'https://oauth2.googleapis.com/token');assert.equal(opts.method,'POST');return J({access_token:'fixture-calendar-access',refresh_token:'fixture-calendar-refresh',expires_in:3600,scope:'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly'});};
r=await request('/auth/callback?state=fixture-calendar-state&code=fixture-calendar-code');assert.equal(r.status,200);assert.equal(kv.get('refreshToken:calendar'),'fixture-calendar-refresh');assert.equal(kv.get('refreshToken'),'fixture-health-untouched');assert.equal(kv.get('refreshToken:shared-tasks'),'fixture-rt');
// Shared write routes use only the chosen shared task list and isolated shared credential.
handler=(u,opts)=>{assert.equal(opts.headers.Authorization,'Bearer fixture-shared-token');assert(u.includes('/lists/fixture-list/tasks'));if(!opts.method)return J({id:'fixture-task',title:'Fixture',status:'needsAction',etag:'current-etag'});const body=JSON.parse(opts.body);if(opts.method==='POST'){assert.deepEqual(body,{title:'Fixture add',due:'2026-11-23T00:00:00.000Z'});return J({id:'fixture-added',...body,status:'needsAction',etag:'created-etag'});}assert.equal(opts.method,'PATCH');assert.equal(opts.headers['If-Match'],'current-etag');return J({id:'fixture-task',title:'Fixture',...body,etag:'new-etag'});};
r=await request('/api/shared-tasks/add',{body:{title:'Fixture add',due:'2026-11-23',notes:'Private fixture not copied'}});assert.equal(r.status,200);assert.equal((await r.json()).task.upstreamId,'fixture-added');
r=await request('/api/shared-tasks/done',{body:{upstreamId:'fixture-task',listId:'fixture-list',etag:'current-etag'}});assert.equal(r.status,200);assert.equal((await r.json()).task.status,'Done');
r=await request('/api/shared-tasks/reopen',{body:{upstreamId:'fixture-task',listId:'fixture-list',etag:'current-etag'}});assert.equal(r.status,200);assert.equal((await r.json()).task.status,'Not started');
// Existing ack-driven scanner reads a synthetic booking email, stores it transactionally,
// and does not touch Calendar or mark the source handled before device ack.
const importerStart=network.length;
const emailText='Fixture Place le informa: Su reserva para 2 personas ha sido confirmada para el día 23/11/2026 a las 20:00h.';
handler=(u,opts)=>{assert(!u.includes('/calendar/'),'Importer must remain calendar-isolated');assert.equal(opts.method,undefined);if(u.includes('/messages?'))return J({messages:[{id:'fixture-booking-mail'}]});if(u.includes('/messages/fixture-booking-mail?'))return J({id:'fixture-booking-mail',internalDate:String(Date.parse('2026-11-22T12:00:00Z')),snippet:emailText,payload:{mimeType:'text/plain',headers:[{name:'From',value:'Fixture Place <noreply@covermanager.com>'},{name:'Subject',value:'Reserva confirmada en Fixture Place'}],body:{data:Buffer.from(emailText).toString('base64url')}}});throw Error('Unexpected importer call '+u);};
r=await request('/api/bookings/scan',{body:{deviceId:'fixture-import-phone'}});b=await r.json();assert.equal(r.status,200,JSON.stringify(b));assert.equal(b.scanned,1);assert(b.deliveries.some(x=>(x.sourceMsgIds||[]).includes('fixture-booking-mail')),'Parsed fixture booking must reach current delivery store');assert.equal(storage.m.get('msg:fixture-booking-mail'),undefined);
const imported=b.deliveries.find(x=>(x.sourceMsgIds||[]).includes('fixture-booking-mail'));
r=await request('/api/bookings/ack',{body:{deviceId:'fixture-import-phone',accepted:[imported.key]}});assert.equal(r.status,200);assert.equal(storage.m.get('msg:fixture-booking-mail'),'v4');
assert(network.slice(importerStart).every(c=>c.u.startsWith('https://gmail.googleapis.com/')&&!c.opts.method));
console.log('PASS full-bundle route fixtures: auth gate + service allowlist; valid Gym/Golf scoped keys rejected from shared routes; real MesaStore delivery/list/ack/late-device/reject/restore; existing completion route; writable-calendar rejection with no primary fallback; isolated shared-token GET/add/done/reopen dispatch; original Calendar OAuth callback namespaces; booking-mail scan-to-store-to-ack, with no Calendar side effects or premature mail marks. No real network or real data writes.');
