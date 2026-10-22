import test from 'node:test';
import assert from 'node:assert/strict';
import { processState, commandObservation } from '../src/game-state.ts';
const now = new Date().toISOString();
const snapshot = { accounts: [], automation: { productionEnabled: true, lanes: { review: { status: 'idle', observedAt: now }, metadata: { status: 'storage_wait', observedAt: now } } } };
test('메타데이터 오류도 검수 시설·트레이·지구에 같은 경고로 남는다', () => {
  const state = processState('review', snapshot, false);
  assert.equal(state.tone, 'warning'); assert.equal(state.active, false);
  assert.match(state.label, /메타데이터.*저장 공간/);
  assert.equal(processState('review', snapshot, true).tone, 'unknown');
});
test('지시 접수·반영·후속 확인 성공을 구분하고 실패를 남긴다', () => {
  const command = {status:'queued', created_at:'2026-10-22T01:00:00Z', updated_at:'2026-10-22T01:01:00Z'};
  const account = {lastVerifiedAt:'2026-10-22T01:00:30Z'};
  assert.equal(commandObservation(account, command).pending, true);
  const applied = {...command,status:'applied'};
  assert.equal(commandObservation(account, applied).label, '지시 반영 · 확인 대기');
  assert.equal(commandObservation({...account,lastVerifiedAt:'bad-date'}, applied).label, '지시 반영 · 확인 대기');
  assert.equal(commandObservation({...account,lastVerifiedAt:'2026-10-22T01:02:00Z'}, applied).label, '지시 이후 계정 확인됨');
  assert.equal(commandObservation(account,{...command,status:'failed',message:'연결 실패'}).detail,'연결 실패');
});

test('검수 대기 중 메타데이터가 실제 실행되면 작업 중 표시와 움직임이 일치한다', () => {
  const s = structuredClone(snapshot); s.automation.lanes.metadata.status = 'working';
  const current = processState('review', s, false);
  assert.equal(current.active, true); assert.equal(current.tone, 'active');
  assert.equal(current.label, '메타데이터 · 작업 중');
});
