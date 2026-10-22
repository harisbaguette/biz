import { test, expect } from "@playwright/test";
import { baselineWorld, enter, fixture, pinchZoom } from "./game-fixture";

test.beforeAll(async () => { await baselineWorld(); });

test("실패한 3D 모듈을 목록으로 복구하고 재연결 뒤 다시 섬을 연다", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let blocked = true;
  await page.route(/\/assets\/World-[^/]+\.js(?:\?.*)?$/, route => blocked ? route.abort("failed") : route.continue());
  await page.goto("/");
  await expect(page.locator(".world-recovery")).toBeVisible();
  await page.locator(".fallback-accounts button").first().click();
  await expect(page.getByRole("region", { name: "시설 행동" })).toContainText("1번 계정");
  await page.getByRole("button", { name: "시설 선택 닫기" }).click();
  await page.getByRole("button", { name: /3D 다시 열기/ }).click();
  await expect(page.locator(".world-recovery")).toBeVisible();
  blocked = false;
  await page.getByRole("button", { name: /3D 다시 열기/ }).click();
  await page.waitForFunction(() => (window as any).__bizWorld?.ready === true);
  await expect(page.locator(".world-recovery")).not.toBeVisible();
});

test("웹그래픽 초기화에 실패해도 작업동을 찾고 계정 업무를 진행한다", async ({ page }) => {
  const { baseline } = await fixture(page);
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
  await page.locator(".fallback-plots > button").filter({ hasText: baseline.snapshot.accounts[0].number.toString() }).first().click();
  await expect(page.getByRole("button", { name: "상세" })).toBeVisible();
  await expect(page.getByRole("button", { name: "재확인", exact: true })).toBeEnabled();
});

test("두 손가락 확대는 정지 프레임의 3D 장면을 다시 그리고 전체 보기로 복귀한다", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const before = await page.locator("canvas").screenshot();
  const frames = await page.evaluate(() => (window as any).__bizWorld.totalFrames);
  await pinchZoom(page);
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.zoom)).toBeGreaterThan(1);
  const after = await page.locator("canvas").screenshot();
  expect(after.equals(before)).toBe(false);
  expect(await page.evaluate(() => (window as any).__bizWorld.totalFrames)).toBeGreaterThan(frames);
  await expect(page.locator("[data-account]")).toHaveCount(13);
  await page.getByRole("button", { name: "13개 계정 전체 보기" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.zoom)).toBeCloseTo(1, 1);
});

test("계정 창고의 검색어를 보존하고 제출 일정도 같은 계정 범위로 연다", async ({ page }) => {
  const { baseline } = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const accountId = baseline.snapshot.accounts[0].id;
  await page.locator(`[data-account="${accountId}"]`).click();
  await page.getByRole("button", { name: "창고 열기", exact: true }).click();
  await page.getByRole("textbox", { name: "재고 검색" }).fill("재고검색유지검증");
  await expect(page.getByText("조건에 맞는 재고가 없습니다.")).toBeVisible();
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await page.getByRole("button", { name: "창고 열기", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "재고 검색" })).toHaveValue("재고검색유지검증");
  await expect(page.locator(".scope-line")).toContainText("1번 계정");
  await page.getByRole("button", { name: "패널 닫기" }).click();
  const closeFacility = page.locator(".game-tray .tray-heading button");
  if (await closeFacility.count()) await closeFacility.click();
  await page.locator(`[data-account="${accountId}"]`).click();
  await page.locator(".game-tray .tray-next").click();
  await expect(page.locator(".scope-line")).toContainText("1번 계정");
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await page.getByRole("button", { name: "시설 선택 닫기" }).click();
  await page.locator('[data-process="submission"]').click();
  await page.getByRole("button", { name: "제출 일정", exact: true }).click();
  await expect(page.locator(".scope-line")).toContainText("모든 계정");
});

test("실패 예약의 이유를 보고 다시 예약한 뒤 기존 실패 기록을 취소 이력에 남긴다", async ({ page }) => {
  const { DB } = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await DB.prepare("INSERT INTO schedules VALUES(?,?,?,?,?,?,?)").bind("failed-review", "1", "실패 원인 재현", new Date().toISOString(), "recheck", "failed", new Date().toISOString()).run();
  await enter(page);
  await page.locator('[data-process="submission"]').click();
  await page.getByRole("button", { name: "제출 일정", exact: true }).click();
  const row = page.locator(".timeline-item").filter({ hasText: "실패 원인 재현" });
  await expect(row).toContainText("처리 실패");
  await row.getByRole("button", { name: "다시 예약" }).click();
  const dialog = page.getByRole("dialog", { name: "일정 추가" });
  await expect(dialog.getByLabel("할 일", { exact: true })).toHaveValue("실패 원인 재현");
  await dialog.getByLabel("일시", { exact: false }).fill(new Date(Date.now() + 48 * 3600000).toISOString().slice(0, 16));
  await dialog.getByRole("button", { name: "일정 저장" }).click();
  await expect(dialog).not.toBeVisible();
  const rows = (await DB.prepare("SELECT * FROM schedules ORDER BY created_at").all()).results;
  expect(rows).toHaveLength(2);
  expect(rows.find((row: any) => row.id === "failed-review").status).toBe("failed");
  expect(rows.find((row: any) => row.id !== "failed-review").status).toBe("planned");
  await page.locator(".timeline-item").filter({ hasText: "처리 실패" }).getByRole("button", { name: "기록 닫기" }).click();
  await expect.poll(async () => (await DB.prepare("SELECT status FROM schedules WHERE id=?").bind("failed-review").first() as any).status).toBe("cancelled");
  await page.locator("summary").filter({ hasText: "완료·취소 기록" }).click();
  const history = page.locator(".history").filter({ has: page.locator("summary").filter({ hasText: "완료·취소 기록" }) });
  await expect(history).toContainText("실패 원인 재현");
  await expect(history).toContainText("취소");
});

test("계정 창고를 선택해도 다른 창고가 유지되고 제출 시설을 이어서 고른다", async ({ page }) => {
  const { baseline } = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const accountId = baseline.snapshot.accounts[0].id;
  await page.locator(`[data-account="${accountId}"]`).click();
  await expect(page.locator(`[data-account="${accountId}"]`)).toHaveClass(/selected/);
  await expect(page.locator("[data-account]")).toHaveCount(13);
  await page.getByRole("button", { name: "시설 선택 닫기" }).click();
  await page.locator('[data-process="submission"]').click();
  await expect(page.locator('[data-process="submission"]')).toHaveClass(/selected/);
  await expect(page.locator(`[data-account="${accountId}"]`)).not.toHaveClass(/selected/);
});
