import { test, expect, type Page } from "@playwright/test";
// @ts-expect-error Isolated API contract.
import { api } from "../worker/index.mjs";
// @ts-expect-error Temporary SQLite adapter.
import { database } from "./db.mjs";
async function fixture(page: Page) {
  const baseline = await (await fetch("http://127.0.0.1:4317/api/world")).json();
  const DB = database(), snapshot = structuredClone(baseline.snapshot);
  snapshot.observedAt = new Date().toISOString();
  const account = snapshot.accounts.find((a: any) => a.number === 5);
  Object.assign(account, { status: "blocked", running: false, checkedAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString(), lastVerifiedAt: null,
    message: "언어 메뉴를 확인하지 못했습니다.", counts: { uploaded: 20, published: 20 } });
  snapshot.automation.scan = { pending: [7, 8, 10, 13], requestedAt: new Date().toISOString() };
  snapshot.automation.nextAt = new Date(Date.now() + 1800000).toISOString();
  await DB.prepare("INSERT INTO snapshots VALUES(?,?,?)").bind("miricanvas", JSON.stringify(snapshot), new Date().toISOString()).run();
  await DB.prepare("INSERT INTO businesses(id,name,kind) VALUES('other','두 번째 사업','other')").run();
  const env = { DB, LOCAL_MODE: true };
  await page.route("**/api/**", async route => {
    const r = route.request(), url = new URL(r.url());
    if (url.pathname.startsWith("/api/thumbnail/")) return route.continue();
    const headers = new Headers(r.headers()); headers.set("Origin", url.origin);
    const response = await api(new Request(r.url(), { method: r.method(), headers, body: r.method() === "GET" ? undefined : r.postDataBuffer() }), env);
    if (url.pathname === "/api/world") {
      const data = await response.json(); data.thumbnails = baseline.thumbnails;
      return route.fulfill({ status: response.status, json: data });
    }
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "운영", exact: true })).toBeVisible();
  return DB;
}
async function management(page: Page) {
  await page.getByRole("button", { name: "운영", exact: true }).click();
  await page.getByRole("button", { name: "운영 계획·보고", exact: true }).click();
  await expect(page.getByRole("heading", { name: "운영 계획·보고" })).toBeVisible();
}
test("계획·보고를 사업별로 저장·수정하고 다시 열어도 보존한다", async ({ page }) => {
  const DB = await fixture(page); await management(page);
  await page.getByRole("button", { name: "기록 추가" }).click();
  await page.getByLabel("제목", { exact: true }).fill("30분 간격 복구 계획");
  await page.getByLabel("내용", { exact: true }).fill("실제 ID와 제출 결과를 대조한다.\n남은 7·8·10·13번은 순서대로 처리한다.");
  await page.getByRole("combobox", { name: "상태", exact: true }).selectOption("active");
  await page.getByRole("button", { name: "기록 저장", exact: true }).click();
  await page.locator(".management-record summary").click();
  await expect(page.locator(".management-content")).toContainText("실제 ID");
  await page.getByRole("button", { name: "기록 수정" }).click();
  await page.getByRole("combobox", { name: "상태", exact: true }).selectOption("done");
  await page.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(page.locator(".management-record summary")).toContainText("완료");
  await page.getByRole("combobox", { name: "사업", exact: true }).selectOption("other");
  await expect(page.getByText("아직 운영 기록이 없습니다.")).toBeVisible();
  await page.getByRole("button", { name: "기록 추가" }).click();
  await page.getByRole("combobox", { name: "종류", exact: true }).selectOption("report");
  await page.getByLabel("제목", { exact: true }).fill("두 번째 사업 보고");
  await page.getByLabel("내용", { exact: true }).fill("<script>window.shouldNotRun = true</script>\n확인한 결과만 기록한다.");
  await page.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(page.locator(".management-record summary")).toContainText("두 번째 사업 보고");
  await page.reload(); await management(page);
  await expect(page.locator(".management-record summary")).toContainText("30분 간격 복구 계획");
  await page.getByRole("combobox", { name: "사업", exact: true }).selectOption("other");
  await page.locator(".management-record summary").click();
  await expect(page.locator(".management-content")).toContainText("<script>");
  expect(await page.evaluate(() => (window as any).shouldNotRun)).toBeUndefined();
  expect((await DB.prepare("SELECT count(*) AS n FROM commands").first()).n).toBe(0);
});
test("미완료 확인을 성공 시각으로 표시하지 않고 제출 전 재고와 복구 순서를 보존한다", async ({ page }) => {
  await fixture(page);
  await page.getByRole("button", { name: "작업동", exact: true }).click();
  await page.locator(".panel-accounts button").filter({ hasText: "5" }).first().click();
  await expect(page.locator(".panel-account")).toContainText("자동 확인 미완료");
  await expect(page.locator(".account-observation-summary")).toContainText("계정 확인 성공 미기록");
  await page.locator(".account-records summary").click();
  await expect(page.locator(".account-records")).toContainText("성공 시각 미기록");
  await expect(page.locator(".stage-counts > div").filter({ hasText: "제출 대기" }).locator("strong")).toHaveText("20");
  await page.getByRole("button", { name: "운영", exact: true }).click();
  await expect(page.locator(".panel-automation")).toContainText("7번 → 8번 → 10번 → 13번");
  await expect(page.locator(".panel-automation")).toContainText("작업 종료 후 30분 간격");
});
test("휴대전화에서 긴 보고를 읽고 저장할 수 있다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page); await management(page);
  await page.getByRole("button", { name: "기록 추가" }).click();
  await page.getByRole("combobox", { name: "종류", exact: true }).selectOption("report");
  await page.getByLabel("제목", { exact: true }).fill("오늘의 운영 보고");
  await page.getByLabel("내용", { exact: true }).fill("5번과 6번 각각 새 20개 제출 완료.\n".repeat(10));
  await page.getByRole("button", { name: "기록 저장", exact: true }).click();
  await page.locator(".management-record summary").click();
  await expect(page.getByRole("button", { name: "기록 수정" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/biz-management-mobile.png" });
});
