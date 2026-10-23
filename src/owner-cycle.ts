import { accountFlow } from './operations-state.ts';
import { date, isIssue, recovery, status } from './data.ts';
import type { Account, Schedule, Snapshot } from './types';

export type CycleTone = 'reviewing' | 'ready' | 'blocked' | 'paused' | 'empty' | 'unknown';
export type NextKind = 'review-check' | 'retry' | 'request' | 'automatic' | 'none' | 'paused' | 'unknown';
export interface AccountCycle {
  reviewCount: number;
  reviewLabel: string;
  submissionLabel: string;
  /** Context that matters in the overview: blocker, plan, or review estimate. */
  overviewLabel: string;
  /** A recorded plan is separate from current review, blockers and next checks. */
  overviewPlanLabel: string | null;
  nextLabel: string;
  nextAt: string | null;
  nextKind: NextKind;
  tone: CycleTone;
  blocked: boolean;
  blocker: string | null;
  expectedReviewLabel: string | null;
  detail: string;
  action: 'account' | 'review' | 'schedule' | 'automation';
  actionLabel: string;
  ready: number;
  archived: number;
  stockFill: number;
  stale: boolean;
  reviewMismatch: boolean;
  submissionPlanOn: string | null;
  /** There is no submitted execution reservation in the current connector contract. */
  submissionReservation: null;
}

const valid = (v: string | null | undefined): v is string => !!v && Number.isFinite(Date.parse(v));
const knownFailures: Record<string, { label: string; remedy: string }> = {
  '현재 계정의 새 CSV 다운로드를 확인하지 못했습니다.': {
    label: '제출 결과 확인 실패', remedy: '운영 맥의 브라우저에서 이번 계정의 제출 결과 파일이 내려왔는지 확인한 뒤 다시 확인을 요청하세요.',
  },
  '한국어 표시로 전환할 언어 항목을 확인하지 못했습니다.': {
    label: '브라우저 언어 전환 실패', remedy: '운영 맥의 미리캔버스 화면을 한국어로 바꾼 뒤 다시 확인을 요청하세요.',
  },
  '현재 로그인 이메일이 대상 계정과 다릅니다.': {
    label: '다른 계정으로 로그인됨', remedy: '운영 맥의 해당 브라우저에서 이 번호에 맞는 기여자 계정으로 로그인한 뒤 다시 확인을 요청하세요.',
  },
};
const koreanDay = (value: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
/** Date-only plans retain date precision; never invent midnight as an appointment. */
export function cycleTime(value: string, now = Date.now()): string {
  if (!valid(value)) return '시각 미확인';
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const timestamp = Date.parse(dayOnly ? value + 'T12:00:00+09:00' : value);
  const day = koreanDay(timestamp), today = koreanDay(now), tomorrow = koreanDay(now + 86400000);
  const clock = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(timestamp);
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).formatToParts(timestamp);
  const md = parts.find(p => p.type === 'month')!.value + '/' + parts.find(p => p.type === 'day')!.value;
  if (dayOnly) return day === today ? '오늘' : day === tomorrow ? '내일' : md;
  return day === today ? clock : `${day === tomorrow ? '내일' : md} ${clock}`;
}

/** Current review and the next action are independent axes, not one warehouse status. */
export function accountCycle(account: Account, snapshot: Snapshot, stale: boolean, options: { schedules?: Schedule[]; now?: number } = {}): AccountCycle {
  const now = options.now ?? Date.now();
  const flow = accountFlow(account, snapshot, stale, now);
  // Browser pending is a different observation from tracked artwork state. A mismatch
  // must stay visible; picking the larger or newer-looking number would invent certainty.
  const capacity = account.capacity;
  const reviewMismatch = !!capacity && Number.isFinite(capacity.pending) && valid(capacity.observed_at) && capacity.pending !== flow.inspection;
  const blocked = isIssue(account) || reviewMismatch;
  const failure = knownFailures[account.message?.trim()];
  const issueState = !account.bound ? '계정 연결 확인' : status(account).replace(' · 실행 감지', '');
  const blocker = reviewMismatch ? '심사 수 대조 필요' : isIssue(account)
    ? failure?.label || account.message?.trim() || issueState : null;
  const planRow = [...snapshot.calendar].filter(c => c.accountId === account.id)
    .sort((a, b) => b.uploaded_on.localeCompare(a.uploaded_on) || b.id.localeCompare(a.id))[0];
  // A previous batch's plan cannot survive a newer batch with no next-upload plan.
  const submissionPlanOn = valid(planRow?.next_upload_on) ? planRow.next_upload_on : null;
  const planDeadline = submissionPlanOn ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(submissionPlanOn) ? submissionPlanOn + 'T23:59:59+09:00' : submissionPlanOn) : NaN;
  const planLabel = submissionPlanOn ? `제출 계획 ${cycleTime(submissionPlanOn, now)}${planDeadline < now ? ' 경과' : ''}` : null;
  const reviewCount = flow.inspection;
  const reviewLabel = stale ? '상태 미확인' : reviewMismatch ? '심사 수 대조' : reviewCount > 0 ? `심사 ${reviewCount}` : '심사 비었음';
  const expectedReviewLabel = reviewCount > 0 && !stale && !reviewMismatch && valid(flow.reviewAt)
    ? `결과 ${flow.reviewLabel}` : null;
  let tone: CycleTone = blocked ? 'blocked' : reviewCount > 0 ? 'reviewing' : flow.ready > 0 ? 'ready' : 'empty';
  const submissionCondition = reviewCount > 0 ? '제출은 심사 후' : flow.approved > 0 ? '제출은 공개 후' : flow.ready > 0 ? '자동 제출 대기' : '제작물 대기';
  let submissionLabel = planLabel || submissionCondition;
  let nextAt: string | null = valid(account.nextCheckAt) ? account.nextCheckAt : null;
  let nextKind: NextKind = nextAt ? blocked ? 'retry' : 'review-check' : 'none';
  let nextLabel = nextAt ? `${blocked ? '재시도' : '확인'} ${cycleTime(nextAt, now)}${Date.parse(nextAt) < now ? ' 경과' : ''}` : '다음 시각 미정';
  let action: AccountCycle['action'] = blocked ? 'account' : reviewCount > 0 ? 'review' : 'schedule';
  let actionLabel = blocked ? '막힌 원인 보기' : reviewCount > 0 ? '심사 중인 그림' : '다음 일정 확인';
  const request = (options.schedules || []).filter(s => s.account_id === account.id && s.kind === 'recheck' && s.status === 'planned' && valid(s.due_at))
    .sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
  if (request && (!snapshot.automation.enabled || !nextAt || Date.parse(request.due_at) < Date.parse(nextAt))) {
    nextAt = request.due_at; nextKind = 'request';
    nextLabel = `요청 ${cycleTime(nextAt, now)}${Date.parse(nextAt) < now ? ' 경과' : ''}`;
  }
  if (blocked) submissionLabel = planLabel ? `${planLabel} · 막힘` : '제출 막힘';
  else if (account.running) submissionLabel = '실행 확인 중';
  else if (!snapshot.automation.enabled) {
    tone = 'paused'; submissionLabel = '자동 제출 정지';
    if (nextKind !== 'request') { nextAt = null; nextKind = 'paused'; nextLabel = '재개 필요'; }
    action = 'automation'; actionLabel = '자동화 설정';
  } else if (!nextAt && reviewCount === 0 && flow.approved === 0 && flow.ready > 0) {
    nextKind = 'automatic'; nextLabel = '순회 시각 미정';
  }
  if (!snapshot.automation.enabled && nextKind !== 'request') {
    nextAt = null; nextKind = 'paused'; nextLabel = '재개 필요';
  }
  let detail = blocked ? (reviewMismatch ? `추적 중인 심사 ${reviewCount}개와 플랫폼에서 관측한 ${capacity!.pending}개가 다릅니다. 계정 확인이 필요합니다.` : failure?.remedy || recovery(account))
    : reviewCount > 0 ? '현재 제출분의 심사를 확인한 뒤 다음 제출을 판단합니다.'
    : flow.approved > 0 ? '승인된 제작물의 공개 상태를 확인한 뒤 다음 제출을 판단합니다.'
    : flow.ready > 0 ? '심사함은 비어 있습니다. 다음 자동 순회에서 계정·제출 한도를 확인한 뒤 제출합니다. 실행 시각은 확정되지 않았습니다.'
    : '심사함이 비어 있습니다. 제출할 그림이 준비되기를 기다립니다.';
  if (submissionPlanOn) detail += ` ${date(submissionPlanOn, !/^\d{4}-\d{2}-\d{2}$/.test(submissionPlanOn))}는 기록된 제출 계획이며 실행 예약이 아닙니다.`;
  if (nextKind === 'request') detail += ' 표시된 요청 시각에는 재확인 요청을 대기열에 등록합니다. 실제 계정 확인은 기존 간격과 순서를 따릅니다.';
  else if (nextAt) detail += ` ${date(nextAt, true)}는 ${blocked ? '실패 후 재시도' : '계정 확인'} 예정이며 제출 시각이 아닙니다.`;
  if (!snapshot.automation.enabled) detail += ' 자동 제출이 정지되어 있어 예정된 계정 순회도 진행하지 않습니다.';
  if (stale) {
    tone = 'unknown'; submissionLabel = '새 관측 대기'; nextAt = null; nextKind = 'unknown'; nextLabel = '일정 미확인';
    action = 'automation'; actionLabel = '연결 확인'; detail = '마지막 관측을 유지합니다. 현재 심사와 다음 일정은 연결이 복구되면 확인할 수 있습니다.';
  }
  const shortBlocker = blocker === '제출 결과 확인 실패' ? '결과 확인 실패'
    : blocker === '브라우저 언어 전환 실패' ? '언어 전환 실패'
    : blocker === '다른 계정으로 로그인됨' ? '로그인 계정 다름'
    : blocker === '심사 수 대조 필요' ? '심사 수 확인 필요'
    : blocker && Array.from(blocker).length <= 12 ? blocker : issueState;
  const reviewDeadline = valid(flow.reviewAt) ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(flow.reviewAt) ? flow.reviewAt + 'T23:59:59+09:00' : flow.reviewAt) : NaN;
  const overviewLabel = stale ? submissionLabel : blocked ? shortBlocker
    : snapshot.automation.enabled && !account.running && reviewCount > 0 && valid(flow.reviewAt)
      ? reviewDeadline < now ? '결과 예상일 경과' : `결과 ${cycleTime(flow.reviewAt, now)} 예상`
      : account.running || !snapshot.automation.enabled ? submissionLabel : submissionCondition;
  const overviewPlanLabel = planLabel?.replace(/^제출 계획 /, '계획 ') ?? null;
  return { reviewCount, reviewLabel, submissionLabel, overviewLabel, overviewPlanLabel, nextLabel, nextAt, nextKind, tone, blocked, blocker,
    expectedReviewLabel, detail, action, actionLabel, ready: flow.ready, archived: flow.archived, stockFill: flow.fill,
    stale, reviewMismatch, submissionPlanOn, submissionReservation: null };
}
