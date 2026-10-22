import type { Account, Asset, Lane, Snapshot, WorldData } from "./types";
export const accountLabel = (account: Pick<Account, "number">) => `${account.number}번 계정`;
export function outstandingFailures(data: Pick<WorldData, "commands" | "schedules">) {
  const latest = new Map<string, WorldData["commands"][number]>();
  for (const command of [...data.commands].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))) {
    // Scheduled failures are represented by the schedule until it is closed.
    if (command.id.startsWith("schedule-")) continue;
    const target = command.action + ":" + (command.action === "automation" ? command.payload.lane : command.payload.accountId);
    if (!latest.has(target)) latest.set(target, command);
  }
  return {
    commands: [...latest.values()].filter(v => v.status === "failed"),
    schedules: data.schedules.filter(v => v.status === "failed"),
  };
}
export const n = (value: number) =>
  new Intl.NumberFormat("ko-KR").format(value);
export const date = (value: string | null | undefined, time = false) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("ko-KR", {
        month: "numeric",
        day: "numeric",
        ...(time ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
        timeZone: "Asia/Seoul",
      }).format(new Date(value))
    : "예정 없음";
export const statuses: Record<string, string> = {
  login_required: "로그인 필요",
  blocked: "자동 확인 미완료",
  reconciliation_required: "결과 대조 필요",
  capacity_full: "심사 한도 대기",
  review_scheduled: "확인 예약",
  review_pending: "기존 제출분 심사 대기",
  ready_for_upload: "제출 준비",
  waiting_for_assets: "재고 대기",
  submitted: "제출 완료",
  published: "공개 중",
  waiting: "상태 대기",
  recheck_requested: "재확인 대기",
  approved: "승인",
  prepared: "제출 준비",
  uploaded: "업로드 · 제출 전",
  ready: "제출 가능",
  quarantined: "보류",
  generated: "검수 대기",
  reviewed: "메타데이터 대기",
  planned: "제작 예정",
  rejected: "반려",
  revision_requested: "수정 요청",
  cancelled: "취소",
  batched: "제출 묶음",
  private: "비공개",
  disabled: "사용 중지",
  eligibility_required: "제출 자격 확인",
  search_review_required: "검색 검토 필요",
  metadata_required: "메타데이터 확인",
  worker_unconfirmed: "진행 확인 필요",
};
export function severity(
  a: Account,
): "danger" | "warning" | "active" | "normal" {
  if (["blocked", "reconciliation_required"].includes(a.status))
    return "danger";
  if (["login_required", "eligibility_required", "search_review_required", "metadata_required", "worker_unconfirmed"].includes(a.status) || !a.bound || !statuses[a.status]) return "warning";
  if (a.running) return "active";
  return "normal";
}
export const isIssue = (a: Account) =>
  ["danger", "warning"].includes(severity(a));
export function status(a: Account) {
  if (a.running) {
    const observed = !a.bound ? "계정 연결 확인" : statuses[a.status] || "상태 확인";
    return isIssue(a) ? `${observed} · 실행 감지` : "실행 감지";
  }
  if (a.status === "review_scheduled" && Number.isFinite(Date.parse(a.nextCheckAt || "")) && Date.parse(a.nextCheckAt!) <= Date.now())
    return "순회 대기";
  return statuses[a.status] || "상태 확인";
}
export const isStale = (s: Snapshot | null) =>
  !s || !Number.isFinite(Date.parse(s.receivedAt)) || Date.now() - Date.parse(s.receivedAt) > 180000;
export function assetStatus(asset: Asset) {
  if (asset.state === "ready") return asset.eligible ? "제출 가능" : "제출 제외";
  return statuses[asset.state] || "상태 확인";
}
export function assetReason(asset: Asset) {
  if (asset.state !== "ready" || asset.eligible) return "";
  return !asset.owned
    ? "이 계정에 배정된 그림이 아닙니다. 원본 작업실에서 배정을 확인하세요."
    : "이미 배정됐거나 중복·대기 조건에 해당합니다. 제출 가능한 재고에 포함하지 않습니다.";
}
export function uploadCondition(s: Snapshot) {
  const a = s.automation, now = Date.now();
  const seen = Math.max(...[a.statusObservedAt, a.lastPollAt, a.lastRunAt].map(v => Date.parse(v || "")).filter(Number.isFinite), 0);
  // A held lock proves execution, not progress. This attention threshold is not a task timeout.
  const observationWindow = Math.max((a.intervalSeconds || 1800) * 2000, 3600000);
  if (a.runLockActive === true) {
    if (!seen || now - seen > observationWindow)
      return { label: "장시간 실행 · 진행 확인", tone: "warning", issue: true, active: false,
        detail: seen ? `실행은 감지되지만 ${Math.round(observationWindow / 60000)}분 이상 진행 기록이 갱신되지 않았습니다. 작업이 계속되고 있을 수 있으니 운영 맥에서 확인하세요.` : "실행은 감지되지만 관측 시각을 확인할 수 없습니다. 운영 맥에서 현재 진행을 확인하세요." };
    return { label: a.enabled ? "실행 감지" : "실행 감지 · 이후 정지", tone: "active", issue: false, active: true,
      detail: a.enabled ? "실행 잠금을 확인했습니다. 단계별 진행 기록은 제공되지 않습니다." : "이미 시작한 작업은 마친 뒤 멈춥니다. 단계별 진행 기록은 제공되지 않습니다." };
  }
  if (!a.enabled) return { label: "일시정지", tone: "unknown", issue: false, active: false, detail: "새 제출 지시가 멈춰 있습니다." };
  const next = Date.parse(a.nextAt || "");
  if (Number.isFinite(next) && next > now)
    return { label: "다음 순회 대기", tone: "normal", issue: false, active: false, detail: "원본 작업기에 기록된 다음 순회를 기다립니다." };
  const grace = Math.max((a.pollIntervalSeconds || 60) * 3000, 180000);
  if (!seen || (now - seen > grace && (!Number.isFinite(next) || now - next > grace)))
    return { label: "제출 작업기 확인", tone: "warning", issue: true, active: false, detail: "예정 시각 이후 실행이 확인되지 않습니다. 운영 맥의 제출 작업기와 브라우저를 확인하세요." };
  return { label: "순회 대기", tone: "normal", issue: false, active: false, detail: "원본 작업기의 실행 기록을 기다립니다." };
}
export function normalizedSnapshot(s: Snapshot): Snapshot {
  const health = uploadCondition(s);
  return { ...s, accounts: s.accounts.map(a => ({ ...a,
    name: accountLabel(a),
    running: a.running && health.active,
    ...(a.running && health.issue ? { status: "worker_unconfirmed", message: health.detail } : {}),
  })) };
}
export function nextSubmission(s: Snapshot, accountId: string) {
  return s.calendar.filter(v => v.accountId === accountId && v.next_upload_on)
    .sort((a, b) => b.uploaded_on.localeCompare(a.uploaded_on))[0]?.next_upload_on || null;
}
export function recovery(a: Account) {
  if (!a.bound) return "운영 맥의 원본 작업실에서 이 계정의 연결을 확인하세요.";
  if (a.status === "login_required") return `운영 맥의 ${a.browser || "지정"} 브라우저에서 이 계정으로 로그인한 뒤 재확인하세요.`;
  if (a.status === "eligibility_required") return "원본 작업실에서 기여자 제출 자격을 확인한 뒤 재확인하세요.";
  if (a.status === "search_review_required") return "원본 작업실에서 검색 검토를 마친 뒤 재확인하세요.";
  if (a.status === "metadata_required") return "원본 작업실에서 업로드와 제목·키워드 저장 여부를 확인하세요.";
  if (a.status === "worker_unconfirmed") return "운영 맥에서 제출 작업기의 실행 상태를 확인하세요. 연결 프로그램 수신과 작업기 실행은 별도로 확인합니다.";
  if (a.status === "reconciliation_required") return "원본 작업실에서 제출 결과를 대조하세요. 중복 제출을 막기 위해 확인 후 재개합니다.";
  if (a.status === "blocked") return a.message.includes("브라우저")
    ? `운영 맥의 ${a.browser || "지정"} 브라우저와 로그인 세션을 확인한 뒤 재확인하세요.`
    : "아래 원인을 원본 작업실에서 확인한 뒤 재확인하세요. 같은 문제가 남으면 지시를 반복하지 마세요.";
  return "원본 작업실에서 계정 상태를 확인하세요.";
}
export function laneCondition(lane: Lane | undefined, enabled: boolean) {
  if (!enabled) return { label: "일시정지", tone: "unknown", issue: false, detail: "" };
  if (!lane?.observedAt || !Number.isFinite(Date.parse(lane.observedAt)) || Date.now() - Date.parse(lane.observedAt) > 1800000)
    return { label: "상태 갱신 확인", tone: "warning", issue: true, detail: "운영 맥에서 원본 작업기와 NAS 연결을 확인하세요. 새 상태가 수신되면 갱신됩니다." };
  const labels: Record<string, string> = {
    retry_wait: "재시도 대기",
    planning_wait: "기획 재시도 대기",
    storage_wait: "저장 공간 부족",
    provider_wait: "서비스 대기",
    quarantined: "검사 보류",
    waiting_for_images: "이미지 대기",
    working: "작업 중",
    generating: "생성 중",
    reviewing: "검수 중",
    ready: "최근 작업 완료",
    generated: "생성 완료",
    reviewed: "검수 완료",
    planning_ready: "기획 완료",
    reserve_full: "비축 충족",
    interval_wait: "다음 순회 대기",
    disabled: "정지",
    lane_paused: "일시정지",
    idle: "대기",
  };
  const known = Object.hasOwn(labels, lane.status || "");
  const issue = !known || [
    "retry_wait",
    "planning_wait",
    "storage_wait",
    "provider_wait",
  ].includes(lane.status || "");
  const active = ["working", "generating", "reviewing"].includes(
    lane.status || "",
  );
  return {
    label: labels[lane.status || ""] || "상태 확인 필요",
    tone: issue ? "warning" : active ? "active" : "normal",
    issue,
    detail: issue ? ({
      storage_wait: "운영 맥과 NAS의 저장 공간을 확보하세요. 공간이 확보되면 원본 작업기가 자동 재개합니다.",
      provider_wait: "운영 맥의 원본 작업실에서 연결한 서비스 상태와 이용 한도를 확인하세요. 복구 후 다음 순회에서 다시 시도합니다.",
      planning_wait: `${lane.message || "새 제작 기획을 확보하지 못했습니다."} ${lane.nextAt ? date(lane.nextAt, true) + " 이후 " : "다음 순회에서 "}다른 주제와 부족한 종류로 자동 재시도합니다.`,
      retry_wait: "원본 작업기가 다음 순회에서 다시 시도합니다. 반복되면 운영 맥의 원본 작업실에서 실패 원인을 확인하세요.",
    }[lane.status || ""] || "운영 맥의 원본 작업실에서 작업기 상태를 확인하세요. 확인되지 않은 상태를 정상으로 처리하지 않습니다.") : "",
  };
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
  const response = await fetch("/api" + path, {
    credentials: "same-origin",
    ...options,
    signal: controller.signal,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(result.error || "요청을 처리하지 못했습니다."),
      { status: response.status },
    );
  return result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("응답이 늦어 연결을 다시 확인합니다. 잠시 후 재시도하세요.");
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
export const post = <T>(path: string, body: unknown, method = "POST") =>
  request<T>(path, { method, body: JSON.stringify(body) });
