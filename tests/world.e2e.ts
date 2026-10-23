import { test, expect } from "@playwright/test";
import { baselineWorld, enter, fixture, pinchZoom } from "./game-fixture";

test.beforeAll(async () => { await baselineWorld(); });

test("재확인 예약을 저장하고 취소해도 실제 제출·계정 상태를 바꾸지 않는다", async ({ page }) => {
  const { DB, baseline } = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.getByRole("button", { name: "다음 일정", exact: true }).click();
  await page.getByRole("button", { name: "재확인 예약", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "재확인 요청 예약" });
  await dialog.getByLabel("계정").selectOption(baseline.snapshot.accounts[0].id);
  await dialog.getByLabel("할 일", { exact: true }).fill("QA 계정 재확인");
  await dialog.getByLabel("일시", { exact: false }).fill(new Date(Date.now() + 48 * 3600000).toISOString().slice(0, 16));
  await dialog.getByRole("button", { name: "재확인 요청 예약", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("QA 계정 재확인", { exact: true })).toBeVisible();
  const row = (await DB.prepare("SELECT * FROM schedules WHERE title=?").bind("QA 계정 재확인").first()) as any;
  expect(row.account_id).toBe(baseline.snapshot.accounts[0].id);
  expect(row.kind).toBe("recheck");
  expect(row.status).toBe("planned");
  expect((await DB.prepare("SELECT count(*) AS n FROM commands").first() as any).n).toBe(0);
  await page.getByRole("button", { name: "QA 계정 재확인 취소" }).click();
  expect((await DB.prepare("SELECT status FROM schedules WHERE id=?").bind(row.id).first() as any).status).toBe("cancelled");
});

test("확인 지시는 취소하면 전송되지 않고 승인한 뒤에는 같은 ID 하나만 접수한다", async ({ page }) => {
  const { DB, baseline } = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const account = baseline.snapshot.accounts[0];
  await page.locator(`[data-account="${account.id}"]`).click();
  await page.getByRole("button", { name: "계정 재확인", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "계정 재확인" });
  await expect(dialog).toBeVisible();
  expect((await DB.prepare("SELECT * FROM commands").all()).results).toHaveLength(0);
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await DB.prepare("SELECT * FROM commands").all()).results).toHaveLength(0);
  await page.getByRole("button", { name: "계정 재확인", exact: true }).click();
  await page.getByRole("button", { name: "지시 보내기", exact: true }).click();
  await expect(page.locator(".toast[role='status']")).toContainText("지시 접수");
  const commands = (await DB.prepare("SELECT * FROM commands").all()).results;
  expect(commands).toHaveLength(1);
  expect(JSON.parse(commands[0].payload)).toEqual({ accountId: account.id });
  await expect(page.getByRole("region", { name: "시설 행동" })).toContainText("지시 대기");
});

test("WebGL을 사용할 수 없어도 13계정 목록에서 업무를 하고 3D 화면을 복구할 수 있다", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: any[]) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(type)) return null;
      return original.apply(this, [type, ...args] as any);
    } as any;
  });
  await page.goto("/");
  await expect(page.locator(".world-fallback")).toBeVisible();
  await page.locator(".fallback-plots > button").first().click();
  await expect(page.getByRole("region", { name: "시설 행동" })).toContainText("1번 계정");
});

test("두 손가락 확대 뒤 전체 보기로 돌아오면 13개 계정 전경과 재고가 복구된다", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const before = await page.locator("canvas").screenshot();
  const stockBefore = await page.evaluate(() => (window as any).__bizWorld.cargo.map((item: any) => item.ready));
  await pinchZoom(page);
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.zoom)).toBeGreaterThan(1);
  const after = await page.locator("canvas").screenshot();
  expect(after.equals(before)).toBe(false);
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.cargo.map((item: any) => item.ready))).toEqual(stockBefore);
  await page.getByRole("button", { name: "13개 계정 전체 보기" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.zoom)).toBeCloseTo(1, 1);
  await expect.poll(() => page.locator("[data-account]").evaluateAll(items => items.filter(item => getComputedStyle(item).visibility === "visible").length)).toBe(13);
});

test("13번 작업대를 선택해 확대하고 닫으면 13개 계정 전경으로 돌아온다", async ({ page }) => {
  const { baseline } = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.locator(`[data-account="${baseline.snapshot.accounts[12].id}"]`).click();
  await expect(page.getByRole("heading", { name: /13번 계정/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "시설 행동" })).toContainText("13번 계정");
  await expect(page.locator("[data-account]")).toHaveCount(13);
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.zoom)).toBeGreaterThan(1);
  const before = await page.evaluate(() => (window as any).__bizWorld.camera.matrixWorld.join(","));
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 - 40, box!.y + box!.height / 2 - 20, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.camera.matrixWorld.join(","))).not.toBe(before);
  await page.getByRole("button", { name: "시설 선택 닫기" }).click();
  await expect(page.getByRole("region", { name: "시설 행동" })).toHaveCount(0);
  await expect.poll(() => page.locator("[data-account]").evaluateAll(items => items.filter(item => getComputedStyle(item).visibility === "visible").length)).toBe(13);
});
