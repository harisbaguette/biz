import { Component, Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import { ArrowRight, CalendarDays, ChevronRight, Check, Factory, Focus, Info, KeyRound, Package, RefreshCw, ScanLine, Settings2, TriangleAlert, X } from "./ui/Icons";
import { Button, Input } from "./design-system/components";
import { retryWorldModule } from "./world-loader";
import { Panels } from "./ui/Panels";
import { IconButton, Modal } from "./ui/Primitives";
import { date, n, isIssue, isStale, laneCondition, normalizedSnapshot, uploadCondition, status, post, request, outstandingFailures } from "./data";
import type { Layer, Panel, WorldData } from "./types";
import type { RevenueLedger } from "./finance-types";
import type { WorldHandle } from "./world/World";
import { processState, commandObservation } from "./game-state";
import { flowTotals } from "./operations-state";
import { accountCycle } from "./owner-cycle";

const InitialWorld = lazy(() => import("./world/World"));
type Process = "generation" | "review" | "stock" | "submission" | "inspection" | "archive" | "revenue";
const processNames: Record<Process, string> = { generation: "생산 공장", review: "제작 검수", stock: "제출할 그림", submission: "제출 운송", inspection: "심사대", archive: "승인·공개", revenue: "월별 수익" };
class WorldBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export default function App() {
  const [auth, setAuth] = useState<boolean | null>(null), [data, setData] = useState<WorldData | null>(null), [error, setError] = useState("");
  const [panel, setPanel] = useState<Panel>(null), [selected, setSelected] = useState<string | null>(null);
  const [activeProcess, setActiveProcess] = useState<Process | null>(null);
  const layer: Layer = "status";
  const [inventory, setInventory] = useState({ query: "", filter: "ready", page: 0 });
  const [World, setWorld] = useState(() => InitialWorld), [worldAttempt, setWorldAttempt] = useState(0), [ready, setReady] = useState(false);
  const [revenue, setRevenue] = useState<RevenueLedger | null>(null), [revenueError, setRevenueError] = useState<string | null>(null);
  const [revenueAccountId, setRevenueAccountId] = useState<string | null>(null);
  const revenuePolling = useRef(false);
  const revenueYear = useRef(Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Seoul" }).format(new Date())));
  const [localMode, setLocalMode] = useState(true), [refreshing, setRefreshing] = useState(false);
  const [safeTop, setSafeTop] = useState(68), [safeBottom, setSafeBottom] = useState(84);
  const [compactText, setCompactText] = useState(false);
  const [activitySince, setActivitySince] = useState(() => Number(localStorage.getItem("biz-activity-seen")) || Date.now() - 86400000);
  const [reduced, setReduced] = useState(() => localStorage.getItem("biz-reduced") === "true" || matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; title: string; description: string; action: string; payload: Record<string, unknown> } | null>(null);
  const [sending, setSending] = useState(false), [commandError, setCommandError] = useState("");
  const world = useRef<WorldHandle>(null), polling = useRef(false), lastFocus = useRef<HTMLElement | null>(null), toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string, tone: "success" | "error" | "info" = "info") => {
    setToast({ message, tone }); if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const refresh = useCallback(async () => {
    if (polling.current) return; polling.current = true; setRefreshing(true);
    try { const value = await request<WorldData>("/world"); setData({ ...value, snapshot: value.snapshot ? normalizedSnapshot(value.snapshot) : null }); setError(""); }
    catch (e) { if ((e as Error & { status?: number }).status === 401) { setAuth(false); setData(null); } setError((e as Error).message); }
    finally { polling.current = false; setRefreshing(false); }
  }, []);
  const refreshRevenue = useCallback(async () => {
    if (revenuePolling.current) return; revenuePolling.current = true;
    try { const value = await request<RevenueLedger>("/revenue?year=" + revenueYear.current); if (value.year === revenueYear.current) { setRevenue(value); setRevenueError(null); } }
    catch (e) { setRevenueError((e as Error).message); }
    finally { revenuePolling.current = false; }
  }, []);
  const revenueChanged = useCallback((value: RevenueLedger) => { revenueYear.current = value.year; setRevenue(value); setRevenueError(null); }, []);
  const refreshSession = useCallback(() => request<{ authenticated: boolean; local: boolean }>("/session").then(v => { setAuth(v.authenticated); setLocalMode(v.local); setError(""); }).catch(() => setError("서버에 연결하지 못했습니다.")), []);
  useEffect(() => { void refreshSession(); }, [refreshSession]);
  useEffect(() => {
    if (!auth) return;
    void refresh(); void refreshRevenue(); const timer = setInterval(() => { if (!document.hidden) { void refresh(); void refreshRevenue(); } }, 30000);
    const visible = () => { if (!document.hidden) { void refresh(); void refreshRevenue(); } }; document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [auth, refresh, refreshRevenue]);
  const wasPanelOpen = useRef(false);
  const close = useCallback(() => setPanel(null), []);
  useEffect(() => {
    const closing = wasPanelOpen.current && !panel;
    wasPanelOpen.current = !!panel;
    if (!closing) return;
    const frame = requestAnimationFrame(() => {
      const previous = lastFocus.current;
      if (previous?.isConnected && previous.getClientRects().length && !previous.closest(".panel,[inert]")) previous.focus({ preventScroll: true });
      else (document.querySelector<HTMLButtonElement>(".game-tray button") || document.querySelector<HTMLButtonElement>("#main-tools button"))?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [panel]);
  const open = (next: Panel) => { setPanel(next); };
  const s = data?.snapshot, stale = isStale(s || null) || !!error;
  const account = s?.accounts.find(a => a.id === selected) || null;
  const cycle = account && s ? accountCycle(account, s, stale, { schedules: data?.schedules }) : null;
  const trayOpen = !!(account || activeProcess);
  useLayoutEffect(() => {
    const tray = document.querySelector<HTMLElement>(".game-tray");
    const hud = document.querySelector<HTMLElement>(".game-hud");
    const dock = document.querySelector<HTMLElement>(".command-dock");
    const app = document.querySelector<HTMLElement>(".game-shell");
    const measure = () => {
      // Use actual text metrics: container-query em/rem values can remain stale
      // when large browser text is applied before the game first mounts.
      const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
      setCompactText(!!app && app.clientWidth <= 22 * fontSize);
      setSafeTop(hud ? Math.ceil(hud.getBoundingClientRect().bottom + 12) : 68);
      setSafeBottom(tray && !panel && window.innerWidth < 768 ? Math.ceil(window.innerHeight - tray.getBoundingClientRect().top + 10) : dock && !dock.hidden ? Math.ceil(window.innerHeight - dock.getBoundingClientRect().top + 10) : 84);
    };
    measure();
    const observer = new ResizeObserver(measure); if (tray) observer.observe(tray);
    if (hud) observer.observe(hud);
    if (dock) observer.observe(dock);
    if (app) observer.observe(app);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [trayOpen, panel, ready, !!s]);
  const rememberAccountFocus = (id: string) => { lastFocus.current = [...document.querySelectorAll<HTMLButtonElement>("[data-account]")].find(button => button.dataset.account === id) || null; };
  const select = (id: string) => {
    rememberAccountFocus(id);
    setPanel(null); setActiveProcess(null); setSelected(id || null); setInventory(v => ({ ...v, page: 0 }));
    if (id) { setRevenueAccountId(id); world.current?.focus(id); }
  };
  const inspectAccount = (id: string, area: "review" | "schedule" | "stock" | "archive" | "account") => {
    rememberAccountFocus(id);
    setSelected(id); setRevenueAccountId(id); setActiveProcess(null);
    if (["review", "stock", "archive"].includes(area)) {
      setInventory(v => ({ ...v, filter: area === "review" ? "review" : area === "archive" ? "archive" : "ready", page: 0 }));
      setPanel("inventory");
    } else setPanel(area === "schedule" ? "schedule" : "account");
  };
  const inspectProcess = (key: Process) => {
    lastFocus.current = document.querySelector<HTMLButtonElement>(`[data-process="${key}"]`) || lastFocus.current;
    setActiveProcess(key); world.current?.focusProcess(key);
    if (key === "revenue") { setPanel("revenue"); return; }
    if (account && ["stock", "inspection", "archive"].includes(key)) {
      setInventory(v => ({ ...v, filter: key === "inspection" ? "review" : key === "archive" ? "archive" : "ready", page: 0 }));
      setPanel("inventory"); return;
    }
    setPanel(null); setSelected(null);
  };
  const dismissTray = () => { setSelected(null); setActiveProcess(null); world.current?.reset(); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key !== "Escape" || document.querySelector("dialog[open]")) return; if (panel) close(); else { setSelected(null); setActiveProcess(null); world.current?.reset(); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [panel, close]);
  const flows = s ? flowTotals(s) : null;
  const total = s && flows ? {
    ready: s.accounts.reduce((sum, a) => sum + a.ready, 0),
    target: s.accounts.reduce((sum, a) => sum + a.target, 0),
    progress: s.accounts.reduce((sum, a) => sum + a.inProgress, 0),
    review: flows.inspection,
    archived: flows.archived,
  } : null;
  const issues = s?.accounts.filter(isIssue) || [];
  const failures = data ? outstandingFailures(data) : { commands: [], schedules: [] };
  const issueCount = issues.length + ["generation", "review", "metadata"].filter(key => s && laneCondition(s.automation.lanes[key], s.automation.productionEnabled).issue).length + (s && uploadCondition(s).issue ? 1 : 0) + failures.commands.length + failures.schedules.length;
  const processHealth = s && activeProcess ? processState(activeProcess, s, stale) : { label: "연결 확인 필요", tone: "unknown" };
  const command = account && data?.commands.find(c => c.action === "recheck" && String(c.payload.accountId) === account.id);
  const observation = account ? commandObservation(account, command || undefined) : null;
  const waiting = observation?.pending || false;
  const productionPending = !!data?.commands.some(c => c.action === "automation" && c.payload.lane === "production" && c.status === "queued");
  const recheck = () => {
    if (!account || stale || waiting) return;
    setCommandError(""); setConfirm({ id: crypto.randomUUID(), action: "recheck", payload: { accountId: account.id }, title: "계정 재확인", description: `${account.number}번 계정 재확인을 요청합니다. ${cycle?.blocked ? "표시된 원인을 먼저 해결하세요. " : ""}실제 확인은 기존 간격·순서를 따릅니다. 요청 반영은 플랫폼 조회·제출 완료와 별개입니다.` });
  };
  const toggleProduction = () => {
    if (!s || stale || productionPending) return;
    setCommandError(""); const enabled = !s.automation.productionEnabled;
    setConfirm({ id: crypto.randomUUID(), action: "automation", payload: { lane: "production", enabled }, title: enabled ? "제작 재개" : "제작 일시정지", description: enabled ? "이미지 제작 작업을 재개합니다." : "이미 시작한 제작은 마친 뒤 멈춥니다." });
  };
  const sendCommand = async () => {
    if (!confirm || sending || stale) return; setSending(true); setCommandError("");
    try { await post("/commands", { id: confirm.id, action: confirm.action, payload: confirm.payload }); setConfirm(null); notify("지시 접수 · 작업기 반영을 기다립니다.", "success"); await refresh(); }
    catch (e) { setCommandError((e as Error).message); } finally { setSending(false); }
  };
  const retryWorld = () => { setReady(false); setWorld(() => lazy(retryWorldModule)); setWorldAttempt(v => v + 1); };
  const onReady = useCallback(() => setReady(true), []);
  const changeReduced = (value: boolean) => { setReduced(value); localStorage.setItem("biz-reduced", String(value)); };
  const showInventory = (filter = "ready") => { setInventory(v => ({ ...v, filter, page: 0 })); open("inventory"); };
  const showMission = () => { if (stale) { setSelected(null); open("automation"); } else if (issues.length) select(issues[0].id); else { setSelected(null); open("alerts"); } };
  if (auth === false) return <Login onLogin={() => { setAuth(true); setError(""); }} />;
  return <div className={`ds app game-shell ${compactText ? "compact-text" : ""} ${panel ? "has-panel" : ""} ${trayOpen ? "has-tray" : ""} ${reduced ? "reduced-motion" : ""}`} data-style="main" onClickCapture={e => { if (!panel) { const button = (e.target as Element).closest<HTMLButtonElement>("button"); if (button && !button.closest("dialog")) lastFocus.current = button; } }}>
    <a href="#main-tools" className="skip-link">관제 도구로 이동</a>
    {s && data && total ? <>
      <main className="world-stage" aria-busy={!ready} aria-label="미리캔버스 13개 계정 제출·심사 공간" inert={!!panel}>
        <WorldBoundary key={worldAttempt} fallback={<div className="world-recovery"><h2>계정 상태 선택</h2><p>3D 화면을 다시 열거나 목록에서 관리할 수 있습니다.</p><Button onClick={retryWorld}><RefreshCw size={20}/>3D 다시 열기</Button><div className="fallback-accounts">{s.accounts.map(a => <button key={a.id} onClick={() => select(a.id)}><b>{a.number}번 계정</b><span>{status(a)}</span></button>)}</div></div>}>
          <Suspense fallback={<div className="world-loading"><img src="/brand/symbol.svg" alt=""/><span>제작소를 여는 중</span></div>}>
            <World ref={world} snapshot={s} selected={selected} layer={layer} reduced={reduced} stale={stale} onSelect={select} onReady={onReady} commands={data.commands} thumbnails={data.thumbnails} activeProcess={activeProcess} onInspectProcess={inspectProcess} trayOpen={trayOpen && !panel} safeTop={safeTop} safeBottom={safeBottom} schedules={data.schedules} onInspectAccount={inspectAccount} revenue={revenue} revenueAccountId={revenueAccountId} revenueError={revenueError}/>
          </Suspense>
        </WorldBoundary>
      </main>
      <header className="game-hud" inert={!!panel}>
        <div className="game-topline">
          <button className="brand" aria-label="13개 계정 전체 보기" onClick={() => { dismissTray(); close(); }}><img src="/brand/symbol.svg" alt=""/><img className="brand-wordmark" src="/brand/wordmark.svg" alt="BLUEKITE WORKS"/></button>
          <button className={`connection ${stale ? "offline" : ""}`} aria-label={stale ? "작업기 연결 확인" : "상태 수신"} title={`마지막 수신 ${date(s.receivedAt, true)}`} onClick={() => open("automation")}><i className={`signal ${stale ? "unknown" : "active"}`}/><span>{stale ? "연결 확인" : "연결됨"}</span></button>
          <button className={`incident-control ${issueCount || stale ? "has-issue" : ""}`} onClick={showMission} aria-label={`확인할 일 ${stale ? "연결 확인" : issueCount + "건"}`}><TriangleAlert size={22}/><strong>{stale ? "!" : issueCount}</strong></button>
        </div>
      </header>
      <h1 className="sr-only">미리캔버스 · 13개 계정 제출·심사</h1>
      {stale && <button className="mission stale" inert={!!panel} onClick={showMission}><TriangleAlert size={20}/><span>연결 확인 · {date(s.receivedAt, true)}</span><ChevronRight size={16}/></button>}


      {trayOpen && <section className={`game-tray ${account && isIssue(account) ? "warning" : ""}`} aria-label="시설 행동" inert={!!panel}>
        <div className="tray-heading"><div>{cycle && <i aria-hidden="true" className={`signal ${cycle.stale ? "unknown" : cycle.blocked ? "warning" : cycle.tone === "reviewing" ? "active" : "normal"}`}/>}<h2>{account?.name || processNames[activeProcess!]}</h2></div><IconButton label="시설 선택 닫기" onClick={dismissTray}><X size={20}/></IconButton></div>
        <div className="tray-content">{account ? <>
          {cycle && <>
            <button className={`cycle-review ${cycle.reviewCount > 0 ? "occupied" : "vacant"}`} onClick={() => showInventory("review")}><ScanLine size={30}/><strong>{cycle.reviewLabel}</strong><ChevronRight size={18}/></button>
            {cycle.expectedReviewLabel && cycle.reviewCount > 0 && !cycle.blocked && <p className="cycle-expected">{cycle.expectedReviewLabel}</p>}
            {cycle.blocked && <div className="cycle-blocker" role="status"><TriangleAlert size={20}/><span>{cycle.stale ? `마지막 확인: ${cycle.blocker}` : cycle.blocker}</span></div>}
            <button className={`cycle-next ${cycle.blocked ? "blocked" : ""}`} aria-label={`${cycle.submissionPlanOn ? cycle.overviewLabel : cycle.submissionLabel}. ${cycle.nextLabel}`} onClick={() => open("schedule")}><CalendarDays size={22}/><span><strong>{cycle.submissionPlanOn ? cycle.overviewLabel : cycle.submissionLabel}</strong><small>{cycle.nextLabel}</small></span><ChevronRight size={18}/></button>
            {cycle.submissionPlanOn && <p className="cycle-plan">제출 {cycle.overviewPlanLabel} <span>(실행 예약 아님)</span></p>}
            {cycle.expectedReviewLabel && cycle.reviewCount > 0 && cycle.blocked && <p className="cycle-expected">{cycle.expectedReviewLabel}</p>}
            {observation && <p className="cycle-command">{observation.label}</p>}
            <div className="cycle-supplies"><button onClick={() => showInventory("ready")}><Package size={18}/><span>제출할 그림 {n(cycle.ready)}</span></button><button onClick={() => showInventory("archive")}><Check size={18}/><span>승인·공개 {n(cycle.archived)}</span></button><button aria-label={`${account.number}번 계정 상세와 복구`} onClick={() => open("account")}><Info size={18}/></button></div>
          </>}
        </> : <>
          <div className="tray-status"><i className={`signal ${processHealth.tone}`}/><span>{(stale ? `연결 확인 · 수신 ${date(s.receivedAt, true)}` : processHealth.label)}</span></div>
          <div className="tray-process-summary">{activeProcess === "generation" ? <><Factory size={30}/><strong>{n(total.progress)}</strong><span>제작 중</span></> : activeProcess === "review" ? <><ScanLine size={30}/><strong>{n(s.assets.filter(a => a.phase === "quarantined").length)}</strong><span>보류·확인</span></> : activeProcess === "stock" ? <><Package size={30}/><strong>{n(total.ready)}</strong><span>/ 비축 목표 {n(total.target)}</span></> : activeProcess === "inspection" ? <><ScanLine size={30}/><strong>{n(total.review)}</strong><span>심사 중 · 실제 관측</span></> : activeProcess === "archive" ? <><Package size={30}/><strong>{n(total.archived)}</strong><span>승인·공개 · 실제 관측</span></> : activeProcess === "revenue" ? <><CalendarDays size={30}/><span>계정별 12개월 수익 기록</span></> : <><CalendarDays size={30}/><strong>{data.schedules.filter(v => v.status === "planned").length}</strong><span>메모·재확인 요청 일정</span></>}</div>

        </>}</div>
        {account ? <div className="tray-actions owner-actions"><Button variant="outline" disabled={stale || waiting || sending} onClick={recheck}><RefreshCw size={19}/>{waiting ? "지시 대기" : "계정 재확인"}</Button><Button disabled={sending || stale && cycle?.action !== "automation"} onClick={() => { if (!cycle) return; if (cycle.action === "review") showInventory("review"); else open(cycle.action === "schedule" ? "schedule" : cycle.action === "automation" ? "automation" : "account"); }}>{cycle?.actionLabel || "계정 상태 확인"}</Button></div> : <div className="tray-actions">{activeProcess === "generation" ? <><Button variant="outline" onClick={() => open("automation")}>자동화 설정</Button><Button disabled={stale || productionPending} onClick={toggleProduction}>{productionPending ? "지시 대기" : s.automation.productionEnabled ? "생산 멈춤" : "생산 재개"}</Button></> : activeProcess === "review" ? <><Button variant="outline" onClick={() => open("automation")}>검수 상태</Button><Button onClick={() => showInventory("hold")}>검수함 열기</Button></> : activeProcess === "stock" ? <><Button variant="outline" onClick={() => { setSelected(null); open("accounts"); }}>계정 선택</Button><Button onClick={() => showInventory()}>제출할 그림</Button></> : activeProcess === "inspection" ? <><Button variant="outline" onClick={() => open("schedule")}>다음 일정</Button><Button onClick={() => showInventory("review")}>심사 중 보기</Button></> : activeProcess === "archive" ? <><Button variant="outline" onClick={() => showInventory("approved")}>승인 보관</Button><Button onClick={() => showInventory("published")}>공개 보관</Button></> : activeProcess === "revenue" ? <><Button variant="outline" onClick={() => open("accounts")}>계정 선택</Button><Button onClick={() => open("revenue")}>수익 기록부</Button></> : <><Button variant="outline" onClick={() => open("automation")}>제출 자동화</Button><Button onClick={() => open("schedule")}>다음 일정</Button></>}</div>}
      </section>}
      <nav id="main-tools" className="command-dock" tabIndex={-1} hidden={trayOpen} aria-label="관제 도구" inert={!!panel || trayOpen}>
        <button onClick={() => { dismissTray(); world.current?.reset(); }}><Focus size={26}/><span>전체 보기</span></button>
        <button onClick={() => { setSelected(null); open("schedule"); }}><CalendarDays size={26}/><span>다음 일정</span></button>
        <button onClick={() => { setSelected(null); open("activity"); }}><ScanLine size={26}/><span>제출·심사 이력</span></button>
        <button onClick={() => open("automation")}><Settings2 size={26}/><span>자동화 설정</span></button>
      </nav>
      {panel && <button className="panel-backdrop" aria-label="단지로 돌아가기" onClick={close}/>}
      <Panels panel={panel} data={data} selected={account} stale={stale} close={close} select={select} open={setPanel} refresh={refresh} toast={notify} reduced={reduced} setReduced={changeReduced} inventory={inventory} setInventory={setInventory} activitySince={activitySince} onAcknowledge={() => { const now = Date.now(); setActivitySince(now); localStorage.setItem("biz-activity-seen", String(now)); }} activeProcess={activeProcess} clearScope={() => setSelected(null)} viewControls={{ reset: () => { close(); dismissTray(); }, zoom: delta => { close(); setSelected(null); setActiveProcess(null); requestAnimationFrame(() => requestAnimationFrame(() => world.current?.zoom(delta))); } }} onRevenueChanged={revenueChanged} onRevenueAccountChange={setRevenueAccountId} revenueYear={revenue?.year ?? revenueYear.current} revenueAccountId={revenueAccountId} canLogout={!localMode} logout={async () => { await post("/logout", {}); setData(null); setPanel(null); setAuth(false); }}/>
    </> : <main className="connection-screen"><img src="/brand/symbol.svg" alt=""/><h1>{error ? "연결을 확인해 주세요" : auth === null ? "단지에 연결하는 중" : "작업기 연결을 기다립니다"}</h1><p>{error || "미리캔버스 상태가 도착하면 단지가 열립니다."}</p><Button onClick={() => { if (auth === null) void refreshSession(); else void refresh(); }}><RefreshCw size={20}/>다시 확인</Button></main>}
    {confirm && <Modal title={confirm.title} onClose={() => { if (!sending) setConfirm(null); }}><p className="confirm-description">{confirm.description}</p>{commandError && <p className="form-error" role="alert">{commandError}</p>}{stale && <p className="form-error">작업기 연결을 확인한 뒤 지시할 수 있습니다.</p>}<div className="modal-actions"><Button variant="outline" disabled={sending} onClick={() => setConfirm(null)}>취소</Button><Button loading={sending} disabled={sending || stale} onClick={() => void sendCommand()}>지시 보내기</Button></div></Modal>}
    {toast && <div className={`toast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>{toast.tone === "error" ? <TriangleAlert size={22}/> : toast.tone === "success" ? <Check size={22}/> : <Info size={22}/>}<span>{toast.message}</span></div>}
    {error && s && <div className="network-error" role="alert"><span>{error}</span><button onClick={() => void refresh()}>다시 연결</button></div>}
    {refreshing && <span className="sr-only" role="status">상태 갱신 중</span>}
  </div>;
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  return <div className="ds login game-login" data-style="main"><div className="login-brand"><img src="/brand/logo-stacked.svg" alt="BLUEKITE WORKS"/></div><form onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); setBusy(true); setError(""); try { await post("/login", { password: new FormData(e.currentTarget).get("password") }); onLogin(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><span className="login-icon"><KeyRound size={32}/></span><h1>BLUEKITE WORKS</h1><label>접속 암호<Input name="password" type="password" required autoComplete="current-password"/></label>{error && <p className="form-error" role="alert">{error}</p>}<Button className="full" loading={busy} disabled={busy} type="submit">{busy ? "확인 중…" : "관제 시작"}<ArrowRight size={20}/></Button></form><span className="login-caption">BLUEKITE WORKS</span></div>;
}
