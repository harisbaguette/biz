import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { api } from '../worker/index.mjs';
import { database } from './db.mjs';

function setup(local = true) {
  const env = { DB: database(), LOCAL_MODE: local };
  env.DB.prepare("INSERT INTO snapshots VALUES('miricanvas',?,?)").bind(JSON.stringify({accounts:Array.from({length:13},(_,i)=>({id:'account-'+(i+1)}))}),new Date().toISOString()).run();
  const call = (method='GET', value, query='?year=2026', origin='https://biz.example') => api(new Request('https://biz.example/api/revenue'+query, {
    method, headers:{Origin:origin}, body:value ? JSON.stringify(value) : undefined,
  }),env);
  return {env,call};
}
const entry = (extras={}) => ({requestId:crypto.randomUUID(),accountId:'account-1',year:2026,month:1,amountKrw:1200,memo:'확정',revision:0,...extras});

test('수익은 로그인·같은 출처를 요구하고 연도·계정·금액을 엄격히 검증한다',async()=>{
  const unauth=setup(false);
  assert.equal((await unauth.call()).status,401);
  assert.equal((await unauth.call('POST',entry())).status,401);
  const {call,env}=setup();
  assert.equal((await call('POST',entry(),'', 'https://foreign.example')).status,403);
  for(const query of ['','?year=2026.5','?year=1999','?year=2101','?year=2026x']) assert.equal((await call('GET',undefined,query)).status,400);
  for(const extras of [{month:0},{month:13},{month:1.2},{year:2026.1},{amountKrw:-1},{amountKrw:1.5},{amountKrw:1e12+1},{amountKrw:Number.MAX_SAFE_INTEGER+1},{amountKrw:'1000'},{amountKrw:false},{memo:'x'.repeat(1001)},{revision:-1},{revision:'0'},{requestId:'x'},{extra:'unknown'}]) {
    const response=await call('POST',entry(extras)); assert.equal(response.status,400,JSON.stringify(extras));
    const error=await response.json(); assert.ok(error.code);assert.ok(error.message);assert.equal(error.details,null);
  }
  assert.equal((await call('POST',entry({accountId:'unknown-account'}))).status,404);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM revenue_months').first()).n,0);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM commands').first()).n,0);
});

test('13개 계정의 12개월 기록과 미기록·확정 0원·연도를 구분한다',async()=>{
  const {call}=setup();
  assert.deepEqual(await(await call()).json(),{year:2026,currency:'KRW',source:'manual',items:[]});
  for(let account=1;account<=13;account++) for(let month=1;month<=12;month++){
    const response=await call('POST',entry({accountId:'account-'+account,month,amountKrw:month===1?0:account*month}));
    assert.equal(response.status,200);
  }
  const ledger=await(await call()).json(); assert.equal(ledger.items.length,156);
  assert.equal(ledger.items.filter(row=>row.amountKrw===0).length,13);
  assert.equal((await(await call('GET',undefined,'?year=2025')).json()).items.length,0);
  const cleared=await(await call('POST',entry({amountKrw:null,revision:1}))).json();
  assert.equal(cleared.amountKrw,null);assert.equal(cleared.revision,2);
  const loaded=(await(await call()).json()).items.find(row=>row.accountId==='account-1'&&row.month===1);
  assert.equal(loaded.amountKrw,null);assert.equal(loaded.revision,2);
});

test('같은 저장 재시도는 한 번만 쓰며 다른 본문과 동시 편집은 충돌한다',async()=>{
  const {call,env}=setup(),v=entry();
  const responses=await Promise.all(Array.from({length:8},()=>call('POST',v)));
  assert.ok(responses.every(r=>r.status===200));
  const saved=await responses[0].json(); assert.equal(saved.revision,1);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM revenue_months').first()).n,1);
  assert.equal((await call('POST',{...v,amountKrw:2})).status,409);
  const competing=await Promise.all([2000,3000].map(amountKrw=>call('POST',entry({amountKrw,revision:1}))));
  assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
  const final=(await(await call()).json()).items[0];assert.equal(final.revision,2);
  assert.deepEqual(await(await call('POST',v)).json(),saved);
  assert.equal((await(await call()).json()).items[0].revision,2);
  assert.equal((await(await call()).json()).items[0].amountKrw,final.amountKrw);
});

test('수익 마이그레이션을 올리고 되돌려 기존 운영 테이블을 보존한다',()=>{
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec("CREATE TABLE snapshots(id TEXT);INSERT INTO snapshots VALUES('keep');");
  const up=readFileSync(new URL('../worker/migrations/20261023-revenue-up.sql',import.meta.url),'utf8');
  const down=readFileSync(new URL('../worker/migrations/20261023-revenue-down.sql',import.meta.url),'utf8');
  sqlite.exec(up);sqlite.exec(up);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('revenue_months','revenue_requests')").get().n,2);
  const plan=sqlite.prepare('EXPLAIN QUERY PLAN SELECT * FROM revenue_months WHERE year=2026 ORDER BY account_id,month').all();
  assert.ok(plan.some(row=>row.detail.includes('INDEX')));
  sqlite.exec(down);assert.equal(sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('revenue_months','revenue_requests')").get().n,0);
  assert.equal(sqlite.prepare('SELECT id FROM snapshots').get().id,'keep');
  sqlite.exec(up);sqlite.close();
});

test('저장소 장애는 재시도할 수 있는 구조화 오류를 반환한다',async()=>{
  const {call,env}=setup();
  env.DB.prepare('DROP TABLE revenue_months').run();
  const response=await call();assert.equal(response.status,500);
  const error=await response.json();assert.equal(error.code,'REVENUE_UNAVAILABLE');assert.equal(error.details,null);
  assert.ok(response.headers.get('X-Request-Id'));
});

test('저장 중 장애는 원장과 요청을 함께 되돌리고 같은 요청 재시도는 성공한다',async()=>{
  const {call,env}=setup(),v=entry();
  await env.DB.prepare("CREATE TRIGGER reject_revenue BEFORE INSERT ON revenue_months BEGIN SELECT RAISE(ABORT,'isolated failure'); END").run();
  assert.equal((await call('POST',v)).status,500);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM revenue_months').first()).n,0);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM revenue_requests').first()).n,0);
  await env.DB.prepare('DROP TRIGGER reject_revenue').run();
  assert.equal((await call('POST',v)).status,200);
  assert.equal((await(await call()).json()).items[0].revision,1);
});
