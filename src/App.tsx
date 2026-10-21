import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  Component,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Layers3,
  Move3D,
  Factory,
  Focus,
  KeyRound,
  Minus,
  Package,
  Plus,
  RefreshCw,
  RotateCw,
  Settings2,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { retryWorldModule } from "./world-loader";
import { Panels } from "./ui/Panels";
import { IconButton } from "./ui/Primitives";
import {
  date,
  isIssue,
  isStale,
  laneCondition,
  normalizedSnapshot,
  uploadCondition,
  severity,
  status,
  post,
  request,
  outstandingFailures,
} from "./data";
import type { Account, Layer, Panel, WorldData } from "./types";
import type { WorldHandle } from "./world/World";
const InitialWorld = lazy(() => import("./world/World"));
type Process = "generation" | "review" | "stock" | "submission";
class WorldBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function WorldFallback({ accounts, select, retry }: { accounts: Account[]; select: (id: string) => void; retry: () => void }) {
  return <div className="world-recovery" role="region" aria-label="작업동 목록 보기">
    <div className="world-recovery-heading"><span>3D 화면을 불러오지 못했습니다.</span><button className="button secondary" onClick={retry}><RefreshCw size={16} />3D 다시 열기</button></div>
    <div className="fallback-accounts">{accounts.map(a => <button key={a.id} onClick={() => select(a.id)}><span className={"signal " + severity(a)} /><b>{String(a.number).padStart(2,"0")} · {a.name}</b><small>{status(a)}</small></button>)}</div>
  </div>;
}
export default function App() {
  const [auth, setAuth] = useState<boolean | null>(null),
    [data, setData] = useState<WorldData | null>(null),
    [error, setError] = useState(""),
    [panel, setPanel] = useState<Panel>(null),
    [selected, setSelected] = useState<string | null>(null),
    [inventory, setInventory] = useState({ query: "", filter: "ready", page: 0 }),
    [World, setWorld] = useState(() => InitialWorld),
    [worldAttempt, setWorldAttempt] = useState(0),
    [activeProcess, setActiveProcess] = useState<Process | null>(null),
    [activitySince, setActivitySince] = useState(() => {
      const saved = Number(localStorage.getItem("biz-activity-seen"));
      return Number.isFinite(saved) && saved > 0 ? saved : Date.now() - 86400000;
    }),
    [localMode, setLocalMode] = useState(true),
    [layer, setLayer] = useState<Layer>("status"),
    [mapControl, setMapControl] = useState<"camera" | "layer" | null>(null),
    [ready, setReady] = useState(false),
    [toast, setToast] = useState(""),
    [refreshing, setRefreshing] = useState(false),
    [reduced, setReduced] = useState(
      () =>
        localStorage.getItem("biz-reduced") === "true" ||
        matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [time, setTime] = useState(Date.now());
  const world = useRef<WorldHandle>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    polling = useRef(false),
    lastFocus = useRef<HTMLElement | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }, []);
  const refresh = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    setRefreshing(true);
    try {
      const value = await request<WorldData>("/world");
      setData({ ...value, snapshot: value.snapshot ? normalizedSnapshot(value.snapshot) : null });
      setError("");
    } catch (e) {
      if ((e as Error & { status?: number }).status === 401) {
        setAuth(false);
        setData(null);
      }
      setError((e as Error).message);
    } finally {
      polling.current = false;
      setRefreshing(false);
    }
  }, []);
  const refreshSession = useCallback(() =>
    request<{ authenticated: boolean; local: boolean }>("/session")
      .then((v) => {
        setAuth(v.authenticated);
        setLocalMode(v.local);
        setError("");
      })
      .catch(() => setError("관제 서버에 연결하지 못했습니다.")), []);
  useEffect(() => { void refreshSession(); }, [refreshSession]);
  useEffect(() => {
    if (!auth) return;
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
      setTime(Date.now());
    }, 30000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [auth, refresh]);
  const close = useCallback(() => {
    setPanel(null);
    setMapControl(null);
    requestAnimationFrame(() => {
      if (lastFocus.current?.isConnected) lastFocus.current.focus();
      else
        document
          .querySelector<HTMLButtonElement>("#main-tools button")
          ?.focus();
    });
  }, []);
  const open = (next: Panel) => {
    lastFocus.current = document.activeElement as HTMLElement;
    setPanel(next === panel ? null : next);
    setActiveProcess(null);
  };
  const select = (id: string) => {
    setActiveProcess(null);
    setInventory(v => ({ ...v, page: 0 }));
    if (!id) {
      setSelected(null);
      return;
    }
    if (!document.activeElement?.closest(".panel"))
      lastFocus.current = document.activeElement as HTMLElement;
    setSelected(id);
    setPanel("account");
    if (window.innerWidth > 850) world.current?.focus(id);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]"))
        close();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [close]);
  const changeReduced = (value: boolean) => {
    setReduced(value);
    localStorage.setItem("biz-reduced", String(value));
  };
  const s = data?.snapshot,
    stale = isStale(s || null) || !!error,
    account = s?.accounts.find((a) => a.id === selected) || null;
  const total = s?.accounts.reduce(
    (out, a) => ({
      ready: out.ready + a.ready,
      review: out.review + (a.counts.submitted || 0),
      published: out.published + (a.counts.published || 0),
    }),
    { ready: 0, review: 0, published: 0 },
  );
  const issues = s?.accounts.filter(isIssue) || [];
  const laneIssues = Object.values(s?.automation.lanes || {}).filter(
    (l) => laneCondition(l, !!s?.automation.productionEnabled).issue,
  ).length;
  const failures = data ? outstandingFailures(data) : { commands: [], schedules: [] };
  const issueCount = issues.length + laneIssues + (s && uploadCondition(s).issue ? 1 : 0) + failures.commands.length + failures.schedules.length;
  const changes = (s?.recent || []).filter(event => Date.parse(event.recorded_at) > activitySince);
  const inspectProcess = (key: Process) => {
    lastFocus.current = document.activeElement as HTMLElement;
    setSelected(null);
    setActiveProcess(key);
    if (key === "stock") {
      setInventory(v => ({ ...v, filter: "ready", page: 0 }));
      setPanel("inventory");
    } else setPanel(key === "submission" ? "schedule" : "automation");
  };
  const retryWorld = () => {
    setWorld(() => lazy(retryWorldModule));
    setWorldAttempt(value => value + 1);
  };
  const today = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(time);
  const onReady = useCallback(() => setReady(true), []);
  if (auth === false)
    return (
      <Login
        onLogin={() => {
          setAuth(true);
          setError("");
        }}
      />
    );
  return (
    <div
      className={`app ${panel ? "has-panel" : ""} ${reduced ? "reduced-motion" : ""}`}
    >
      <a href="#main-tools" className="skip-link">
        관제 메뉴로 이동
      </a>
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" />
          <span>BLUEKITE</span>
        </div>
        <span className="header-divider" />
        <button
          className="business-picker"
          onClick={() => open("businesses")}
          aria-expanded={panel === "businesses"}
        >
          <span>미리캔버스</span>
          <ChevronDown size={16} />
        </button>
        <div className="topbar-right">
          <span className="today">{today}</span>
          <button
            className={"connection " + (stale ? "offline" : "")}
            onClick={() => open("automation")}
            title={s ? `마지막 수신 ${date(s.receivedAt, true)}` : "연결 중"}
          >
            <i className={"signal " + (stale ? "unknown" : "active")} />
            <span>{!s ? "연결 중" : stale ? "연결 확인" : "상태 수신"}</span>
          </button>
          <IconButton
            label="상태 새로고침"
            className={refreshing ? "spinning" : ""}
            onClick={() => void refresh()}
          >
            <RefreshCw size={17} />
          </IconButton>
        </div>
      </header>
      {s && data && total ? (
        <>
          <main className="world-stage" data-scene-ready={ready} aria-label="미리캔버스 사업 단지" onPointerDown={e => { if (!(e.target as HTMLElement).closest(".map-tools")) setMapControl(null); }}>
            <WorldBoundary key={worldAttempt} fallback={<WorldFallback accounts={s.accounts} select={select} retry={retryWorld} />}>
            <Suspense
              fallback={
                <div className="world-loading">
                  <span className="loader" />
                  단지를 준비하는 중
                </div>
              }
            >
              <World
                ref={world}
                snapshot={s}
                selected={selected}
                layer={layer}
                reduced={reduced}
                stale={stale}
                onSelect={select}
                onReady={onReady}
                commands={data.commands}
                thumbnails={data.thumbnails}
                activeProcess={activeProcess}
                onInspectProcess={inspectProcess}
              />
            </Suspense>
            </WorldBoundary>
            <div className="world-title">
              <h1>크리에이터 파크</h1>
            </div>
            <button className="activity-peek" onClick={() => { setSelected(null); open("activity"); }} aria-expanded={panel === "activity"}>
              <span className={"activity-dot " + (changes.length ? "fresh" : "")} />
              <span>{changes.length ? `최근 변화 ${changes.length}건` : "새 변화 없음"}</span>
              <ChevronRight size={15} />
            </button>
            <div className="map-tools">
              <div className="map-tool-launchers">
                <IconButton label="지도 표시" aria-controls="map-layer-options" aria-expanded={mapControl === "layer"} onClick={() => setMapControl(v => v === "layer" ? null : "layer")}><Layers3 size={19} /></IconButton>
                <IconButton label="시점 조절" aria-controls="map-camera-options" aria-expanded={mapControl === "camera"} onClick={() => setMapControl(v => v === "camera" ? null : "camera")}><Move3D size={19} /></IconButton>
              </div>
              <div id="map-layer-options" hidden={mapControl !== "layer"} className="layer-control" aria-label="지도 표시">
                {(
                  [
                    ["status", "상태"],
                    ["stock", "재고"],
                    ["review", "심사"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    className={layer === key ? "active" : ""}
                    aria-pressed={layer === key}
                    onClick={() => { setLayer(key); setMapControl(null); }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div id="map-camera-options" hidden={mapControl !== "camera"} className="camera-tools">
                <IconButton label="확대" onClick={() => world.current?.zoom(1)}>
                  <Plus size={19} />
                </IconButton>
                <IconButton
                  label="축소"
                  onClick={() => world.current?.zoom(-1)}
                >
                  <Minus size={19} />
                </IconButton>
                <span />
                <IconButton
                  label="시점 회전"
                  onClick={() => world.current?.rotate()}
                >
                  <RotateCw size={18} />
                </IconButton>
                <IconButton
                  label="전체 단지 보기"
                  onClick={() => world.current?.reset()}
                >
                  <Focus size={19} />
                </IconButton>
              </div>
            </div>
            {(issueCount > 0 || stale) && (
              <button
                className={"attention " + (stale ? "stale" : "")}
                onClick={() => open("alerts")}
              >
                {stale ? <WifiOff size={19} /> : <TriangleAlert size={19} />}
                <span>
                  {stale ? "작업기 연결 확인" : `확인할 일 ${issueCount}건`}
                </span>
                <ChevronRight size={17} />
              </button>
            )}
          </main>
          {
            <Panels
              panel={panel}
              data={data}
              selected={account}
              stale={stale}
              close={close}
              select={select}
              open={(p) => {
                setPanel(p);
              }}
              refresh={refresh}
              toast={notify}
              reduced={reduced}
              setReduced={changeReduced}
              inventory={inventory}
              setInventory={setInventory}
              activitySince={activitySince}
              onAcknowledge={() => {
                const now = Date.now();
                setActivitySince(now);
                localStorage.setItem("biz-activity-seen", String(now));
              }}
              activeProcess={activeProcess}
              canLogout={!localMode}
              logout={async () => {
                await post("/logout", {});
                setData(null);
                setPanel(null);
                setAuth(false);
              }}
            />
          }
          <nav id="main-tools" className="dock" aria-label="관제 메뉴">
            <DockButton
              active={panel === "accounts" || panel === "account"}
              onClick={() => open("accounts")}
              icon={<Factory size={21} />}
              label="작업동"
            />
            <DockButton
              active={panel === "inventory"}
              onClick={() => {
                setSelected(null);
                open("inventory");
              }}
              icon={<Package size={21} />}
              label="재고"
            />
            <DockButton
              active={panel === "schedule"}
              onClick={() => { setSelected(null); open("schedule"); }}
              icon={<CalendarDays size={21} />}
              label="일정"
            />
            <span className="dock-divider" />
            <DockButton
              active={panel === "alerts"}
              onClick={() => open("alerts")}
              icon={<TriangleAlert size={21} />}
              label="확인할 일"
            />
            <DockButton
              active={panel === "automation"}
              onClick={() => open("automation")}
              icon={<Settings2 size={21} />}
              label="운영"
            />
          </nav>
        </>
      ) : (
        <main className="connection-screen">
          <div className="connection-art">
            <Factory size={52} strokeWidth={1.2} />
          </div>
          <h1>
            {error
              ? "연결을 확인해 주세요"
              : auth === null
                ? "관제에 연결하는 중"
                : "작업기 연결을 기다립니다"}
          </h1>
          <p>{error || "미리캔버스 상태가 도착하면 단지가 열립니다."}</p>
          <button
            className="button primary"
            onClick={() => {
              if (auth === null)
                void refreshSession();
              else void refresh();
            }}
          >
            <RefreshCw size={17} />
            다시 확인
          </button>
        </main>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckIcon />
          {toast}
        </div>
      )}
      {error && s && (
        <div className="network-error" role="alert">
          {error}
          <button onClick={() => void refresh()}>다시 연결</button>
        </div>
      )}
    </div>
  );
}
function DockButton({
  active,
  onClick,
  icon,
  label,
  badge = 0,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      aria-pressed={active}
      className={"dock-button " + (active ? "active" : "")}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      {badge > 0 && <b>{badge}</b>}
    </button>
  );
}
function CheckIcon() {
  return <span className="toast-check">✓</span>;
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <div className="login-brand">
        <img src="/favicon.svg" alt="" />
        <span>BLUEKITE</span>
      </div>
      <form
        onSubmit={async (e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await post("/login", {
              password: new FormData(e.currentTarget).get("password"),
            });
            onLogin();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="login-icon">
          <KeyRound size={26} />
        </span>
        <h1>사업 단지 입장</h1>
        <label>
          접속 암호
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            autoFocus
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? "확인 중…" : "입장"}
          <ArrowRight size={18} />
        </button>
      </form>
    </div>
  );
}
