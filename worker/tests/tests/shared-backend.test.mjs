import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
if (!globalThis.crypto) Object.defineProperty(globalThis,'crypto',{value:webcrypto});
let src=fs.readFileSync(process.argv[2] || new URL('../worker.js', import.meta.url),'utf8');
src+='\nexport {keys,scopes,authService,authCallback,authStart,mapGoogleTask,sharedPages,sharedSelect,sharedTasks,sharedAction,sharedCalendar,verifySharedGrant,gymPairSign};';
const testPath='/tmp/myday-shared-test-'+process.pid+'.mjs';
fs.writeFileSync(testPath,src);
const w=await import('file://'+testPath+'?test='+Date.now());
class KV {
 constructor(){this.m=new Map();this.writes=[];}
 async get(k,t){const v=this.m.get(k)||null;return t==='json'&&v?JSON.parse(v):v;}
 async put(k,v){this.m.set(k,v);this.writes.push(k);}
 async delete(k){this.m.delete(k);this.writes.push(k);}
}
const kv=new KV();const env={TOKENS:kv,APP_KEY:'fixture-app-key',GOOGLE_CLIENT_ID:'fixture-client',GOOGLE_CLIENT_SECRET:'fixture-secret'};
const id={sub:'shared-sub',email:'anaymatti@gmail.com'};
kv.m.set('refreshToken','health-fixture');kv.m.set('refreshToken:calendar','personal-fixture');kv.m.set('accessToken:shared-tasks','shared-fixture');
const scopes='openid email https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.readonly';
let calls=[];let handler;
globalThis.fetch=async(u,opts={})=>{calls.push({u:String(u),opts});return handler(String(u),opts);};
function response(x,status=200){return new Response(JSON.stringify(x),{status});}
assert.equal(w.keys('shared-tasks').refresh,'refreshToken:shared-tasks');
assert.equal(w.keys('calendar').refresh,'refreshToken:calendar');
assert.equal(w.keys('health').refresh,'refreshToken');
assert.throws(()=>w.authService('arbitrary'),/Unknown/);
let task=w.mapGoogleTask({id:'task:1',title:'Example',status:'needsAction',due:'2026-11-22T00:00:00Z'},'list:1');
assert.equal(task.due,'2026-11-22');assert.equal(task.source,'shared-google');assert.deepEqual(task.types,[]);
assert.equal(w.mapGoogleTask({id:'x',status:'completed',completed:'2026-11-22T23:30:00Z'},'l').done,'2026-11-23');
handler=()=>response({sub:'wrong',email:'other@gmail.com',email_verified:true});
await assert.rejects(w.verifySharedGrant(env,{scope:scopes,access_token:'fixture'}),/Choose the shared/);
assert.equal(kv.writes.length,0);
handler=()=>response({...id,email_verified:true});
assert.deepEqual(await w.verifySharedGrant(env,{scope:scopes,access_token:'fixture'}),id);
kv.m.set('state:fixture-state','shared-tasks');
handler=(u)=>u.includes('oauth2.googleapis.com/token')?response({scope:scopes,access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600}):response({...id,email_verified:true});
const callback=await w.authCallback(env,new URL('https://fixture.invalid/auth/callback?state=fixture-state&code=fixture-code'));
assert.equal(callback.status,200);assert.equal(kv.m.get('refreshToken'),'health-fixture');assert.equal(kv.m.get('refreshToken:calendar'),'personal-fixture');
assert(kv.writes.every(k=>k.startsWith('state:')||k.includes('shared-tasks')||k=== 'sharedTasks:identity'));
assert.equal(kv.m.get('refreshToken:shared-tasks'),'fixture-refresh');
kv.m.set('sharedTasks:config',JSON.stringify({listId:'chosen',listTitle:'Couple',accountSub:'shared-sub'}));
handler=(u)=>{assert(u.includes('lists/chosen/tasks'));const q=new URL(u).searchParams;assert.equal(q.get('showCompleted'),'true');assert.equal(q.get('showHidden'),'true');return q.get('pageToken')?response({items:[{id:'done',status:'completed',completed:'2026-11-22T12:00:00Z'}]}):response({items:[{id:'open',status:'needsAction'},{id:'deleted',deleted:true}],nextPageToken:'second'});};
const tasks=await w.sharedTasks(env,new URL('https://fixture.invalid/api/shared-tasks?date=2026-11-22'));
assert.equal(tasks.open.length,1);assert.equal(tasks.doneOn.length,1);
await assert.rejects(w.sharedTasks(env,new URL('https://fixture.invalid/api/shared-tasks?date=2026-02-31')),/Bad date/);
let mutation=false;
handler=(u,opts)=>{if(opts.method){mutation=true;return response({id:'one',title:'Example',status:'completed',etag:'new'});}return response({id:'one',title:'Example',status:'needsAction',etag:'fresh'});};
await assert.rejects(w.sharedAction(env,'done',{upstreamId:'one',listId:'chosen',etag:'stale'}),/changed on another/);assert.equal(mutation,false);
const done=await w.sharedAction(env,'done',{upstreamId:'one',listId:'chosen',etag:'fresh'});assert.equal(done.task.status,'Done');
const patch=calls.findLast(x=>x.opts.method==='PATCH');assert.deepEqual(JSON.parse(patch.opts.body),{status:'completed'});assert.equal(patch.opts.headers['If-Match'],'fresh');
mutation=false;await assert.rejects(w.sharedAction(env,'done',{upstreamId:'one',listId:'another',etag:'fresh'}),/Refresh/);assert.equal(mutation,false);
let addPayload;
handler=(u,opts)=>{addPayload=JSON.parse(opts.body);return response({id:'new',...addPayload,status:'needsAction'});};
await w.sharedAction(env,'add',{title:'Groceries',due:'2026-11-22',notes:'private CRM fixture',person:'private-person',type:'Work'});
assert.deepEqual(addPayload,{title:'Groceries',due:'2026-11-22T00:00:00.000Z'});
handler=(u)=>u.includes('calendars/primary')?response({id:'anaymatti@gmail.com',summary:'Together'}):response({items:[{id:'event',summary:'Dinner',start:{dateTime:'2026-11-22T18:00:00+01:00'},end:{dateTime:'2026-11-22T19:00:00+01:00'}}]});
const calendar=await w.sharedCalendar(env,new URL('https://fixture.invalid/api/shared-calendar?from=2026-11-22T00:00:00Z&to=2026-11-23T00:00:00Z'));
assert.equal(calendar.events[0].readOnly,true);assert.equal(calendar.calendarList[0].accessRole,'reader');assert.equal(calendar.events[0].calendarId,'anaymatti@gmail.com');
assert.equal(kv.m.get('refreshToken'),'health-fixture');assert.equal(kv.m.get('refreshToken:calendar'),'personal-fixture');
console.log('PASS 28+ assertions: isolated tokens; unknown-service rejection; verified identity before save; wrong-account non-write; civil due and Madrid completion day; pagination+mobile-completion flags; stale mutation refusal; source/list isolation; no CRM notes copied; read-only shared calendar. Fixture-only, no network.');
