import { laneCondition, uploadCondition, severity, n } from './data.ts';
import type { Account, Command, Snapshot } from './types';
import { flowTotals } from './operations-state.ts';
export type ProcessKey = 'generation' | 'review' | 'stock' | 'submission' | 'inspection' | 'archive' | 'revenue';
/** One observation drives the building, district badge and action tray. */
export function processState(key: ProcessKey, snapshot: Snapshot, stale: boolean) {
  if (stale) return { label: '연결 확인 필요', tone: 'unknown', active: false };
  if (key === 'generation' || key === 'review') {
    const lane = laneCondition(snapshot.automation.lanes[key], snapshot.automation.productionEnabled);
    const metadata = laneCondition(snapshot.automation.lanes.metadata, snapshot.automation.productionEnabled);
    const current = key === 'review' && (metadata.issue || (!lane.issue && lane.tone !== 'active' && metadata.tone === 'active')) ? { ...metadata, label: '메타데이터 · ' + metadata.label } : lane;
    return { ...current, active: current.tone === 'active' };
  }
  if (key === 'stock') return { label: `제출 가능 ${n(snapshot.accounts.reduce((v, a) => v + a.ready, 0))}개`, tone: 'normal', active: false };
  if (key === 'inspection') return { label: `심사 중 ${n(flowTotals(snapshot).inspection)}개`, tone: 'normal', active: false };
  if (key === 'archive') return { label: `승인·공개 ${n(flowTotals(snapshot).archived)}개`, tone: 'normal', active: false };
  if (key === 'revenue') return { label: '계정별 월 수익 장부', tone: 'normal', active: false };
  const health = uploadCondition(snapshot);
  const issues = snapshot.accounts.filter(a => ['warning', 'danger'].includes(severity(a))).length;
  return { label: health.issue ? health.label : issues ? `${issues}개 계정 확인` : health.label,
    tone: health.issue || issues ? 'warning' : health.active ? 'active' : 'normal', active: health.active };
}
/** Applying a command is not evidence that the contributor account was checked. */
export function commandObservation(account: Account, command?: Command) {
  if (!command) return null;
  if (command.status === 'queued') return { label: '지시 대기', detail: '작업기가 지시를 받기를 기다립니다.', tone: 'unknown', pending: true };
  if (command.status === 'failed') return { label: '지시 실패', detail: command.message || '상세에서 원인을 확인한 뒤 재시도하세요.', tone: 'danger', pending: false };
  if (command.status === 'applied') {
    const verified = Date.parse(account.lastVerifiedAt || '');
    const issued = Date.parse(command.updated_at || command.created_at);
    if (!Number.isFinite(verified) || !Number.isFinite(issued) || verified <= issued)
      return { label: '지시 반영 · 확인 대기', detail: '지시는 반영됐지만 이후 계정 확인 성공은 아직 관측되지 않았습니다.', tone: 'unknown', pending: false };
    return { label: '지시 이후 계정 확인됨', detail: '실제 계정 확인 기록이 도착했습니다.', tone: 'normal', pending: false };
  }
  return null;
}
