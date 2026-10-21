// Isolated performance observation. Never uses operational data or services.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { adapter } from '../server/db.mjs';
import { api, passwordHash } from '../worker/index.mjs';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../worker/schema.sql',import.meta.url),'utf8'));
const db = adapter(sqlite);
let queryCount = 0;
const prepare = db.prepare.bind(db);
db.prepare = (sql) => {
  const q = prepare(sql);
  for (const name of ['run','all','first']) {
    const fn = q[name].bind(q); q[name] = (...args) => { queryCount++; return fn(...args); };
  }
  return q;
};
const env={DB:db,BRIDGE_TOKEN:'benchmark-only',PASSWORD_SALT:'benchmark-salt',PASSWORD_HASH:await passwordHash('benchmark-password','benchmark-salt')};
const invoke=(path,{method='GET',body,bridge=false,cookie}={})=>api(new Request('https://benchmark.invalid/api'+path,{
  method,headers:{Origin:'https://benchmark.invalid',...(bridge?{Authorization:'Bearer benchmark-only'}:{}),...(cookie?{Cookie:cookie}:{})},
  body:body===undefined?undefined:JSON.stringify(body),
}),env);
const login=await invoke('/login',{method:'POST',body:{password:'benchmark-password'}});
const cookie=login.headers.get('set-cookie');assert.equal(login.status,200);
const snapshot={version:1,observedAt:new Date().toISOString(),accounts:Array.from({length:13},(_,i)=>({id:String(i+1),name:`작업동 ${i+1}`,ready:200})),assets:[{id:'one'}],calendar:[],recent:[],automation:{}};
await invoke('/bridge/snapshot',{method:'POST',body:snapshot,bridge:true});
queryCount=0;await (await invoke('/world',{cookie})).json();const smallQueries=queryCount;
snapshot.assets=Array.from({length:9000},(_,i)=>({id:String(i),accountId:String(i%13+1),title:'대표 제작 그림 '.repeat(32),eligible:i%2===0,state:'ready',phase:'ready',keywords:['봄','꽃','인물'],updatedAt:snapshot.observedAt}));
const posted=await invoke('/bridge/snapshot',{method:'POST',body:snapshot,bridge:true});assert.equal(posted.status,200);
for(let i=0;i<350;i++)sqlite.prepare('INSERT INTO schedules VALUES(?,?,?,?,?,?,?)').run('history-'+i,'1','완료한 일정','2020-01-01','memo','done','2020');
for(let i=0;i<310;i++)sqlite.prepare('INSERT INTO schedules VALUES(?,?,?,?,?,?,?)').run('active-'+i,'1','예정 일정','2030-01-01','memo','planned','2020');
queryCount=0;await (await invoke('/world',{cookie})).json();const largeQueries=queryCount;
assert.equal(largeQueries,smallQueries,'asset growth must not create per-asset queries');
for(let i=0;i<5;i++)await (await invoke('/world',{cookie})).json();
const times=[];
for(let offset=0;offset<100;offset+=4)await Promise.all(Array.from({length:4},async()=>{
  const start=performance.now();const response=await invoke('/world',{cookie});assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.snapshot.assets.length,9000);times.push(performance.now()-start);
}));
times.sort((a,b)=>a-b);
const result={date:new Date().toISOString(),node:process.version,environment:'Node SQLite :memory:, API function + JSON serialization/parse, no HTTP/network or Cloudflare',accounts:13,assets:9000,activeSchedules:310,historySchedules:350,requests:100,concurrency:4,experimentalTargetMs:150,p50Ms:times[49],p95Ms:times[94],maxMs:times.at(-1),queryCountSmall:smallQueries,queryCountLarge:largeQueries,nPlusOne:0,
  explainActive:sqlite.prepare("EXPLAIN QUERY PLAN SELECT s.*,c.message FROM schedules s LEFT JOIN commands c ON c.id='schedule-'||s.id WHERE s.status IN ('planned','requested','failed') ORDER BY s.due_at,s.id").all(),
  explainCommandHistory:sqlite.prepare("EXPLAIN QUERY PLAN SELECT * FROM commands WHERE status='queued' UNION ALL SELECT * FROM (SELECT * FROM commands WHERE status<>'queued' ORDER BY created_at DESC,id DESC LIMIT 40) ORDER BY created_at DESC,id DESC").all(),
  explainDuplicate:sqlite.prepare("EXPLAIN QUERY PLAN SELECT * FROM commands WHERE action='recheck' AND payload='{}' AND status='queued' LIMIT 1").all()};
mkdirSync('artifacts/repair-backend',{recursive:true});writeFileSync('artifacts/repair-backend/performance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
console.log(result.p95Ms < result.experimentalTargetMs ? "EXPERIMENTAL_TARGET_MET" : "EXPERIMENTAL_TARGET_NOT_MET (observation only; no project latency budget agreed)");sqlite.close();
