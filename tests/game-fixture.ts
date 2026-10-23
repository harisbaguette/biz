import type { Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
// @ts-expect-error The deployed Worker contract runs against a fresh in-memory D1 adapter.
import { api } from "../worker/index.mjs";
// @ts-expect-error SQLite adapter is isolated per test.
import { database } from "./db.mjs";

const ownerCycleSourcePath = new URL("../artifacts/owner-cycle/source-world.json", import.meta.url);
export const hasPrivateOwnerCycleSource = process.env.BIZ_TEST_OWNER_CYCLE_FIXTURE !== "synthetic" && existsSync(ownerCycleSourcePath);
function syntheticOwnerCycleSource() {
  const date = new Date().toISOString();
  const reviewDates = ["2026-10-26","2026-11-02","2026-11-03","2026-11-02","2026-10-30","2026-10-30","2026-10-30","2026-10-30","2026-11-02","2026-11-03","2026-11-03","2026-10-26","2026-10-26"];
  const accounts = Array.from({ length: 13 }, (_, index) => {
    const number = index + 1, blocked = [1, 6, 13].includes(number), vacant = [1, 13].includes(number);
    return { id: String(number), number, name: `${number}번 계정`, style: "기본", account: `test-${number}`, email: null, browser: null,
      bound: true, ready: 40, target: 300, phases: {}, counts: { submitted: vacant ? 0 : 20 }, inProgress: 0, reserved: 0, previewId: null,
      reviewOn: reviewDates[index], reviewDays: 7, reviewBasis: "business",
      capacity: { limit_count: 20, pending: vacant ? 0 : 20, observed_at: date },
      status: blocked ? "blocked" : "review_scheduled",
      message: number === 1 ? "현재 계정의 새 CSV 다운로드를 확인하지 못했습니다."
        : number === 6 ? "한국어 표시로 전환할 언어 항목을 확인하지 못했습니다."
        : number === 13 ? "현재 로그인 이메일이 대상 계정과 다릅니다." : "심사 확인 대기",
      checkedAt: date, lastAttemptAt: date, lastVerifiedAt: null,
      nextCheckAt: new Date(Date.now() + number * 60000).toISOString(), running: false };
  });
  const assets = accounts.flatMap(account => [
    ...Array.from({ length: Number(account.id) === 1 || Number(account.id) === 13 ? 0 : 20 }, (_, i) => ({
      id: `synthetic-${account.id}-submitted-${i + 1}`, title: `작품 ${i + 1}`, accountId: account.id, state: "submitted",
      phase: "submitted", owned: true, eligible: false, keywords: [], updatedAt: date,
    })),
    ...Array.from({ length: 8 }, (_, i) => ({ id: `synthetic-${account.id}-ready-${i + 1}`, title: `준비 그림 ${i + 1}`,
      accountId: account.id, state: "ready", phase: "ready", owned: true, eligible: true, keywords: [], updatedAt: date })),
  ]);
  return { snapshot: { version: 1, observedAt: date, receivedAt: date, accounts, assets, calendar: [], recent: [], automation: {
    enabled: true, productionEnabled: true, runningAccount: null, lastRunAt: date, lastPollAt: date, nextAt: null, intervalSeconds: 1800,
    statusObservedAt: date, runLockActive: false, pollIntervalSeconds: 60, lanes: {}, scan: { pending: [], requestedAt: null },
  } }, schedules: [], scheduleHistory: [], commands: [], businesses: [], thumbnails: [], previewFailures: [] };
}
const ownerCycleSource = hasPrivateOwnerCycleSource
  ? JSON.parse(readFileSync(ownerCycleSourcePath, "utf8"))
  : syntheticOwnerCycleSource();

// Kept as test-fixture aliases for management.e2e.ts, which imports index 1 to
// preserve its historical setup order. The product no longer has districts.
export const districts = [
  { name: "아틀리에", ids: ["1", "2", "3", "4"], process: "generation" },
  { name: "스튜디오", ids: ["5", "6", "7"], process: "review" },
  { name: "공방", ids: ["8", "9", "10"], process: "stock" },
  { name: "항구", ids: ["11", "12", "13"], process: "submission" },
] as const;

let baselinePromise: Promise<any> | null = null;
export function baselineWorld() {
  const origin = process.env.BIZ_TEST_ORIGIN || "http://127.0.0.1:4317";
  baselinePromise ||= fetch(`${origin}/api/world`).then(async r => {
    if (!r.ok) throw new Error(`isolated baseline HTTP ${r.status}`);
    return r.json();
  });
  return baselinePromise;
}

export async function fixture(page: Page, options: { issue?: boolean; stale?: boolean; invalidTime?: boolean } = {}) {
  const baseline = await baselineWorld();
  const DB = database(), snapshot = structuredClone(baseline.snapshot);
  snapshot.observedAt = new Date().toISOString();
  snapshot.receivedAt = options.stale ? "2020-01-01T00:00:00Z" : new Date().toISOString();
  snapshot.automation = {
    ...snapshot.automation,
    enabled: false,
    productionEnabled: false,
    runLockActive: false,
    lanes: {},
    nextAt: options.invalidTime ? "invalid-time" : new Date(Date.now() + 3600000).toISOString(),
  };
  for (const account of snapshot.accounts) Object.assign(account, { status: "ready_for_upload", bound: true, running: false });
  if (options.issue) Object.assign(snapshot.accounts[0], { status: "login_required", message: "로그인이 필요합니다." });
  const capturedAt = options.stale ? "2020-01-01T00:00:00.000Z" : new Date().toISOString();
  await DB.prepare("INSERT INTO snapshots VALUES(?,?,?)")
    .bind("miricanvas", JSON.stringify(snapshot), capturedAt).run();

  const env = { DB, LOCAL_MODE: true, BRIDGE_TOKEN: "game-test-isolated" };
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith("/api/thumbnail/")) return route.continue();
    const headers = new Headers(request.headers()); headers.set("Origin", url.origin);
    const response = await api(new Request(request.url(), {
      method: request.method(), headers,
      body: request.method() === "GET" ? undefined : request.postDataBuffer(),
    }), env);
    if (url.pathname === "/api/world") {
      const data = await response.json(); data.thumbnails = baseline.thumbnails;
      return route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(data) });
    }
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.addInitScript(() => localStorage.setItem("biz-reduced", "true"));
  return { DB, baseline, snapshot };
}

/** Preserve the captured source-world business state; only the DB receive timestamp is refreshed. */
export async function ownerCycleFixture(page: Page, options: {
  stale?: boolean;
  mutateSnapshot?: (snapshot: any) => void;
  schedules?: any[];
} = {}) {
  const source = structuredClone(ownerCycleSource), snapshot = source.snapshot;
  const DB = database();
  const capturedAt = options.stale ? "2020-01-01T00:00:00.000Z" : new Date().toISOString();
  snapshot.receivedAt = capturedAt;
  options.mutateSnapshot?.(snapshot);
  await DB.prepare("INSERT INTO snapshots VALUES(?,?,?)")
    .bind("miricanvas", JSON.stringify(snapshot), capturedAt).run();
  for (const schedule of [...source.schedules, ...(options.schedules || [])]) {
    await DB.prepare("INSERT INTO schedules(id,account_id,title,due_at,kind,status,created_at) VALUES(?,?,?,?,?,?,?)")
      .bind(schedule.id, schedule.account_id, schedule.title, schedule.due_at, schedule.kind, schedule.status, schedule.created_at).run();
  }
  for (const command of source.commands) {
    await DB.prepare("INSERT INTO commands(id,action,payload,status,message,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .bind(command.id, command.action, JSON.stringify(command.payload), command.status, command.message, command.created_at, command.updated_at).run();
  }
  for (const business of source.businesses) {
    await DB.prepare("INSERT INTO businesses(id,name,kind,status,note) VALUES(?,?,?,?,?)")
      .bind(business.id, business.name, business.kind, business.status || "unconnected", business.note || "").run();
  }

  const env = { DB, LOCAL_MODE: true, BRIDGE_TOKEN: "game-test-isolated" };
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith("/api/thumbnail/")) return route.continue();
    const headers = new Headers(request.headers()); headers.set("Origin", url.origin);
    const response = await api(new Request(request.url(), {
      method: request.method(), headers,
      body: request.method() === "GET" ? undefined : request.postDataBuffer(),
    }), env);
    if (url.pathname === "/api/world") {
      const data = await response.json(); data.thumbnails = source.thumbnails;
      return route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(data) });
    }
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.addInitScript(() => localStorage.setItem("biz-reduced", "true"));
  return { DB, source: ownerCycleSource, snapshot };
}

export async function enter(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => (window as any).__bizWorld?.ready === true);
  await page.evaluate(() => document.fonts.ready);
}

export async function visitDistrict(page: Page, name: string) {
  void name;
  await page.waitForFunction(() => (window as any).__bizWorld?.ready === true);
  await page.locator("[data-account]").first().waitFor({ state: "visible" });
}

export async function pinchZoom(page: Page) {
  const canvas = await page.locator(".world canvas").boundingBox();
  if (!canvas) throw new Error("3D canvas is not available");
  if (page.context().browser()?.browserType().name() === "webkit") {
    await page.evaluate(({ x, y }) => {
      const element = document.querySelector<HTMLCanvasElement>(".world canvas");
      if (!element) throw new Error("3D canvas is not available");
      // WebKit has no Playwright CDP touch injection; send a paired touch-pointer
      // sequence through Three.js OrbitControls and the world's real pointer listeners.
      const originalCapture = element.setPointerCapture;
      element.setPointerCapture = () => {};
      const pointer = (type: string, id: number, clientX: number) => element.dispatchEvent(new PointerEvent(type, {
        pointerId: id, pointerType: "touch", isPrimary: id === 1, clientX, clientY: y,
        pageX: clientX, pageY: y, button: 0, buttons: type === "pointerup" ? 0 : 1,
        bubbles: true, cancelable: true,
      }));
      try {
        pointer("pointerdown", 1, x - 18); pointer("pointerdown", 2, x + 18);
        pointer("pointermove", 1, x - 60); pointer("pointermove", 2, x + 60);
        pointer("pointerup", 2, x + 60); pointer("pointerup", 1, x - 60);
      } finally {
        element.setPointerCapture = originalCapture;
      }
    }, { x: Math.round(canvas.x + canvas.width * 0.5), y: Math.round(canvas.y + canvas.height * 0.48) });
    return;
  }
  const session = await page.context().newCDPSession(page);
  const x = Math.round(canvas.x + canvas.width * 0.5), y = Math.round(canvas.y + canvas.height * 0.48);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [
    { id: 1, x: x - 18, y, radiusX: 8, radiusY: 8, force: 1 },
    { id: 2, x: x + 18, y, radiusX: 8, radiusY: 8, force: 1 },
  ] });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [
    { id: 1, x: x - 60, y, radiusX: 8, radiusY: 8, force: 1 },
    { id: 2, x: x + 60, y, radiusX: 8, radiusY: 8, force: 1 },
  ] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}
