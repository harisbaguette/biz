import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Factory,
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
} from "lucide-react";
import type { Account, Panel, WorldData, Schedule } from "../types";
import {
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
import "./Panels.css";

interface Props {
  panel: Panel;
  data: WorldData;
  selected: Account | null;
  stale: boolean;
  close: () => void;
  select: (id: string) => void;
  open: (p: Panel) => void;
  refresh: () => Promise<void>;
  toast: (s: string) => void;
  reduced: boolean;
  setReduced: (s: boolean) => void;
  initialFilter?: string;
  inventory: { query: string; filter: string; page: number };
  setInventory: (next: { query: string; filter: string; page: number }) => void;
  activitySince: number;
  onAcknowledge: () => void;
  activeProcess?: "generation" | "review" | "stock" | "submission" | null;
  canLogout: boolean;
  logout: () => Promise<void>;
}
export function Panels(p: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (p.panel) heading.current?.focus({ preventScroll: true });
  }, [p.panel, p.selected?.id]);
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
  const upload = uploadCondition(s);
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
    } catch (e) { p.toast((e as Error).message); } finally { setHistoryBusy(false); }
  }
  const titles: Record<string, string> = {
    account: a?.name || "작업동",
    accounts: "13개 작업동",
    inventory: "재고 창고",
    schedule: "일정",
    activity: "최근 변화",
    alerts: "확인할 일",
    automation: "자동 운영",
    businesses: "사업 단지",
  };
  async function execute(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await post("/commands", { id: confirm?.id || crypto.randomUUID(), action, payload });
      p.toast("지시를 접수했습니다. 실행 결과는 같은 대상에서 확인합니다.");
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
      description: `${account.number}번 ${account.name}. 기존 순서와 30분 간격에 따라 계정과 제출 상태를 다시 확인합니다. 로그인은 ${account.browser || "지정"} 브라우저에서 먼저 마쳐 주세요.`,
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
        status === "done" ? "완료로 기록했습니다." : "일정을 취소했습니다.",
      );
    } catch (e) {
      p.toast((e as Error).message);
    }
  }
  const scoped = s.assets.filter(
    (i) =>
      (!a || i.accountId === a.id) &&
      (filter === "all" || filter === "ready"
        ? filter === "all" || i.eligible
        : filter === "review"
          ? ["submitted", "approved"].includes(i.state)
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
  const activeAsset = s.assets.find((v) => v.id === assetId);
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
      <aside hidden={!p.panel} className={"panel panel-" + p.panel} aria-label={titles[p.panel!]}>
        <div className="panel-heading">
          <div>
            {p.panel === "account" && a && (
              <span className="facility-code">
                작업동 {a.number.toString().padStart(2, "0")}
              </span>
            )}
            <h2 ref={heading} tabIndex={-1}>
              {titles[p.panel!]}
            </h2>
          </div>
          <IconButton label="패널 닫기" onClick={p.close}>
            <X size={20} />
          </IconButton>
        </div>
        <div className="panel-body" ref={body} onScroll={e => { scrollPositions.current[scrollKey] = e.currentTarget.scrollTop; }}>
          {p.panel === "account" && a && (
            <>
              <div className="account-identity">
                <Thumb id={a.previewId} available={p.data.thumbnails} />
                <div>
                  <span className={"status-tag " + severity(a)}>
                    <i className={"signal " + severity(a)} />
                    {status(a)}
                  </span>
                  <p className="account-email">{a.email || "계정 미연결"}</p>
                </div>
              </div>
              {isIssue(a) && (
                <div className={"issue-message " + severity(a)}>
                  {a.status === "login_required" ? (
                    <KeyRound size={19} />
                  ) : (
                    <TriangleAlert size={19} />
                  )}
                  <div>
                    <strong>
                      {a.status === "login_required"
                        ? `${a.browser} 로그인 확인`
                        : "작업 확인 필요"}
                    </strong>
                    <p>{recovery(a)}</p>
                    {a.message && <small>{a.message}</small>}
                    {a.checkedAt && (
                      <small>{date(a.checkedAt, true)} 확인</small>
                    )}
                  </div>
                </div>
              )}
              <div className="account-observation">
                <div><span>마지막 계정 확인</span><strong>{a.checkedAt ? date(a.checkedAt, true) : "미확인"}</strong></div>
                <div><span>다음 제출 예정</span><strong>{date(nextSubmission(s, a.id))}</strong></div>
                <div><span>심사 자리 · 마지막 관측</span><strong>{a.capacity ? `${n(a.capacity.pending)} / ${n(a.capacity.limit_count)}` : "미확인"}</strong></div>
                {a.capacity && <small>{date(a.capacity.observed_at, true)} 확인{Date.now() - Date.parse(a.capacity.observed_at) > 86400000 ? " · 오래된 관측" : ""}</small>}
              </div>
              {accountCommand && (
                <div className={"command-progress " + accountCommand.status} role="status">
                  <strong>{accountCommand.status === "queued" ? "재확인 지시 대기" : accountCommand.status === "failed" ? "재확인 지시 실패" : "재확인 지시 반영"}</strong>
                  <span>{accountCommand.message || "기존 순서에 따라 작업기가 처리합니다."}</span>
                  <small>{date(accountCommand.updated_at || accountCommand.created_at, true)} · {accountCommand.status === "applied" ? "지시 반영 기록 · 실제 제출 완료와 별도" : "지시 처리 기록"}</small>
                  {accountCommand.status === "applied" && <span>{a.checkedAt && Date.parse(a.checkedAt)>Date.parse(accountCommand.created_at) ? `지시 이후 계정 확인됨 · ${date(a.checkedAt,true)}` : "지시 이후 계정 확인 대기"}</span>}
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
                <button
                  className="text-button"
                  onClick={() => p.open("inventory")}
                >
                  창고 열기 <ArrowRight size={16} />
                </button>
              </div>
              <div
                className="stock-rack"
                aria-label={`비축 목표 ${a.target}개 중 ${a.ready}개`}
              >
                {Array.from({ length: 20 }, (_, i) => (
                  <span
                    key={i}
                    className={
                      i < Math.ceil((a.ready / a.target) * 20) ? "filled" : ""
                    }
                  />
                ))}
              </div>
              <div className="split muted">
                <span>비축 목표</span>
                <span>{n(a.target)}개</span>
              </div>
              <div className="stage-counts">
                <div>
                  <ShieldCheck />
                  <strong>{n(a.counts.submitted || 0)}</strong>
                  <span>심사 중</span>
                </div>
                <div>
                  <Image />
                  <strong>{n(a.counts.published || 0)}</strong>
                  <span>공개</span>
                </div>
                <div>
                  <Package />
                  <strong>{n(a.counts.prepared || 0)}</strong>
                  <span>제출 대기</span>
                </div>
              </div>
              <div className="detail-lines">
                <div>
                  <span>다음 확인</span>
                  <strong>
                    {a.running
                      ? "진행 중"
                      : a.nextCheckAt && Date.parse(a.nextCheckAt) <= Date.now()
                        ? "순회 대기"
                        : date(a.nextCheckAt, true)}
                  </strong>
                </div>
                <div>
                  <span>예상 심사일</span>
                  <strong>{date(a.reviewOn)}</strong>
                </div>
                <div>
                  <span>심사 안내</span>
                  <strong>
                    {a.reviewDays}
                    {a.reviewBasis === "business" ? "영업일" : "일"}
                  </strong>
                </div>
                {a.reserved > 0 && (
                  <div>
                    <span>배정·중복·대기 제외</span>
                    <strong>{n(a.reserved)}개 제외</strong>
                  </div>
                )}
              </div>
              <div className="account-recent"><h3 className="section-title">최근 실제 변화</h3>{s.recent.filter(v=>v.accountId===a.id).sort((x,y)=>y.recorded_at.localeCompare(x.recorded_at)).slice(0,3).map(v=><div key={v.id}><strong>{statuses[v.state] || "상태 변경"}</strong><span>{v.title}</span><small>{date(v.recorded_at,true)}</small></div>)}{!s.recent.some(v=>v.accountId===a.id)&&<p className="muted">최근 기록에 변화가 없습니다.</p>}</div>
              <div className="section-heading">
                <h3>최근 제작물</h3>
                <span>{a.name}</span>
              </div>
              <div className="mini-gallery">
                {s.assets
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
            <>
              <label className="search">
                <Search size={18} />
                <input
                  aria-label="계정 검색"
                  placeholder="화풍·계정 검색"
                  value={accountQuery}
                  onChange={(e) => setAccountQuery(e.target.value)}
                />
              </label>
              <div className="account-list">
                {accounts
                  .filter((v) => (v.name + v.email).includes(accountQuery))
                  .map((v) => (
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
            </>
          )}
          {p.panel === "inventory" && (
            <>
              <div className="scope-line">
                <span>{a ? `${a.number}번 · ${a.name}` : "모든 작업동"}</span>
                {a && (
                  <button className="text-button" onClick={() => p.select("")}>
                    전체 보기
                  </button>
                )}
              </div>
              <label className="search">
                <Search size={18} />
                <input
                  aria-label="재고 검색"
                  placeholder="제목·키워드 검색"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                  }}
                />
              </label>
              <div className="filter-tabs">
                {[
                  ["ready", "제출 가능"],
                  ["review", "심사 중"],
                  ["published", "공개"],
                  ["hold", "보류"],
                  ["excluded", "제출 제외"],
                  ["all", "전체"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    aria-pressed={filter === key}
                    className={filter === key ? "active" : ""}
                    onClick={() => {
                      setFilter(key);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="split inventory-count">
                <strong>{n(sorted.length)}개</strong>
                <span>그림을 누르면 상세</span>
              </div>
              {sorted.length ? (
                <div className="inventory-grid">
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
                <div className="pagination">
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
            </>
          )}
          {p.panel === "schedule" && (
            <>
              <div className="scope-line"><span>{a ? `${a.number}번 · ${a.name}` : "모든 작업동"}</span>{a && <button className="text-button" onClick={() => p.select("")}>전체 보기</button>}</div>
              <div className="split">
                <span className="muted">한국 시간</span>
                <button
                  className="button primary compact"
                  onClick={() => openSchedule()}
                >
                  <Plus size={16} />
                  일정 추가
                </button>
              </div>
              <h3 className="section-title">내 지시</h3>
              {schedules.filter(
                (v) => !["done", "cancelled"].includes(v.status),
              ).length === 0 ? (
                <Empty>새 일정을 추가하면 여기에 모입니다.</Empty>
              ) : (
                <div className="timeline">
                  {schedules
                    .filter((v) => !["done", "cancelled"].includes(v.status))
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
                        {v.status === "failed" && <div className="schedule-recovery"><p role="status">{v.command_message || "작업기에서 처리하지 못했습니다. 계정 상태를 확인하세요."}</p><button className="text-button" disabled={p.stale} onClick={() => openSchedule(v)}>다시 예약</button><button className="text-button" onClick={() => updateSchedule(v.id,"cancelled")}>기록 닫기</button></div>}
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
              <div className="timeline">{accounts.filter(v => !a || a.id === v.id).map(v => <button className="timeline-item" key={v.id} onClick={() => p.select(v.id)}><CalendarDays size={18}/><div><strong>{v.number}번 · {v.name}</strong><span>{date(nextSubmission(s,v.id))}</span></div><ChevronRight size={16}/></button>)}</div>
              <h3 className="section-title">실제 제출 · 예상 심사</h3>
              <div className="timeline">
                {[...s.calendar]
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
              {(historyRows.length > 0 || nextCursor) && <details className="history"><summary>완료·취소 기록{p.data.scheduleHistory ? ` · 전체 ${n(p.data.scheduleHistory.total)}건` : ""}</summary>{historyRows.map(v => <p key={v.id}><span>{v.account_id}번 · {v.title}<small>{date(v.due_at,true)}</small></span><span>{v.status === "done" ? "완료" : "취소"}</span></p>)}{nextCursor && <button className="button secondary full" disabled={historyBusy} onClick={() => void loadHistory()}>{historyBusy ? "불러오는 중…" : "이전 기록 더 보기"}</button>}</details>}

            </>
          )}
          {p.panel === "alerts" && (
            <>
              {p.stale && (
                <div className="issue-message danger">
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
                        {v.number}번 · {v.name}
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
                      {v.status === "failed" && <button className="text-button" disabled={p.stale} onClick={() => { setError(""); setConfirm({ id:crypto.randomUUID(), action:v.action, payload:v.payload, title:"지시 다시 보내기", description:v.message || "원본 작업실에서 원인을 해결한 뒤 같은 지시를 다시 보냅니다." }); }}>재시도</button>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">아직 내린 지시가 없습니다.</p>
              )}
            </>
          )}
          {p.panel === "activity" && <>
            <div className="split"><span className="muted">최근 {n(s.recent.length)}건 기준</span><button className="text-button" onClick={p.onAcknowledge}>여기까지 확인 <Check size={16}/></button></div>
            <div className="timeline">{[...s.recent].sort((x,y)=>y.recorded_at.localeCompare(x.recorded_at)).map(v => <button className={"timeline-item actual-event " + (Date.parse(v.recorded_at)>p.activitySince ? "unread" : "")} key={v.id} onClick={()=>p.select(v.accountId)}><span className="timeline-dot"/><div><small>{date(v.recorded_at,true)} · {v.accountId}번</small><strong>{statuses[v.state] || "상태 변경"}</strong><span>{v.title}</span></div><ChevronRight size={16}/></button>)}</div>
            {!s.recent.length && <Empty>기록된 변화가 없습니다.</Empty>}
          </>}
          {p.panel === "automation" && (
            <>
              {p.activeProcess && <div className="process-focus"><Factory size={18}/><strong>{({generation:"제작소",review:"검수소",stock:"재고 창고",submission:"제출대"}[p.activeProcess])}</strong><span>{p.activeProcess === "generation" ? `${n(accounts.reduce((sum,v)=>sum+v.inProgress,0))}개 제작 중` : p.activeProcess === "review" ? `${n(s.assets.filter(v=>v.state === "generated").length)}개 검수 대기 · ${laneCondition(s.automation.lanes.review,s.automation.productionEnabled).label}` : p.activeProcess === "submission" ? upload.label : `${n(accounts.reduce((sum,v)=>sum+v.ready,0))}개 제출 가능`}</span></div>}
              {p.activeProcess === "review" && <div className="process-focus"><strong>메타데이터</strong><span>{laneCondition(s.automation.lanes.metadata,s.automation.productionEnabled).label}</span></div>}
              <div className={"command-progress " + upload.tone}><strong>제출 작업기 · {upload.label}</strong><span>{upload.detail}</span><small>상태 관측 {date(s.automation.statusObservedAt || s.automation.lastPollAt,true)}</small></div>
              {[
                [
                  "production",
                  "이미지 제작",
                  s.automation.productionEnabled,
                  Factory,
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
                    <button
                      className={"switch " + (enabled ? "on" : "")}
                      role="switch"
                      aria-label={String(label)}
                      aria-checked={Boolean(enabled)}
                      disabled={p.stale || p.data.commands.some(v => v.action === "automation" && v.payload.lane === lane && v.status === "queued")}
                      onClick={() => toggle(String(lane), !enabled)}
                    >
                      <span />
                    </button>
                  </div>
                );
              })}
              {p.data.commands.filter(v=>v.action === "automation").slice(0,2).map(v=><div className={"command-progress " + v.status} key={v.id}><strong>{v.payload.lane === "upload" ? "제출" : "제작"} 설정 · {v.status === "queued" ? "지시 대기" : v.status === "failed" ? "실패" : "반영"}</strong><span>{v.message || "작업기에서 처리할 때까지 기다립니다."}</span><small>{date(v.updated_at || v.created_at,true)}</small></div>)}
              <div className="detail-lines">
                <div>
                  <span>계정 간격</span>
                  <strong>{s.automation.intervalSeconds / 60}분</strong>
                </div>
                <div>
                  <span>마지막 운영</span>
                  <strong>{date(s.automation.lastRunAt, true)}</strong>
                </div>
                <div>
                  <span>다음 순회</span>
                  <strong>{date(s.automation.nextAt, true)}</strong>
                </div>
              </div>
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
              <div className="automation-row">
                <Layers3 size={23} />
                <div>
                  <strong>움직임 줄이기</strong>
                  <span>운영 상태는 계속 갱신됩니다.</span>
                </div>
                <button
                  className={"switch " + (p.reduced ? "on" : "")}
                  role="switch"
                  aria-label="움직임 줄이기"
                  aria-checked={p.reduced}
                  onClick={() => p.setReduced(!p.reduced)}
                >
                  <span />
                </button>
              </div>
              {p.canLogout && (
                <button
                  className="button secondary full"
                  style={{ marginTop: 24 }}
                  onClick={() => p.logout().catch((e) => p.toast(e.message))}
                >
                  로그아웃
                </button>
              )}
            </>
          )}
          {p.panel === "businesses" && (
            <>
              <button
                className="business-row selected"
                onClick={() => p.open("accounts")}
              >
                <span className="business-icon">
                  <Image size={23} />
                </span>
                <div>
                  <strong>미리캔버스</strong>
                  <span>13개 작업동 · 연결됨</span>
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
              <button
                className="button secondary full"
                onClick={() => {
                  setError("");
                  setAddBusiness(true);
                }}
              >
                <Plus size={18} />
                사업 등록
              </button>
            </>
          )}
        </div>
        {p.panel === "account" && a && (
          <div className="panel-actions panel-footer">
            <button className="button secondary" onClick={() => openSchedule()}>
              <CalendarDays size={17} />
              일정 추가
            </button>
            <button
              className="button primary"
              disabled={p.stale || accountPending || busy}
              onClick={() => makeRecheck(a)}
            >
              <RefreshCw size={17} />
              {accountPending ? "지시 대기" : accountCommand?.status === "failed" ? "다시 재확인" : "재확인"}
            </button>
          </div>
        )}
      </aside>
      {schedule && (
        <Modal title="일정 추가" onClose={() => !busy && setSchedule(false)}>
          <form
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
                p.toast("일정을 저장했습니다.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              작업동
              <select name="account" value={draft.account} onChange={e=>setDraft({...draft,account:e.target.value})}>
                {accounts.map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.number}번 · {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              할 일
              <input
                name="title"
                value={draft.title}
                onChange={e=>setDraft({...draft,title:e.target.value})}
                placeholder="다음 제출분 20개 확인"
                required
                maxLength={100}
              />
            </label>
            <label>
              일시 <span className="muted">한국 시간</span>
              <input
                name="due"
                type="datetime-local"
                required
                value={draft.due}
                onChange={e=>setDraft({...draft,due:e.target.value})}
              />
            </label>
            <label>
              처리
              <select name="kind" value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value})}>
                <option value="memo">직접 할 일</option>
                <option value="recheck">작업기에 계정 재확인 요청</option>
              </select>
            </label>
            <p className="form-help">
              재확인은 예약 시각 이후 기존 운영 순서로 처리합니다. 실제 제출
              완료와 구분됩니다.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button disabled={busy} className="button primary full">
              {busy ? "저장 중…" : "일정 저장"}
            </button>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal title={confirm.title} onClose={() => !busy && setConfirm(null)}>
          <p className="confirm-description">{confirm.description}</p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setConfirm(null)}
              disabled={busy}
            >
              취소
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => execute(confirm.action, confirm.payload)}
            >
              {busy ? "전달 중…" : "지시 보내기"}
            </button>
          </div>
        </Modal>
      )}
      {addBusiness && (
        <Modal title="사업 등록" onClose={() => !busy && setAddBusiness(false)}>
          <form
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
                p.toast("사업을 등록했습니다. 데이터 연결은 아직 없습니다.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              사업 이름
              <input
                name="name"
                required
                maxLength={40}
                placeholder="YouTube"
              />
            </label>
            <label>
              종류
              <select name="kind" defaultValue="video">
                <option value="video">영상</option>
                <option value="game">게임</option>
                <option value="art">그림 · 멤버십</option>
                <option value="blog">블로그</option>
                <option value="other">기타</option>
              </select>
            </label>
            <label>
              메모
              <input
                name="note"
                maxLength={300}
                placeholder="연결할 작업실 또는 운영 메모"
              />
            </label>
            <p className="form-help">
              사업을 목록에 등록합니다. 수량과 자동화는 별도 연동 후 표시됩니다.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? "저장 중…" : "등록"}
            </button>
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
            <p className="form-help">
              {p.data.previewFailures?.includes(activeAsset.id) ? "미리보기를 가져오지 못했습니다." : p.stale
                ? "작업기가 다시 연결되면 미리보기를 가져옵니다."
                : "작업실에서 이 그림의 미리보기를 가져오는 중입니다."}
            </p>
          )}
          {p.data.previewFailures?.includes(activeAsset.id) && <button className="button secondary full" disabled={p.stale || busy} onClick={async()=> { setBusy(true); try { await post("/previews",{ids:[activeAsset.id],retry:true}); await p.refresh(); p.toast("미리보기를 다시 요청했습니다."); } catch(e) {p.toast((e as Error).message);} finally {setBusy(false);} }}>미리보기 다시 가져오기</button>}
          {assetReason(activeAsset) && <p className="asset-reason">{assetReason(activeAsset)}</p>}
          <div className="detail-lines">
            <div>
              <span>작업동</span>
              <strong>{activeAsset.accountId}번</strong>
            </div>
            <div>
              <span>상태</span>
              <strong>
                {assetStatus(activeAsset)}
              </strong>
            </div>
            <div>
              <span>계정 배정</span>
              <strong>
                {activeAsset.owned ? "이 계정 소유" : "다른 계정 또는 미배정"}
              </strong>
            </div>
          </div>
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
