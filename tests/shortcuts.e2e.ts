import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { enter, ownerCycleFixture } from "./game-fixture";

async function start(page: Page) {
  await ownerCycleFixture(page);
  const errors: string[] = [], writes: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => { if (r.url().includes("/api/") && r.method() !== "GET") writes.push(r.method() + " " + new URL(r.url()).pathname); });
  await enter(page);
  return { errors, writes };
}
const selected = (page: Page) => page.evaluate(() => (window as any).__bizWorld?.selected);
const overview = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => ({ selected: (window as any).__bizWorld?.selected, visible: (window as any).__bizWorld?.visibleAccounts.length }))).toEqual({ selected: null, visible: 13 });
};

test("Esc는 입력창·패널·선택을 한 단계씩 닫고 길게 누르기와 한글 조합을 무시한다", async ({ page }) => {
  const evidence = await start(page);
  await page.keyboard.press("Digit3"); await expect.poll(() => selected(page)).toBe("3");
  await page.keyboard.press("KeyS"); await expect(page.locator(".panel-schedule")).toBeVisible();
  await page.getByRole("button", { name: "재확인 예약", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "재확인 요청 예약", exact: true });
  await expect(modal).toBeVisible();
  await page.getByRole("textbox", { name: "할 일", exact: true }).fill("sahrf 123 [] +- ?");
  await page.evaluate(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, isComposing: true })));
  await expect(modal).toBeVisible();
  await page.keyboard.down("Escape"); await expect(modal).not.toBeVisible();
  await page.keyboard.down("Escape"); await expect(page.locator(".panel-schedule")).toBeVisible();
  await page.keyboard.up("Escape");
  await page.keyboard.press("Escape"); await expect(page.locator(".panel-schedule")).not.toBeVisible();
  await expect(page.getByRole("region", { name: "시설 행동" })).toBeVisible();
  await page.keyboard.press("Escape"); await overview(page);
  await expect(page.locator('[data-account="3"]')).toBeFocused();
  expect(evidence.errors).toEqual([]); expect(evidence.writes).toEqual([]);
});

test("13계정 순환·한영 공통 바로가기·카메라·조회 새로고침은 업무 쓰기 없이 작동한다", async ({ page }) => {
  const evidence = await start(page);
  await page.keyboard.press("BracketLeft"); await expect.poll(() => selected(page)).toBe("13");
  await page.getByRole("button", { name: "다음 계정", exact: true }).click(); await expect.poll(() => selected(page)).toBe("1");
  await page.getByRole("button", { name: "이전 계정", exact: true }).click(); await expect.poll(() => selected(page)).toBe("13");
  await page.keyboard.press("Digit9"); await expect.poll(() => selected(page)).toBe("9");
  await expect(page.locator(".tray-heading h2")).toBeFocused();
  await page.keyboard.press("Enter"); await expect.poll(() => selected(page)).toBe("9");
  for (const number of [10, 11, 12, 13, 1]) { await page.keyboard.press("BracketRight"); await expect.poll(() => selected(page)).toBe(String(number)); }
  await page.keyboard.press("Digit0"); await overview(page);
  const zoom = await page.evaluate(() => (window as any).__bizWorld.zoom);
  await page.keyboard.press("Equal"); await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.zoom)).toBeGreaterThan(zoom);
  await page.keyboard.press("Minus"); await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.zoom)).toBeCloseTo(zoom);
  const target = await page.evaluate(() => (window as any).__bizWorld.camera.target);
  await page.keyboard.press("ArrowRight"); await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.camera.target)).not.toEqual(target);
  await page.keyboard.press("Home"); await overview(page);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "ㄴ", code: "KeyS", bubbles: true, cancelable: true })));
  await expect(page.locator(".panel-schedule")).toBeVisible(); await page.keyboard.press("Escape");
  for (const [key, panel] of [["KeyH", "activity"], ["KeyA", "automation"], ["KeyF", "revenue"]]) {
    await page.keyboard.press(key); await expect(page.locator(".panel-" + panel)).toBeVisible(); await page.keyboard.press("Escape");
  }
  const response = page.waitForResponse(r => r.url().endsWith("/api/world"));
  await page.keyboard.press("KeyR"); await response;
  expect(evidence.errors).toEqual([]); expect(evidence.writes).toEqual([]);
});

test("입력·브라우저 조합키 보호, 안내의 Esc 복귀, 단축키 끄기와 재접속 보존", async ({ page }) => {
  const evidence = await start(page);
  await page.evaluate(() => {
    const input = document.createElement("input"); input.id = "keyboard-test-input"; document.body.append(input); input.focus();
  });
  await page.keyboard.type("sahrf123[]+-?");
  await expect(page.locator("#keyboard-test-input")).toHaveValue("sahrf123[]+-?");
  await overview(page); await expect(page.locator("dialog[open],.panel:not([hidden])")).toHaveCount(0);
  await page.evaluate(() => document.querySelector("#keyboard-test-input")?.remove());
  for (const properties of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }]) {
    await page.evaluate(properties => document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", code: "KeyS", bubbles: true, cancelable: true, ...properties })), properties);
  }
  await expect(page.locator(".panel:not([hidden])")).toHaveCount(0);
  await page.keyboard.press("KeyA");
  const helpButton = page.locator(".panel-automation").getByRole("button", { name: "단축키·조작 안내", exact: true });
  await helpButton.click(); await expect(page.getByRole("dialog", { name: "단축키·조작 안내" })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(page.locator(".panel-automation")).toBeVisible(); await expect(helpButton).toBeFocused();
  await helpButton.click(); await page.getByRole("switch", { name: "단축키 사용" }).click(); await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.keyboard.press("Digit4"); await page.keyboard.press("KeyS"); await overview(page);
  await page.reload(); await page.waitForFunction(() => (window as any).__bizWorld?.ready);
  await page.keyboard.press("KeyS"); await expect(page.locator(".panel:not([hidden])")).toHaveCount(0);
  await page.locator("#main-tools").getByRole("button", { name: "자동화 설정", exact: true }).click();
  await page.locator(".panel-automation").getByRole("button", { name: "단축키·조작 안내", exact: true }).click();
  await page.getByRole("switch", { name: "단축키 사용" }).click(); await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+Slash"); await expect(page.getByRole("dialog", { name: "단축키·조작 안내" })).toBeVisible();
  expect(evidence.errors).toEqual([]); expect(evidence.writes).toEqual([]);
});

for (const width of [360, 390]) test(`${width}px 모바일에서 계정 순환 버튼과 조작 안내를 가림 없이 사용한다`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 }); const evidence = await start(page);
  await page.keyboard.press("Digit1");
  for (const name of ["이전 계정", "다음 계정", "시설 선택 닫기"]) {
    const button = page.getByRole("button", { name, exact: true }); const rect = await button.boundingBox();
    expect(rect).not.toBeNull(); expect(rect!.width).toBeGreaterThanOrEqual(44); expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width); await button.click();
  }
  await overview(page);
  await page.locator("#main-tools").getByRole("button", { name: "자동화 설정", exact: true }).click();
  await page.locator(".panel-automation").getByRole("button", { name: "단축키·조작 안내", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "단축키·조작 안내" })).toBeVisible();
  await mkdir("artifacts/shortcuts", { recursive: true });
  await page.screenshot({ path: `artifacts/shortcuts/${info.project.use.browserName}-${width}-help.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await overview(page);
  expect(evidence.errors).toEqual([]); expect(evidence.writes).toEqual([]);
});

test("360px 큰 글자에서도 계정 순환·닫기와 안내의 마지막 설명에 접근한다", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 640 }); const evidence = await start(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
  await page.keyboard.press("Digit1");
  const next = page.getByRole("button", { name: "다음 계정", exact: true });
  await next.click(); await expect.poll(() => selected(page)).toBe("2");
  await mkdir("artifacts/shortcuts", { recursive: true });
  await page.screenshot({ path: `artifacts/shortcuts/${info.project.use.browserName}-large-tray.png` });
  await page.getByRole("button", { name: "시설 선택 닫기", exact: true }).click(); await overview(page);
  await page.keyboard.press("Shift+Slash");
  const help = page.getByRole("dialog", { name: "단축키·조작 안내" });
  await expect(help).toBeVisible();
  await help.getByText(/R은 표시만 갱신/).scrollIntoViewIfNeeded();
  expect(await help.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.keyboard.press("Escape"); await overview(page);
  expect(evidence.errors).toEqual([]); expect(evidence.writes).toEqual([]);
});
