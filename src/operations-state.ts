import { date, isIssue, nextSubmission, status, uploadCondition } from './data.ts';
import type { Account, Asset, Snapshot } from './types';

export type DispatchMode = 'unknown' | 'fault' | 'working' | 'paused' | 'scheduled' | 'waiting' | 'ready' | 'empty';
export interface AccountFlow {
  accountId: string;
  ready: number;
  target: number;
  fill: number;
  inspection: number;
  approved: number;
  published: number;
  archived: number;
  rejected: number;
  dispatchMode: DispatchMode;
  dispatchLabel: string;
  dispatchAt: string | null;
  reviewAt: string | null;
  reviewLabel: string;
  unknown: boolean;
}

/** Count current unique works, never historical upload attempts in account.counts. */
export function currentAssets(snapshot: Pick<Snapshot, 'assets'>, accountId?: string): Asset[] {
  const unique = new Map<string, Asset>();
  for (const asset of snapshot.assets || []) {
    const previous = unique.get(asset.id);
    if (!previous || asset.updatedAt >= previous.updatedAt) unique.set(asset.id, asset);
  }
  return [...unique.values()].filter(asset => !accountId || asset.accountId === accountId);
}

/** An expected date never causes an automatic status transition. */
export function expectedDateLabel(value: string | null | undefined, now = Date.now()): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '예정 미확인';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const deadline = Date.parse(dateOnly ? `${value}T23:59:59+09:00` : value);
  return deadline < now ? '예정 경과 · 확인 필요' : `${date(value, !dateOnly)} 예상`;
}

export function accountFlow(account: Account, snapshot: Snapshot, stale: boolean, now = Date.now()): AccountFlow {
  const assets = currentAssets(snapshot, account.id);
  const count = (states: string[]) => assets.filter(asset => states.includes(asset.state)).length;
  const inspection = count(['submitted']);
  const approved = count(['approved']);
  const published = count(['published']);
  const dispatchAt = nextSubmission(snapshot, account.id);
  const reviewAt = account.reviewOn || [...(snapshot.calendar || [])]
    .filter(item => item.accountId === account.id && !item.checked_on)
    .sort((a, b) => b.uploaded_on.localeCompare(a.uploaded_on))[0]?.check_on || null;
  const upload = uploadCondition(snapshot);
  let dispatchMode: DispatchMode = 'waiting';
  let dispatchLabel = status(account);
  if (stale) { dispatchMode = 'unknown'; dispatchLabel = '관측 끊김'; }
  else if (isIssue(account)) { dispatchMode = 'fault'; }
  else if (account.running && upload.active) { dispatchMode = 'working'; dispatchLabel = '실행 감지 · 단계 미확인'; }
  else if (!snapshot.automation.enabled) { dispatchMode = 'paused'; dispatchLabel = '제출 정지'; }
  else if (dispatchAt && Date.parse(dispatchAt) > now) { dispatchMode = 'scheduled'; dispatchLabel = `${date(dispatchAt)} 제출 예정`; }
  else if (['review_pending', 'capacity_full', 'review_scheduled'].includes(account.status)) { dispatchMode = 'waiting'; }
  else if (account.ready <= 0) { dispatchMode = 'empty'; dispatchLabel = '재고 대기'; }
  else if (upload.issue) { dispatchMode = 'unknown'; dispatchLabel = upload.label; }
  else { dispatchMode = 'ready'; dispatchLabel = '제출 순회 대기'; }
  return {
    accountId: account.id, ready: Math.max(0, account.ready), target: Math.max(0, account.target),
    fill: account.ready > 0 ? Math.min(1, account.ready / Math.max(1, account.target)) : 0,
    inspection, approved, published, archived: approved + published,
    rejected: count(['rejected', 'revision_requested']), dispatchMode, dispatchLabel, dispatchAt, reviewAt,
    reviewLabel: inspection ? expectedDateLabel(reviewAt, now) : '심사 중인 제작물 없음', unknown: stale,
  };
}

export function flowTotals(snapshot: Snapshot) {
  const assets = currentAssets(snapshot);
  return {
    ready: snapshot.accounts.reduce((sum, account) => sum + Math.max(0, account.ready), 0),
    inspection: assets.filter(asset => asset.state === 'submitted').length,
    approved: assets.filter(asset => asset.state === 'approved').length,
    published: assets.filter(asset => asset.state === 'published').length,
    archived: assets.filter(asset => ['approved', 'published'].includes(asset.state)).length,
  };
}
