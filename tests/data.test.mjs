import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadCondition, normalizedSnapshot, severity, status, assetStatus, date, request, nextSubmission, outstandingFailures, laneCondition } from '../src/data.ts';
const snapshot = (overrides = {}) => ({
  accounts: [{ id: '1', status: 'ready_for_upload', running: true, bound: true }],
  calendar: [],
  automation: { enabled: true, runningAccount: 1, nextAt: null, lastRunAt: null, lastPollAt: null, statusObservedAt: null, runLockActive: false, ...overrides },
});
test('작업기 복구 안내는 공간 확보와 재시도 대기를 구별하고 미등록 상태를 경고한다', () => {
  const lane = {status:'storage_wait', observedAt:new Date().toISOString()};
  assert.match(laneCondition(lane,true).detail,/저장 공간을 확보/);
  assert.match(laneCondition({...lane,status:'retry_wait'},true).detail,/다음 순회에서 다시 시도/);
  assert.equal(laneCondition({...lane,status:'future_status'},true).issue,true);
  assert.equal(laneCondition({...lane,observedAt:'bad-date',status:'working'},true).issue,true);
  assert.equal(laneCondition(lane,false).issue,false);
});
test('미해결 지시·예약 실패를 세고 해결된 과거 실패와 예약의 중복 지시는 제외한다', () => {
  const command = (id, accountId, status, day) => ({ id, action:'recheck', payload:{accountId}, status, created_at:`2026-10-${day}T00:00:00Z` });
  const data = { commands:[command('old','1','failed',18), command('new','1','applied',19), command('open','2','failed',20), command('schedule-failed','3','failed',20), command('schedule-closed','4','failed',20)], schedules:[{id:'failed',status:'failed'}, {id:'closed',status:'cancelled'}] };
  const failures = outstandingFailures(data);
  assert.deepEqual(failures.commands.map(v=>v.id), ['open']);
  assert.deepEqual(failures.schedules.map(v=>v.id), ['failed']);
});
test('새 데이터가 수신되어도 멈춘 업로더를 작업 중으로 표시하지 않는다', () => {
  const s = snapshot({ statusObservedAt: '2020-01-01', lastRunAt: '2020-01-01', nextAt: '2020-01-01' });
  const health = uploadCondition(s);
  assert.equal(health.issue, true);
  assert.equal(health.active, false);
  const [a] = normalizedSnapshot(s).accounts;
  assert.equal(a.running, false);
  assert.equal(status(a), '진행 확인 필요');
  assert.equal(severity(a), 'warning');
  assert.equal(s.accounts[0].running, true);
});
test('정상 대기, 실제 실행 잠금, 사용자 일시정지를 구분한다', () => {
  assert.equal(uploadCondition(snapshot({ nextAt: new Date(Date.now() + 1800000).toISOString() })).issue, false);
  assert.equal(uploadCondition(snapshot({ runLockActive: true, statusObservedAt: new Date().toISOString() })).active, true);
  assert.equal(uploadCondition(snapshot({ statusObservedAt: new Date().toISOString() })).issue, false);
  assert.equal(uploadCondition(snapshot({ enabled: false, runLockActive: true, statusObservedAt: new Date().toISOString() })).label, '실행 감지 · 이후 정지');
  assert.equal(uploadCondition(snapshot({ enabled: false, runLockActive: false })).label, '일시정지');
});
test('사람이 처리할 상태와 알 수 없는 상태는 정상으로 숨기지 않는다', () => {
  for (const state of ['eligibility_required','search_review_required','metadata_required','new_unknown_state']) {
    assert.equal(severity({ status: state, bound: true, running: false }), 'warning');
  }
});
test('ready 원본 상태만으로 제출 가능이라고 표시하지 않는다', () => {
  assert.equal(assetStatus({ state: 'ready', eligible: false }), '제출 제외');
  assert.equal(assetStatus({ state: 'ready', eligible: true }), '제출 가능');
});
test('다음 제출일은 가장 최근 제출 묶음에서 읽고 잘못된 날짜를 렌더하지 않는다', () => {
  const s = snapshot();
  s.calendar = [
    { accountId: '1', uploaded_on: '2026-10-01', next_upload_on: '2026-10-14' },
    { accountId: '2', uploaded_on: '2026-10-18', next_upload_on: '2026-10-25' },
    { accountId: '1', uploaded_on: '2026-10-17', next_upload_on: '2026-10-24' },
  ];
  assert.equal(nextSubmission(s, '1'), '2026-10-24');
  assert.equal(nextSubmission(s, '3'), null);
  assert.equal(date('not-a-date'), '예정 없음');
});
test('응답 없는 요청은 제한 시간 뒤 종료되고 다음 요청을 처리한다', async t => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = (_path, options) => {
    attempts++;
    if (attempts > 1) return Promise.resolve(new Response(JSON.stringify({ ok: true })));
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = request('/world');
    t.mock.timers.tick(12001);
    await assert.rejects(pending, /응답이 늦어/);
    assert.deepEqual(await request('/world'), { ok: true });
  } finally { globalThis.fetch = originalFetch; t.mock.timers.reset(); }
});

test('잠금이 남아 있어도 장시간 관측이 없으면 진행 확인을 요청한다', () => {
  const s = snapshot({ runLockActive: true, lastRunAt: '2020-01-01', statusObservedAt: '2020-01-01' });
  const condition = uploadCondition(s);
  assert.equal(condition.issue, true);
  assert.equal(condition.active, false);
  assert.match(condition.detail, /작업이 계속되고 있을 수/);
  assert.equal(normalizedSnapshot(s).accounts[0].status, 'worker_unconfirmed');
});
