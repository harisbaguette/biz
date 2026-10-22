import { test, expect } from "@playwright/test";
import { baselineWorld, enter, fixture } from "./game-fixture";

test.beforeAll(async () => { await baselineWorld(); });

test("문제 계정의 섬 경고를 열면 재고와 복구 지시가 이어진다", async ({ page }) => {
  await fixture(page, { issue: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await enter(page);
  await page.getByRole("button", { name: /확인할 일/ }).click();
  await expect(page.getByRole("region", { name: "시설 행동" })).toContainText("1번 계정");
  await expect(page.getByRole("button", { name: "재확인", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /1번 계정 재고 \d+개 보기/ }).click();
  await expect(page.locator(".panel-inventory")).toBeVisible();
  await expect(page.getByRole("button", { name: "패널 닫기" })).toBeVisible();
});

test("상세 패널을 열면 지도와 HUD가 키보드 탐색에서 빠지고 닫은 뒤 시설로 돌아간다", async ({ page }) => {
  const { baseline } = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.locator(`[data-account="${baseline.snapshot.accounts[0].id}"]`).click();
  await page.getByRole("button", { name: "상세" }).click();
  await expect(page.locator(".world-stage")).toHaveJSProperty("inert", true);
  await expect(page.locator(".game-hud")).toHaveJSProperty("inert", true);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".world-stage,.game-hud,.district-dock,.game-tray")))).toBe(false);
  }
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await expect(page.locator(".world-stage")).toHaveJSProperty("inert", false);
  await expect(page.getByRole("button", { name: "상세" })).toBeFocused();
});

test("태블릿 세로 재고는 화면 너비 안에 카드와 검색을 유지한다", async ({ page }) => {
  const { baseline } = await fixture(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await enter(page);
  await page.locator(`[data-account="${baseline.snapshot.accounts[0].id}"]`).click();
  await page.getByRole("button", { name: /1번 계정 재고 \d+개 보기/ }).click();
  await page.getByRole("button", { name: "전체", exact: true }).click();
  const widths = await page.locator(".inventory-grid > button").evaluateAll(items => items.map(item => item.getBoundingClientRect().width));
  expect(widths.length).toBeGreaterThan(3);
  expect(Math.max(...widths)).toBeLessThan(240);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("일정 취소 요청이 실패하면 오류를 알리고 원래 일정을 남긴다", async ({ page }) => {
  const { DB, baseline } = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await DB.prepare("INSERT INTO schedules VALUES(?,?,?,?,?,?,?)")
    .bind("game-cancel-fail", baseline.snapshot.accounts[0].id, "취소 실패 검증", new Date(Date.now() + 3600000).toISOString(), "memo", "planned", new Date().toISOString()).run();
  await page.route("**/api/schedules/game-cancel-fail", route => route.fulfill({ status: 503, json: { error: "일정을 취소하지 못했습니다." } }));
  await enter(page);
  await page.locator(`[data-account="${baseline.snapshot.accounts[0].id}"]`).click();
  await page.getByRole("button", { name: /제출 일정/ }).click();
  const row = page.locator(".timeline-item").filter({ hasText: "취소 실패 검증" });
  await row.getByRole("button", { name: "취소 실패 검증 취소", exact: true }).click();
  await expect(page.locator(".toast[role='alert']")).toContainText("일정을 취소하지 못했습니다.");
  await expect(row).toBeVisible();
});

test("잘못된 예정 시각이 있어도 섬·재고 업무를 쓸 수 있고 오류가 없다", async ({ page }) => {
  const { baseline } = await fixture(page, { invalidTime: true });
  await page.setViewportSize({ width: 360, height: 640 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await enter(page);
  await page.getByRole("button", { name: "상태 수신" }).click();
  await expect(page.locator(".panel-automation")).toBeVisible();
  await expect(page.locator(".panel-automation")).toContainText("예정 없음");
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await page.locator(`[data-account="${baseline.snapshot.accounts[0].id}"]`).click();
  await page.getByRole("button", { name: /1번 계정 재고 \d+개 보기/ }).click();
  await expect(page.getByRole("textbox", { name: "재고 검색" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("큰 글자에서도 계정 상세와 일정 입력을 읽고 취소할 수 있다", async ({ page }) => {
  const { baseline } = await fixture(page);
  await page.setViewportSize({ width: 360, height: 740 });
  await enter(page);
  await page.locator(`[data-account="${baseline.snapshot.accounts[0].id}"]`).click();
  await page.getByRole("button", { name: "상세" }).click();
  const originalFont = await page.locator(".panel-body").evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect.poll(async () => page.locator(".panel-body").evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(originalFont * 1.8);
  await expect.poll(async () => (await page.locator(".panel-body").boundingBox())!.height).toBeGreaterThan(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const touchTargets = await page.locator(".panel-account button").evaluateAll(items => items.map(item => {
    const box = item.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(touchTargets.length).toBeGreaterThan(0);
  expect(touchTargets.every(box => box.width >= 44 && box.height >= 44)).toBe(true);
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await page.getByRole("button", { name: /제출 일정/ }).click();
  await page.getByRole("button", { name: "일정 추가", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "일정 추가" });
  await dialog.getByLabel("할 일", { exact: true }).fill("큰 글자 검증 일정");
  await dialog.getByLabel("일시", { exact: false }).fill(new Date(Date.now() + 48 * 3600000).toISOString().slice(0, 16));
  await dialog.getByRole("button", { name: "일정 저장" }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "일정 저장" })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("앱 로드 전 200% 글자 설정에서도 세로 화면의 시설 선택과 상세 조작이 된다", async ({ page }) => {
  const { baseline } = await fixture(page);
  await page.route("**/", async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace("<head>", "<head><style>html{font-size:200%!important}</style>");
    await route.fulfill({ response, body: html });
  });
  await page.setViewportSize({ width: 360, height: 640 });
  await enter(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("32px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(`[data-account="${baseline.snapshot.accounts[0].id}"]`).click();
  await expect(page.getByRole("region", { name: "시설 행동" })).toBeVisible();
  await page.getByRole("button", { name: "상세", exact: true }).click();
  await expect(page.locator(".panel-account")).toBeVisible();
  await expect(page.getByRole("button", { name: "패널 닫기" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/mobile-game/qa/initial-200-selected.png", animations: "disabled" });
});
