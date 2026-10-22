import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Factory,
  Focus,
  Minus,
  Gamepad2,
  Image,
  KeyRound,
  Layers3,
  NotebookPen,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TriangleAlert,
  Video,
  X,
} from "./Icons";
import type { Account, Panel, WorldData, Schedule } from "../types";
import type { RevenueLedger } from "../finance-types";
import {
  accountLabel,
  assetStatus,
  assetReason,
  uploadCondition,
  nextSubmission,
  recovery,
  request,
  date,
  isIssue,
  laneCondition,
  n,
  post,
  severity,
  status,
  statuses,
  outstandingFailures,
} from "../data";
import { Empty, IconButton, Modal, Thumb } from "./Primitives";
import { Management } from "./Management";
import { Finance } from "./Finance";
import { accountFlow, currentAssets, expectedDateLabel } from "../operations-state";
import { processState, type ProcessKey } from "../game-state";
import { Button, Input, Select, Switch } from "../design-system/components";
import "./Panels.css";

function DescriptionList({ items, className = "" }: { items: [string, ReactNode][]; className?: string }) {
  return <div className={"ui-description-list ui-description-list--row " + className}><dl className="ui-description-list__dl">{items.map(([label, value]) => <div className="ui-description-list__row" key={label}><dt className="ui-description-list__t">{label}</dt><dd className="ui-description-list__d">{value}</dd></div>)}</dl></div>;
}

interface Props {
  panel: Panel;
  data: WorldData;
  selected: Account | null;
  stale: boolean;
  close: () => void;
  select: (id: string) => void;
  clearScope?: () => void;
  open: (p: Panel) => void;
  refresh: () => Promise<void>;
  toast: (s: string, tone?: "success" | "error" | "info") => void;
  reduced: boolean;
  setReduced: (s: boolean) => void;
  initialFilter?: string;
  inventory: { query: string; filter: string; page: number };
  setInventory: (next: { query: string; filter: string; page: number }) => void;
  activitySince: number;
  onAcknowledge: () => void;
  activeProcess?: ProcessKey | null;
  viewControls?: { reset: () => void; zoom: (delta: number) => void };
  onRevenueChanged?: (ledger: RevenueLedger) => void;
  onRevenueAccountChange?: (accountId: string) => void;
  revenueAccountId?: string | null;
  revenueYear?: number;
  canLogout: boolean;
  logout: () => Promise<void>;
}
export function Panels(p: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const panelRoot = useRef<HTMLElement>(null);
  const headingId = useId();
  const closeRef = useRef(p.close);
  closeRef.current = p.close;
  useEffect(() => {
    if (!p.panel) return;
    if (!document.querySelector('dialog[open]')) heading.current?.focus({ preventScroll: true });
    const trap = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
      const elements = [...(panelRoot.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') || [])].filter(node => node.getClientRects().length > 0 && !node.closest('[hidden]'));
      event.preventDefault(); event.stopPropagation();
      if (!elements.length) { heading.current?.focus(); return; }
      // Cycle explicitly: Safari's system Tab preference can otherwise skip
      // buttons and leave a modal even when the DOM has inert siblings.
      const index = elements.indexOf(document.activeElement as HTMLElement);
      const next = index < 0 ? (event.shiftKey ? elements.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + elements.length) % elements.length;
      elements[next].focus();
    };
    document.addEventListener('keydown', trap, true);
    return () => {
      document.removeEventListener('keydown', trap, true);
    };
  }, [p.panel]);
  useEffect(() => {
    if (p.panel && !document.querySelector('dialog[open]')) heading.current?.focus({ preventScroll: true });
  }, [p.selected?.id]);
  const { query, filter, page: requestedPage } = p.inventory;
  const [accountQuery, setAccountQuery] = useState("");
  const setQuery = (query: string) => { p.setInventory({ ...p.inventory, query, page: 0 }); body.current?.scrollTo({ top: 0 }); };
  const setFilter = (filter: string) => { p.setInventory({ ...p.inventory, filter, page: 0 }); body.current?.scrollTo({ top: 0 }); };
  const setPage = (page: number) => { p.setInventory({ ...p.inventory, page }); body.current?.scrollTo({ top: 0 }); };
  const [schedule, setSchedule] = useState(false),
    [confirm, setConfirm] = useState<{
      id: string;
      action: string;
      payload: Record<string, unknown>;
      title: string;
      description: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [addBusiness, setAddBusiness] = useState(false),
    [assetId, setAssetId] = useState<string | null>(null);
  const [history, setHistory] = useState<Schedule[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null | undefined>(undefined);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [draft, setDraft] = useState({ id: crypto.randomUUID(), account: "1", title: "", kind: "memo", due: "" });
  const body = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Record<string, number>>({});
  const scrollKey = p.panel + ":" + (p.selected?.id || "all");
  useEffect(() => { if (body.current) body.current.scrollTop = scrollPositions.current[scrollKey] || 0; }, [scrollKey]);
  const s = p.data.snapshot!,
    a = p.selected,
    accounts = s.accounts;
  const accountMatches = accounts.filter(v => `${accountLabel(v)} ${v.email || ""}`.toLocaleLowerCase().includes(accountQuery.trim().toLocaleLowerCase()));
  const upload = uploadCondition(s);
  const flow = a ? accountFlow(a, s, p.stale) : null;
  const accountCommand = a ? p.data.commands.find(v => v.action === "recheck" && String(v.payload.accountId) === a.id) : undefined;
  const accountPending = accountCommand?.status === "queued";
  const schedules = p.data.schedules.filter(v => !a || v.account_id === a.id);
  const historyRows = [...new Map([...schedules.filter(v => ["done", "cancelled"].includes(v.status)), ...history.filter(v => !a || v.account_id === a.id)].map(v => [v.id, v])).values()];
  const nextCursor = historyCursor === undefined ? p.data.scheduleHistory?.nextCursor : historyCursor;
  async function loadHistory() {
    if (!nextCursor || historyBusy) return;
    setHistoryBusy(true);
    try {
      const result = await request<{items: Schedule[]; nextCursor: string | null}>("/schedules/history?cursor=" + encodeURIComponent(nextCursor));
      setHistory(v => [...v, ...result.items]); setHistoryCursor(result.nextCursor);
    } catch (e) { p.toast((e as Error).message, "error"); } finally { setHistoryBusy(false); }
  }
  const titles: Record<string, string> = {
    account: a ? accountLabel(a) : "계정",
    accounts: "13개 계정 창고",
    inventory: "재고 창고",
    schedule: "일정",
    activity: "최근 변화",
    alerts: "확인할 일",
    automation: "자동 운영",
    businesses: "운영실",
    revenue: "월별 수익 기록부",
    management: "운영 계획·보고",
  };
  async function execute(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await post("/commands", { id: confirm?.id || crypto.randomUUID(), action, payload });
      p.toast("지시를 접수했습니다. 실행 결과는 같은 대상에서 확인합니다.", "success");
      setConfirm(null);
      await p.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const openSchedule = (previous?: Schedule) => {
    setError("");
    setDraft({ id: crypto.randomUUID(), account: previous?.account_id || a?.id || "1", title: previous?.title || "", kind: previous?.kind || "memo", due: new Date(Date.now() + 10 * 3600000).toISOString().slice(0,16) });
    setSchedule(true);
  };
  const makeRecheck = (account: Account) => {
    setError("");
    setConfirm({
      id: crypto.randomUUID(),
      action: "recheck",
      payload: { accountId: account.id },
      title: "계정 재확인",
      description: `${accountLabel(account)}. 기존 순서와 30분 간격에 따라 계정과 제출 상태를 다시 확인합니다. 로그인은 ${account.browser || "지정"} 브라우저에서 먼저 마쳐 주세요.`,
    });
  };
  const toggle = (lane: string, enabled: boolean) => {
    setError("");
    setConfirm({
      id: crypto.randomUUID(),
      action: "automation",
      payload: { lane, enabled },
      title: enabled ? "자동 운영 재개" : "자동 운영 일시정지",
      description: `${lane === "upload" ? "제출·심사 확인" : "이미지 제작"}을 ${enabled ? "재개" : "일시정지"}합니다. 이미 실행 중인 작업은 마친 뒤 적용됩니다.`,
    });
  };
  async function updateSchedule(id: string, status: string) {
    try {
      await post("/schedules/" + id, { status }, "PATCH");
      await p.refresh();
      p.toast(
        status === "done" ? "완료로 기록했습니다." : "일정을 취소했습니다.", "success",
      );
    } catch (e) {
      p.toast((e as Error).message, "error");
    }
  }
  const scoped = currentAssets(s).filter(
    (i) =>
      (!a || i.accountId === a.id) &&
      (filter === "all" || filter === "ready"
        ? filter === "all" || i.eligible
        : filter === "review"
          ? i.state === "submitted"
          : filter === "approved"
          ? i.state === "approved"
          : filter === "archive"
          ? ["approved", "published"].includes(i.state)
          : filter === "excluded"
            ? i.state === "ready" && !i.eligible
            : filter === "hold"
            ? i.phase === "quarantined"
            : ["published"].includes(i.state)) &&
      (!query || (i.title + " " + i.keywords.join(" ")).toLocaleLowerCase().includes(query.toLocaleLowerCase())),
  );
  const sorted = [...scoped].sort(
    (x, y) =>
      y.updatedAt.localeCompare(x.updatedAt) || x.id.localeCompare(y.id),
  );
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(sorted.length / 24) - 1));
  useEffect(() => {
    if (requestedPage !== page) {
      p.setInventory({ ...p.inventory, page });
      body.current?.scrollTo({ top: 0 });
    }
  }, [requestedPage, page, p.inventory, p.setInventory]);
  const failures = outstandingFailures(p.data);
  const issueAccounts = accounts.filter(isIssue);
  const lanes = Object.entries(s.automation.lanes).map(([key, value]) => ({
    key,
    value,
    ...laneCondition(value, s.automation.productionEnabled),
  }));
  const issueLanes = lanes.filter((l) => l.issue);
  const activeAsset = currentAssets(s).find((v) => v.id === assetId);
  const previewIds = (
    activeAsset && p.panel
      ? [activeAsset.id]
      : p.panel === "inventory"
        ? sorted.slice(page * 24, (page + 1) * 24).map((v) => v.id)
        : []
  ).filter((id) => !p.data.thumbnails.includes(id) && !p.data.previewFailures?.includes(id));
  const previewKey = previewIds.join("|");
  useEffect(() => {
    if (!previewKey || p.stale) return;
    let live = true;
    post("/previews", { ids: previewKey.split("|") }).catch(() => {});
    const timer = setInterval(() => {
      if (live && !document.hidden) void p.refresh();
    }, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [previewKey, p.stale, p.refresh]);
  return (
    <>
      <aside ref={panelRoot} role="dialog" aria-modal={p.panel ? true : undefined} aria-labelledby={headingId} hidden={!p.panel} className={"ui-sheet ui-sheet--right panel panel-" + p.panel} aria-label={titles[p.panel!]}>
        <div className="ui-sheet__head panel-heading">
          <div>
            {p.panel === "account" && a && (
              <span className="facility-code">
                계정 창고 {a.number.toString().padStart(2, "0")}
              </span>
            )}
            <h2 id={headingId} className="ui-sheet__title" ref={heading} tabIndex={-1}>
              {titles[p.panel!]}
            </h2>
          </div>
          <IconButton label="패널 닫기" onClick={p.close}>
            <X size={20} />
          </IconButton>
        </div>
        <div className="ui-sheet__body panel-body" ref={body} onScroll={e => { scrollPositions.current[scrollKey] = e.currentTarget.scrollTop; }}>
          {p.panel === "account" && a && (
            <>
              <div className="account-identity">
                <Thumb id={a.previewId} available={p.data.thumbnails} />
                <div>
                  <span className={"ui-badge status-tag " + severity(a)}>
                    <i className={"signal " + severity(a)} />
                    {status(a)}
                  </span>
                </div>
              </div>
              {isIssue(a) && (
                <div className={"ui-alert issue-message " + severity(a)}>
                  <span className="ui-alert__glyph" aria-hidden="true">{a.status === "login_required" ? (
                    <KeyRound size={19} />
                  ) : (
                    <TriangleAlert size={19} />
                  )}</span>
                  <div className="ui-alert__body">
                    {a.status !== "login_required" && a.message && <strong className="ui-alert__title">{a.message}</strong>}
                    <p>{recovery(a)}</p>
                  </div>
                </div>
              )}
              <div className="account-stock">
                <div>
                  <span>제출 가능한 재고</span>
                  <strong>
                    {n(a.ready)}
                    <small>개</small>
                  </strong>
                </div>
                <Button variant="ghost"
                  className="ui-button text-button"
                  onClick={() => p.open("inventory")}
                >
                  창고 열기 <ArrowRight size={16} />
                </Button>
              </div>
              <p className="stock-target">비축 목표 {n(a.target)}개</p>
              <div className="account-next-submission"><CalendarDays size={18}/><span>다음 제출 예정</span><strong>{date(nextSubmission(s, a.id))}</strong></div>
              {flow && <div className="account-flow-strip" aria-label="계정 물류 상태"><span><Package size={24}/><strong>{n(flow.ready)}</strong><small>재고</small></span><ChevronRight size={16}/><span><ShieldCheck size={24}/><strong>{n(flow.inspection)}</strong><small>심사</small></span><ChevronRight size={16}/><span><Image size={24}/><strong>{n(flow.archived)}</strong><small>승인·공개</small></span></div>}
              {flow?.inspection ? <p className="review-deadline">심사 {expectedDateLabel(flow.reviewAt)}</p> : null}
              <div className="account-observation-summary">
                <span>심사 자리 <strong>{a.capacity ? `${n(a.capacity.pending)} / ${n(a.capacity.limit_count)}` : "미확인"}</strong></span>
                <small>{a.capacity ? `${date(a.capacity.observed_at, true)} 관측${Date.now() - Date.parse(a.capacity.observed_at) > 86400000 ? " · 갱신 필요" : ""}` : "원본 작업기에서 확인 필요"}</small>
                {(!a.lastVerifiedAt || Date.now() - Date.parse(a.lastVerifiedAt) > 86400000) && <small>{a.lastVerifiedAt ? `계정 확인 ${date(a.lastVerifiedAt, true)} · 갱신 필요` : "계정 확인 성공 미기록"}</small>}
              </div>
              {accountCommand && (
                <div className={"command-progress " + accountCommand.status} role="status">
                  <strong>{accountCommand.status === "queued" ? "재확인 지시 대기" : accountCommand.status === "failed" ? "재확인 지시 실패" : "재확인 지시 반영"}</strong>
                  <span>{accountCommand.message || "기존 순서에 따라 작업기가 처리합니다."}</span>
                  <small>{date(accountCommand.updated_at || accountCommand.created_at, true)} · {accountCommand.status === "applied" ? "지시 반영 기록 · 실제 제출 완료와 별도" : "지시 처리 기록"}</small>
                  {accountCommand.status === "applied" && <span>{a.lastVerifiedAt && Date.parse(a.lastVerifiedAt)>Date.parse(accountCommand.created_at) ? `지시 이후 계정 확인됨 · ${date(a.lastVerifiedAt,true)}` : "지시 이후 확인 성공 대기"}</span>}
                </div>
              )}
              <details className="account-records history"><summary>확인 기록</summary><DescriptionList items={[
                ["작업기 응답", a.message || "추가 응답 없음"],
                ["심사 자리 관측", a.capacity ? date(a.capacity.observed_at, true) : "미확인"],
                ["마지막 확인 성공", a.lastVerifiedAt ? date(a.lastVerifiedAt, true) : "성공 시각 미기록"],
                ["최근 확인 시도", a.lastAttemptAt || a.checkedAt ? date(a.lastAttemptAt || a.checkedAt, true) : "미확인"],
              ]}/></details>
              <DescriptionList items={[
                ["다음 확인", a.running ? "진행 중" : a.nextCheckAt && Date.parse(a.nextCheckAt) <= Date.now() ? "순회 대기" : date(a.nextCheckAt, true)],
                ["예상 심사일", date(a.reviewOn)],
                ["심사 안내", `${a.reviewDays}${a.reviewBasis === "business" ? "영업일" : "일"}`],
                ...(a.reserved > 0 ? [["배정·중복·대기 제외", `${n(a.reserved)}개 제외`] as [string, ReactNode]] : []),
              ]}/>
              <Button variant="outline" className="ui-button full" onClick={() => p.open("revenue")}><CalendarDays size={20}/> 월별 수익 기록</Button>
              <div className="account-recent"><h3 className="section-title">최근 실제 변화</h3>{s.recent.filter(v=>v.accountId===a.id).sort((x,y)=>y.recorded_at.localeCompare(x.recorded_at)).slice(0,3).map(v=><div key={v.id}><strong>{statuses[v.state] || "상태 변경"}</strong><span>{v.title}</span><small>{date(v.recorded_at,true)}</small></div>)}{!s.recent.some(v=>v.accountId===a.id)&&<p className="muted">최근 기록에 변화가 없습니다.</p>}</div>
              <div className="section-heading">
                <h3>최근 제작물</h3>
              </div>
              <div className="mini-gallery">
                {currentAssets(s)
                  .filter(
                    (v) =>
                      v.accountId === a.id && p.data.thumbnails.includes(v.id),
                  )
                  .sort((x,y) => y.updatedAt.localeCompare(x.updatedAt))
                  .slice(0, 4)
                  .map((v) => (
                    <button
                      onClick={() => setAssetId(v.id)}
                      key={v.id}
                      title={v.title}
                    >
                      <Thumb id={v.id} available={p.data.thumbnails} failures={p.data.previewFailures} />
                      <span>{v.title}</span>
                    </button>
                  ))}
              </div>
              <div className="account-switch">
                <button
                  onClick={() =>
                    p.select(String(a.number === 1 ? 13 : a.number - 1))
                  }
                >
                  <ChevronLeft size={16} />
                  이전
                </button>
                <span>{a.number} / 13</span>
                <button
                  onClick={() =>
                    p.select(String(a.number === 13 ? 1 : a.number + 1))
                  }
                >
                  다음
                  <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}
          {p.panel === "accounts" && (
            <section className="ui-block-list accounts-block">
              <label className="search">
                <Search size={18} />
                <Input className="ui-input"
                  aria-label="계정 검색"
                  placeholder="계정·이메일 검색"
                  value={accountQuery}
                  onChange={(e) => setAccountQuery(e.target.value)}
                />
              </label>
              <div className="ui-block-list__body account-list">
                {accountMatches.map((v) => (
                    <button key={v.id} onClick={() => p.select(v.id)}>
                      <span className="account-number">
                        {v.number.toString().padStart(2, "0")}
                      </span>
                      <Thumb id={v.previewId} available={p.data.thumbnails} />
                      <span className="account-row-info">
                        <strong>{v.name}</strong>
                        <small>
                          <i className={"signal " + severity(v)} />
                          {status(v)}
                        </small>
                      </span>
                      <b>
                        {n(v.ready)}
                        <small>재고</small>
                      </b>
                      <ChevronRight size={16} />
                    </button>
                  ))}
              </div>
              {!accountMatches.length && <Empty>일치하는 계정이 없습니다.</Empty>}
            </section>
          )}
          {p.panel === "inventory" && (
            <section className="ui-block-list inventory-block">
              <div className="scope-line">
                <span>{a ? `${accountLabel(a)}` : "모든 계정"}</span>
                {a && (
                  <Button variant="ghost" className="ui-button text-button" onClick={() => p.clearScope ? p.clearScope() : p.select("")}>
                    전체 보기
                  </Button>
                )}
              </div>
              <label className="search">
                <Search size={18} />
                <Input className="ui-input"
                  aria-label="재고 검색"
                  placeholder="제목·키워드 검색"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                  }}
                />
              </label>
              <div className="ui-block-list__filters filter-tabs" role="group" aria-label="재고 상태"><ul className="ui-block-list__chips">
                {[
                  ["ready", "제출 가능"],
                  ["review", "심사 중"],
                  ["archive", "승인·공개"],
                  ["approved", "승인 보관"],
                  ["published", "공개"],
                  ["hold", "보류"],
                  ["excluded", "제출 제외"],
                  ["all", "전체"],
                ].map(([key, label]) => (
                  <li className="ui-block-list__chip-item" key={key}><button
                    aria-pressed={filter === key}
                    className={"ui-block-list__chip " + (filter === key ? "is-current active" : "")}
                    onClick={() => {
                      setFilter(key);
                    }}
                  >
                    {label}
                  </button></li>
                ))}</ul>
              </div>
              <div className="split inventory-count">
                <strong>{n(sorted.length)}개</strong>
              </div>
              {sorted.length ? (
                <div className="ui-block-list__body inventory-grid" data-cols="3">
                  {sorted.slice(page * 24, (page + 1) * 24).map((v) => (
                    <button key={v.id} onClick={() => setAssetId(v.id)}>
                      <Thumb id={v.id} available={p.data.thumbnails} failures={p.data.previewFailures} />
                      <strong>{v.title}</strong>
                      <span>
                        {v.accountId}번 ·{" "}
                        {assetStatus(v)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty>조건에 맞는 재고가 없습니다.</Empty>
              )}
              {sorted.length > 24 && (
                <div className="ui-pagination pagination">
                  <IconButton
                    label="이전 재고"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft />
                  </IconButton>
                  <span>
                    {page + 1} / {Math.ceil(sorted.length / 24)}
                  </span>
                  <IconButton
                    label="다음 재고"
                    disabled={(page + 1) * 24 >= sorted.length}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRight />
                  </IconButton>
                </div>
              )}
            </section>
          )}
          {p.panel === "schedule" && (
            <>
              <div className="scope-line"><span>{a ? `${accountLabel(a)}` : "모든 계정"}</span>{a && <Button variant="ghost" className="ui-button text-button" onClick={() => p.clearScope ? p.clearScope() : p.select("")}>전체 보기</Button>}</div>
              <div className="split">
                <span className="muted">한국 시간</span>
                <Button variant="primary"
                  className="ui-button compact"
                  onClick={() => openSchedule()}
                >
                  <Plus size={16} />
                  일정 추가
                </Button>
              </div>
              <h3 className="section-title">내 지시</h3>
              {schedules.filter(
                (v) => !["done", "cancelled"].includes(v.status),
              ).length === 0 ? (
                <p className="muted schedule-empty">예약한 지시가 없습니다.</p>
              ) : (
                <div className="timeline">
                  {schedules
                    .filter((v) => !["done", "cancelled"].includes(v.status))
                    .sort((x,y) => Number(y.status === "failed") - Number(x.status === "failed") || x.due_at.localeCompare(y.due_at))
                    .map((v) => (
                      <div className="timeline-item" key={v.id}>
                        <span className="timeline-dot" />
                        <div>
                          <small>
                            {date(v.due_at, true)} · {v.account_id}번
                          </small>
                          <strong>{v.title}</strong>
                          <span>
                            {v.kind === "memo" ? "직접 할 일" : "작업기 재확인"}
                            {v.status === "failed"
                              ? " · 처리 실패"
                              : v.status === "requested"
                                ? " · 지시 전달 중"
                                : ""}
                          </span>
                        </div>
                        {v.status === "failed" && <div className="schedule-recovery"><p role="status">{v.command_message || "작업기에서 처리하지 못했습니다. 계정 상태를 확인하세요."}</p><Button variant="ghost" className="ui-button text-button" disabled={p.stale} onClick={() => openSchedule(v)}>다시 예약</Button><Button variant="ghost" className="ui-button text-button" onClick={() => updateSchedule(v.id,"cancelled")}>기록 닫기</Button></div>}
                        {v.status === "planned" && (
                          <div className="inline-actions">
                            {v.kind === "memo" && (
                              <IconButton
                                label={`${v.title} 완료`}
                                onClick={() => updateSchedule(v.id, "done")}
                              >
                                <Check size={17} />
                              </IconButton>
                            )}
                            <IconButton
                              label={`${v.title} 취소`}
                              onClick={() => updateSchedule(v.id, "cancelled")}
                            >
                              <X size={16} />
                            </IconButton>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
              <h3 className="section-title">다음 제출 예정 · 원본 계획</h3>
              <div className="timeline">{accounts.filter(v => (!a || a.id === v.id) && nextSubmission(s,v.id)).sort((x,y) => (nextSubmission(s,x.id) || "").localeCompare(nextSubmission(s,y.id) || "")).map(v => <button className="timeline-item" key={v.id} onClick={() => p.select(v.id)}><CalendarDays size={18}/><div><strong>{accountLabel(v)}</strong><span>{date(nextSubmission(s,v.id))}</span></div><ChevronRight size={16}/></button>)}</div>
              {!accounts.some(v => (!a || a.id === v.id) && nextSubmission(s,v.id)) && <p className="muted schedule-empty">다음 제출 예정 없음 · {a ? `${a.number}번 계정 창고` : `${accounts.length}개 계정 창고`}</p>}
              <h3 className="section-title">실제 제출 · 예상 심사</h3>
              <div className="timeline">
                {[...s.calendar].filter(v=>!v.checked_on)
                  .sort((x, y) => x.check_on.localeCompare(y.check_on))
                  .filter((v) => !a || v.accountId === a.id)
                  .map((v) => (
                    <button
                      className="timeline-item"
                      key={v.id}
                      onClick={() => p.select(v.accountId)}
                    >
                      <span
                        className={
                          "timeline-dot " + (v.checked_on ? "done" : "")
                        }
                      />
                      <div>
                        <small>
                          {date(v.uploaded_on)} 제출 → {date(v.check_on)} 예상
                        </small>
                        <strong>
                          {v.accountId}번 ·{" "}
                          {accounts.find((x) => x.id === v.accountId)?.name}
                        </strong>
                        <span>
                          {v.checked_on
                            ? "확인 완료"
                            : `${v.review_business_days}${v.review_day_basis === "business" ? "영업일" : "일"} · 심사 대기`}
                        </span>
                      </div>
                      <ChevronRight size={16} />
                    </button>
                  ))}
              </div>
              {!s.calendar.some(v=>!v.checked_on && (!a || v.accountId === a.id)) && <p className="muted schedule-empty">진행 중인 제출·심사 기록이 없습니다.</p>}
              {s.calendar.some(v=>v.checked_on && (!a || v.accountId === a.id)) && <details className="history"><summary>지난 제출·심사 기록</summary><div className="timeline">{[...s.calendar].filter(v=>v.checked_on && (!a || v.accountId === a.id)).sort((x,y)=>y.check_on.localeCompare(x.check_on)).map(v=><button className="timeline-item" key={v.id} onClick={()=>p.select(v.accountId)}><span className="timeline-dot done"/><div><strong>{v.accountId}번 계정</strong><small>{date(v.uploaded_on)} 제출 · {date(v.checked_on)} 확인 완료</small></div><ChevronRight size={16}/></button>)}</div></details>}
              {(historyRows.length > 0 || nextCursor) && <details className="history"><summary>완료·취소 기록{p.data.scheduleHistory ? ` · 전체 ${n(p.data.scheduleHistory.total)}건` : ""}</summary>{historyRows.map(v => <p key={v.id}><span>{v.account_id}번 · {v.title}<small>{date(v.due_at,true)}</small></span><span>{v.status === "done" ? "완료" : "취소"}</span></p>)}{nextCursor && <Button variant="outline" className="ui-button full" disabled={historyBusy} onClick={() => void loadHistory()}>{historyBusy ? "불러오는 중…" : "이전 기록 더 보기"}</Button>}</details>}

            </>
          )}
          {p.panel === "alerts" && (
            <>
              {p.stale && (
                <div className="ui-alert ui-alert--danger issue-message danger">
                  <TriangleAlert size={20} />
                  <div>
                    <strong>작업기 연결 확인</strong>
                    <p>
                      마지막 수신 {date(s.receivedAt, true)}. 연결이 돌아올
                      때까지 새 지시를 보내지 않습니다.
                    </p>
                  </div>
                </div>
              )}
              {upload.issue && <button className="alert-row" onClick={() => p.open("automation")}><span className="alert-icon warning"><Send size={19}/></span><div><strong>제출 작업기</strong><span>{upload.label}</span><small>운영 맥에서 제출 작업기의 실행 상태를 확인하세요.</small></div><ChevronRight size={16}/></button>}
              {failures.schedules.map(v => <button className="alert-row" key={v.id} onClick={() => { p.select(v.account_id); p.open("schedule"); }}><span className="alert-icon warning"><CalendarDays size={19}/></span><div><strong>예약 처리 실패 · {v.account_id}번</strong><span>{v.title}</span><small>{v.command_message || "일정에서 원인을 확인하고 다시 예약하세요."}</small></div><ChevronRight size={16}/></button>)}
              {issueLanes.map((l) => (
                <button
                  key={l.key}
                  className="alert-row"
                  onClick={() => p.open("automation")}
                >
                  <span className="alert-icon warning">
                    <Factory size={19} />
                  </span>
                  <div>
                    <strong>
                      {
                        {
                          generation: "생성 작업기",
                          review: "육안 검수 작업기",
                          metadata: "메타데이터 작업기",
                        }[l.key]
                      }
                    </strong>
                    <span>{l.label}</span>
                    <small>
                      {date(l.value.observedAt, true)} 상태. {l.detail}
                    </small>
                  </div>
                  <ChevronRight size={16} />
                </button>
              ))}
              {issueAccounts.length === 0 &&
              issueLanes.length === 0 && !upload.issue && !failures.commands.length && !failures.schedules.length &&
              !p.stale ? (
                <Empty>확인이 필요한 작업이 없습니다.</Empty>
              ) : (
                issueAccounts.map((v) => (
                  <button
                    key={v.id}
                    className="alert-row"
                    onClick={() => p.select(v.id)}
                  >
                    <span className={"alert-icon " + severity(v)}>
                      {v.status === "login_required" ? (
                        <KeyRound size={19} />
                      ) : (
                        <TriangleAlert size={19} />
                      )}
                    </span>
                    <div>
                      <strong>
                        {accountLabel(v)}
                      </strong>
                      <span>{status(v)}</span>
                      <small>{v.message}</small>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                ))
              )}
              <h3 className="section-title">최근 지시</h3>
              {p.data.commands.length ? (
                <div className="command-list">
                  {p.data.commands.map((v) => (
                    <div key={v.id}>
                      <span className={"command-dot " + v.status} />
                      <div>
                        <strong>
                          {v.action === "recheck"
                            ? `${v.payload.accountId}번 재확인`
                            : v.payload.lane === "upload"
                              ? "제출 자동화 설정"
                              : "제작 자동화 설정"}
                        </strong>
                        <p>{v.message || "작업기 전달 대기"}</p>
                        <small>{date(v.created_at, true)}</small>
                      </div>
                      <span>
                        {v.status === "applied"
                          ? "반영"
                          : v.status === "failed"
                            ? "실패"
                            : "대기"}
                      </span>
                      {v.status === "failed" && <Button variant="ghost" className="ui-button text-button" disabled={p.stale} onClick={() => { setError(""); setConfirm({ id:crypto.randomUUID(), action:v.action, payload:v.payload, title:"지시 다시 보내기", description:v.message || "원본 작업실에서 원인을 해결한 뒤 같은 지시를 다시 보냅니다." }); }}>재시도</Button>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">아직 내린 지시가 없습니다.</p>
              )}
            </>
          )}
          {p.panel === "activity" && <>
            <div className="split"><span className="muted">최근 {n(s.recent.length)}건 기준</span><Button variant="ghost" className="ui-button text-button" onClick={p.onAcknowledge}>여기까지 확인 <Check size={16}/></Button></div>
            <div className="timeline">{[...s.recent].sort((x,y)=>y.recorded_at.localeCompare(x.recorded_at)).map(v => <button className={"timeline-item actual-event " + (Date.parse(v.recorded_at)>p.activitySince ? "unread" : "")} key={v.id} onClick={()=>p.select(v.accountId)}><span className="timeline-dot"/><div><small>{date(v.recorded_at,true)} · {v.accountId}번</small><strong>{statuses[v.state] || "상태 변경"}</strong><span>{v.title}</span></div><ChevronRight size={16}/></button>)}</div>
            {!s.recent.length && <Empty>기록된 변화가 없습니다.</Empty>}
          </>}
          {p.panel === "automation" && (
            <>
              <Button variant="outline" className="ui-button full" onClick={() => p.open("management")}><NotebookPen size={18}/> 운영 계획·보고</Button>
              {s.automation.scan?.pending.length ? <div className="command-progress">
                <strong>순차 확인 진행 중 · {s.automation.scan.pending.length}개 계정 남음</strong>
                <span>{s.automation.scan.pending.map(number => `${number}번`).join(" → ")}</span>
                <small>다음 계정 작업 가능 {date(s.automation.nextAt, true)} · 작업 종료 후 30분 간격</small>
              </div> : s.automation.scan?.completedAt ? <p className="muted">요청한 순차 확인 완료 · {date(s.automation.scan.completedAt, true)}</p> : null}
              {p.activeProcess && <div className="process-focus"><Factory size={18}/><strong>{({generation:"생산 공장",review:"제작 검수",stock:"계정 창고",submission:"제출 운송",inspection:"심사대",archive:"승인·공개 창고",revenue:"월별 수익"}[p.activeProcess])}</strong><span>{processState(p.activeProcess, s, p.stale).label}</span></div>}
              {p.activeProcess === "review" && <div className="process-focus"><strong>메타데이터</strong><span>{laneCondition(s.automation.lanes.metadata,s.automation.productionEnabled).label}</span></div>}
              <div className={"command-progress " + upload.tone}><strong>제출 작업기 · {upload.label}</strong><span>{upload.detail}</span><small>상태 관측 {date(s.automation.statusObservedAt || s.automation.lastPollAt,true)}</small></div>
              {[
                [
                  "production",
                  "이미지 제작",
                  s.automation.productionEnabled,
                  Factory,
  Focus,
  Minus,
                ],
                ["upload", "제출 · 심사 확인", s.automation.enabled, Send],
              ].map(([lane, label, enabled, Icon]) => {
                const I = Icon as typeof Factory;
                return (
                  <div className="automation-row" key={String(lane)}>
                    <I size={24} />
                    <div>
                      <strong>{String(label)}</strong>
                      <span>{p.data.commands.some(v => v.action === "automation" && v.payload.lane === lane && v.status === "queued") ? "설정 지시 대기" : enabled ? "자동 운영 켜짐" : "일시정지"}</span>
                    </div>
                    <Switch
                      aria-label={String(label)}
                      checked={Boolean(enabled)}
                      disabled={p.stale || p.data.commands.some(v => v.action === "automation" && v.payload.lane === lane && v.status === "queued")}
                      onChange={() => toggle(String(lane), !enabled)}
                    />
                  </div>
                );
              })}
              {p.data.commands.filter(v=>v.action === "automation").slice(0,2).map(v=><div className={"command-progress " + v.status} key={v.id}><strong>{v.payload.lane === "upload" ? "제출" : "제작"} 설정 · {v.status === "queued" ? "지시 대기" : v.status === "failed" ? "실패" : "반영"}</strong><span>{v.message || "작업기에서 처리할 때까지 기다립니다."}</span><small>{date(v.updated_at || v.created_at,true)}</small></div>)}
              <DescriptionList items={[
                ["계정 간격", `${s.automation.intervalSeconds / 60}분`],
                ["마지막 운영", date(s.automation.lastRunAt, true)],
                ["다음 순회", date(s.automation.nextAt, true)],
              ]}/>
              <h3 className="section-title">작업기</h3>
              {lanes.map((l) => (
                <div key={l.key}><div className="lane-row">
                  <span className={"signal " + l.tone} />
                  <strong>
                    {
                      {
                        generation: "생성",
                        review: "육안 검수",
                        metadata: "검색·메타데이터",
                      }[l.key]
                    }
                  </strong>
                  <span>{l.label}</span>
                </div>{l.issue && <p className="muted lane-recovery">{l.detail}</p>}</div>
              ))}
              <h3 className="section-title">화면</h3>
              {p.viewControls && <div className="world-view-settings"><div className="world-view-buttons"><Button variant="outline" onClick={p.viewControls.reset}><Focus size={22}/> 전체 보기</Button><Button variant="outline" onClick={() => p.viewControls!.zoom(1)}><Plus size={22}/> 확대</Button><Button variant="outline" onClick={() => p.viewControls!.zoom(-1)}><Minus size={22}/> 축소</Button></div></div>}

              <div className="automation-row">
                <Layers3 size={23} />
                <div>
                  <strong>움직임 줄이기</strong>
                  <span>운영 상태는 계속 갱신됩니다.</span>
                </div>
                <Switch aria-label="움직임 줄이기" checked={p.reduced} onChange={() => p.setReduced(!p.reduced)} />
              </div>
              {p.canLogout && (
                <Button variant="outline"
                  className="ui-button full"
                  style={{ marginTop: "var(--p-space-lg)" }}
                  onClick={() => p.logout().catch((e) => p.toast(e.message, "error"))}
                >
                  로그아웃
                </Button>
              )}
            </>
          )}
          {p.panel === "businesses" && (
            <>
              <div className="island-tools">
                <Button variant="outline" onClick={() => p.open("revenue")}><CalendarDays size={28}/> 월별 수익</Button>
                <Button variant="outline" onClick={() => p.open("automation")}><Factory size={28}/> 운영실</Button>
              </div>
              <Button variant="outline" className="ui-button full" onClick={() => p.open("management")}><NotebookPen size={18}/> 운영 계획·보고</Button>
              <button
                className="business-row selected"
                onClick={() => p.open("accounts")}
              >
                <span className="business-icon">
                  <Image size={23} />
                </span>
                <div>
                  <strong>미리캔버스</strong>
                  <span>13개 계정 창고 · 연결됨</span>
                </div>
                <ChevronRight size={18} />
              </button>
              {p.data.businesses.map((v) => {
                const I =
                  (
                    {
                      game: Gamepad2,
                      art: Image,
                      video: Video,
                      blog: NotebookPen,
                    } as Record<string, typeof Image>
                  )[v.kind] || Factory;
                return (
                  <div className="business-row" key={v.id}>
                    <span className="business-icon muted">
                      <I size={23} />
                    </span>
                    <div>
                      <strong>{v.name}</strong>
                      <span>연결 대기{v.note ? " · " + v.note : ""}</span>
                    </div>
                    <span className="unconnected">미연결</span>
                  </div>
                );
              })}
              <Button variant="outline"
                className="ui-button full"
                onClick={() => {
                  setError("");
                  setAddBusiness(true);
                }}
              >
                <Plus size={18} />
                사업 등록
              </Button>
            </>
          )}
          {p.panel === "revenue" && <Finance accounts={accounts} initialYear={p.revenueYear} initialAccountId={a?.id || p.revenueAccountId || null} toast={(message: string) => p.toast(message)} onChanged={p.onRevenueChanged} onAccountChange={p.onRevenueAccountChange}/>}
          {p.panel === "management" && <Management businesses={p.data.businesses} toast={p.toast}/>}
        </div>
        {p.panel === "account" && a && (
          <div className="panel-actions panel-footer">
            <Button variant="outline" className="ui-button" onClick={() => openSchedule()}>
              <CalendarDays size={17} />
              일정 추가
            </Button>
            <Button variant="primary"
              className="ui-button"
              disabled={p.stale || accountPending || busy}
              onClick={() => makeRecheck(a)}
            >
              <RefreshCw size={17} />
              {accountPending ? "지시 대기" : accountCommand?.status === "failed" ? "다시 재확인" : "재확인"}
            </Button>
          </div>
        )}
      </aside>
      {schedule && (
        <Modal title="일정 추가" onClose={() => !busy && setSchedule(false)}>
          <form className="ui-form"
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                await post("/schedules", {
                  id: draft.id,
                  accountId: f.get("account"),
                  title: f.get("title"),
                  kind: f.get("kind"),
                  dueAt: new Date(
                    String(f.get("due")) + "+09:00",
                  ).toISOString(),
                });
                await p.refresh();
                setSchedule(false);
                p.toast("일정을 저장했습니다.", "success");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset className="ui-form__set"><div className="ui-form__body">
            <Select label="계정 창고" name="account" value={draft.account} onChange={e=>setDraft({...draft,account:e.target.value})} items={accounts.map(v => ({value:v.id,label:`${accountLabel(v)}`}))} />
            <label className="ui-field">
              할 일
              <Input className="ui-input"
                name="title"
                value={draft.title}
                onChange={e=>setDraft({...draft,title:e.target.value})}
                placeholder="다음 제출분 20개 확인"
                required
                maxLength={100}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field__label">일시 <small className="muted">한국 시간</small></span>
              <Input className="ui-input"
                name="due"
                type="datetime-local"
                required
                value={draft.due}
                onChange={e=>setDraft({...draft,due:e.target.value})}
              />
            </label>
            <Select label="처리" name="kind" value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value})} items={[{value:"memo",label:"직접 할 일"},{value:"recheck",label:"작업기에 계정 재확인 요청"}]} />
            <p className="ui-field__hint form-help">
              재확인은 예약 시각 이후 기존 운영 순서로 처리합니다. 실제 제출
              완료와 구분됩니다.
            </p>
            {error && (
              <p role="alert" className="ui-field__error form-error">
                {error}
              </p>
            )}
            <Button variant="primary" type="submit" disabled={busy} className="ui-button full">
              {busy ? "저장 중…" : "일정 저장"}
            </Button>
            </div></fieldset>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal title={confirm.title} onClose={() => !busy && setConfirm(null)}>
          <p className="confirm-description">{confirm.description}</p>
          {error && (
            <p role="alert" className="ui-field__error form-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button variant="outline"
              className="ui-button"
              onClick={() => setConfirm(null)}
              disabled={busy}
            >
              취소
            </Button>
            <Button variant="primary"
              className="ui-button"
              disabled={busy}
              onClick={() => execute(confirm.action, confirm.payload)}
            >
              {busy ? "전달 중…" : "지시 보내기"}
            </Button>
          </div>
        </Modal>
      )}
      {addBusiness && (
        <Modal title="사업 등록" onClose={() => !busy && setAddBusiness(false)}>
          <form className="ui-form"
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                await post("/businesses", {
                  name: f.get("name"),
                  kind: f.get("kind"),
                  note: f.get("note"),
                });
                await p.refresh();
                setAddBusiness(false);
                p.toast("사업을 등록했습니다. 데이터 연결은 아직 없습니다.", "success");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset className="ui-form__set"><div className="ui-form__body">
            <label className="ui-field">
              사업 이름
              <Input className="ui-input"
                name="name"
                required
                maxLength={40}
                placeholder="YouTube"
              />
            </label>
            <Select label="종류" name="kind" defaultValue="video" items={[{value:"video",label:"영상"},{value:"game",label:"게임"},{value:"art",label:"그림 · 멤버십"},{value:"blog",label:"블로그"},{value:"other",label:"기타"}]} />
            <label className="ui-field">
              메모
              <Input className="ui-input"
                name="note"
                maxLength={300}
                placeholder="연결할 작업실 또는 운영 메모"
              />
            </label>
            <p className="ui-field__hint form-help">
              사업을 목록에 등록합니다. 수량과 자동화는 별도 연동 후 표시됩니다.
            </p>
            {error && (
              <p role="alert" className="ui-field__error form-error">
                {error}
              </p>
            )}
            <Button variant="primary" type="submit" className="ui-button full" disabled={busy}>
              {busy ? "저장 중…" : "등록"}
            </Button>
            </div></fieldset>
          </form>
        </Modal>
      )}
      {activeAsset && (
        <Modal title={activeAsset.title} onClose={() => setAssetId(null)}>
          <Thumb
            id={activeAsset.id}
            available={p.data.thumbnails}
            failures={p.data.previewFailures}
            className="large-preview"
          />
          {!p.data.thumbnails.includes(activeAsset.id) && (
            <p className="ui-field__hint form-help">
              {p.data.previewFailures?.includes(activeAsset.id) ? "미리보기를 가져오지 못했습니다." : p.stale
                ? "작업기가 다시 연결되면 미리보기를 가져옵니다."
                : "작업실에서 이 그림의 미리보기를 가져오는 중입니다."}
            </p>
          )}
          {p.data.previewFailures?.includes(activeAsset.id) && <Button variant="outline" className="ui-button full" disabled={p.stale || busy} onClick={async()=> { setBusy(true); try { await post("/previews",{ids:[activeAsset.id],retry:true}); await p.refresh(); p.toast("미리보기를 다시 요청했습니다.", "success"); } catch(e) {p.toast((e as Error).message, "error");} finally {setBusy(false);} }}>미리보기 다시 가져오기</Button>}
          {assetReason(activeAsset) && <p className="asset-reason">{assetReason(activeAsset)}</p>}
          <DescriptionList items={[
            ["계정 창고", `${activeAsset.accountId}번`],
            ["상태", assetStatus(activeAsset)],
            ["계정 배정", activeAsset.owned ? "이 계정 소유" : "다른 계정 또는 미배정"],
          ]}/>
          <div className="keyword-list">
            {activeAsset.keywords.map((k) => (
              <span key={k}>{k}</span>
            ))}
          </div>
          <small className="muted">
            {date(activeAsset.updatedAt, true)} 갱신
          </small>
        </Modal>
      )}
    </>
  );
}
