import test from 'node:test';
import assert from 'node:assert/strict';
import { accountFlow, currentAssets, expectedDateLabel, flowTotals } from '../src/operations-state.ts';
import { isStale } from '../src/data.ts';
const now = Date.now();
const account = { id:'1', number:1, ready:0, target:50, bound:true, status:'ready_for_upload', running:false, counts:{submitted:900,approved:900}, reviewOn:'2020-01-01' };
const asset = (id,state,updatedAt='2026-10-22T01:00:00Z') => ({id,accountId:'1',state,updatedAt});
const snapshot = () => ({accounts:[account],assets:[],calendar:[],automation:{enabled:true,productionEnabled:true,runLockActive:false,lastPollAt:new Date().toISOString(),nextAt:new Date(now+3600000).toISOString()}});
test('빈 창고와 소량·만재는 재고로 결정하고 목표 초과는 적재율1로 고정한다',()=>{
 const s=snapshot();
 assert.equal(accountFlow(account,s,false).fill,0);
 assert.equal(accountFlow({...account,ready:5},s,false).fill,.1);
 assert.equal(accountFlow({...account,ready:150},s,false).fill,1);
 assert.equal(accountFlow({...account,ready:150},s,false).ready,150);
});
test('심사와 승인보관은 현재 고유 작품으로 세고 과거시도·중복·예정일로 증가시키지 않는다',()=>{
 const s=snapshot(); s.assets=[asset('a','submitted'),asset('a','published','2026-10-23T01:00:00Z'),asset('b','submitted'),asset('c','approved')];
 assert.equal(currentAssets(s).length,3);
 const flow=accountFlow(account,s,false);
 assert.equal(flow.inspection,1); assert.equal(flow.approved,1); assert.equal(flow.published,1); assert.equal(flow.archived,2);
 assert.equal(flow.reviewLabel,'예정 경과 · 확인 필요');
 assert.deepEqual(flowTotals(s),{ready:0,inspection:1,approved:1,published:1,archived:2});
});
test('운송 대기·고장·실행감지·관측끊김은 성공으로 바뀌지 않는다',()=>{
 const s=snapshot();
 assert.equal(accountFlow(account,s,false).dispatchMode,'empty');
 assert.equal(accountFlow({...account,status:'login_required'},s,false).dispatchMode,'fault');
 assert.equal(accountFlow({...account,status:'login_required'},s,true).dispatchMode,'unknown');
 s.automation.enabled=false;
 assert.equal(accountFlow({...account,ready:5},s,false).dispatchMode,'paused');
 s.automation.runLockActive=true;
 assert.equal(accountFlow({...account,running:true},s,false).dispatchMode,'working');
 assert.match(accountFlow({...account,running:true},s,false).dispatchLabel,/단계 미확인/);
});
test('심사예정일은 한국날짜 말일까지 예상이며 지나면 확인필요, 잘못된 수신은 stale',()=>{
 assert.match(expectedDateLabel('2026-10-23',Date.parse('2026-10-23T12:00:00+09:00')),/예상/);
 assert.equal(expectedDateLabel('2026-10-23',Date.parse('2026-10-24T00:00:00+09:00')),'예정 경과 · 확인 필요');
 assert.equal(expectedDateLabel('bad'),'예정 미확인');
 assert.equal(isStale({receivedAt:'bad'}),true);
});
