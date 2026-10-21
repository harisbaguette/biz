import { test, expect, type Page } from "@playwright/test";
// @ts-expect-error JavaScript worker is tested through its public HTTP contract.
import { api } from "../worker/index.mjs";
// @ts-expect-error SQLite adapter provides the D1 contract in isolated memory.
import { database } from "./db.mjs";
let baseline: any;
test.beforeAll(async () => {
  baseline = await (await fetch("http://127.0.0.1:4317/api/world")).json();
});
async function isolate(
  page: Page,
  options: { stale?: boolean; brokenGL?: boolean } = {},
) {
  const DB = database(),
    snap = structuredClone(baseline.snapshot);
  snap.observedAt = new Date().toISOString();
  await DB.prepare("INSERT INTO snapshots VALUES(?,?,?)")
    .bind(
      "miricanvas",
      JSON.stringify(snap),
      options.stale ? "2020-01-01T00:00:00Z" : new Date().toISOString(),
    )
    .run();
  const env = { DB, LOCAL_MODE: true, BRIDGE_TOKEN: "isolated-test" };
  await page.route("**/api/**", async (route) => {
    const r = route.request(),
      url = new URL(r.url());
    if (url.pathname.startsWith("/api/thumbnail/")) {
      await route.continue();
      return;
    }
    const headers = new Headers(r.headers());
    headers.set("Origin", url.origin);
    const request = new Request(r.url(), {
      method: r.method(),
      headers,
      body: r.method() === "GET" ? undefined : r.postDataBuffer(),
    });
    const response = await api(request, env);
    if (url.pathname === "/api/world") {
      const data = await response.json();
      data.thumbnails = baseline.thumbnails;
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
      return;
    }
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  if (options.brokenGL)
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        type: string,
        ...args: any[]
      ) {
        if (
          type === "webgl" ||
          type === "webgl2" ||
          type === "experimental-webgl"
        )
          return null;
        return original.apply(this, [type, ...args] as any);
      } as any;
    });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !options.brokenGL)
      errors.push(message.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "크리에이터 파크" }),
  ).toBeVisible();
  await page.waitForFunction(
    () =>
      document.querySelector(".world-fallback") ||
      (window as any).__bizWorld?.ready === true,
  );
  return { DB, errors };
}
for (const [name, width, height] of [
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
  ["small-mobile", 360, 740],
  ["tablet", 768, 1024],
  ["portrait-pc", 900, 1440],
  ["landscape-mobile", 844, 390],
] as const) {
  test(`${name} 시설 선택·패널·재고·일정`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const { errors } = await isolate(page);
    await page.screenshot({
      path: `artifacts/verification/${name}-world.png`,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "작업동", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "13개 작업동" }),
    ).toBeVisible();
    await page.locator(".account-list>button").first().click();
    await expect(
      page.getByRole("heading", {
        name: baseline.snapshot.accounts[0].name,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "재확인", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: `artifacts/verification/${name}-account.png`,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "창고 열기" }).click();
    await expect(
      page.getByRole("heading", { name: "재고 창고" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "재고 검색" })
      .fill("절대없는그림검색");
    await expect(page.getByText("조건에 맞는 재고가 없습니다.")).toBeVisible();
    await page.getByRole("button", { name: "패널 닫기" }).click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "일정", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "일정" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}
test("일정은 저장 후 새로 열어도 남고 취소할 수 있다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { DB } = await isolate(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "일정", exact: true })
    .click();
  await page.getByRole("button", { name: "일정 추가", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "일정 추가" });
  await dialog.getByLabel("할 일", { exact: true }).fill("QA 제출분 확인");
  await dialog.getByLabel("일시", { exact: false }).fill(new Date(Date.now() + 48 * 3600000).toISOString().slice(0,16));
  await dialog.getByRole("button", { name: "일정 저장" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("QA 제출분 확인", { exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "일정", exact: true })
    .click();
  await expect(page.getByText("QA 제출분 확인", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "QA 제출분 확인 취소" }).click();
  const rows = await DB.prepare("SELECT status FROM schedules").all();
  expect(rows.results[0].status).toBe("cancelled");
});
test("지시는 확인 뒤에만 전달되며 운영 원본에 닿지 않는다", async ({
  page,
}) => {
  const { DB } = await isolate(page);
  await page.locator('[data-account="1"]').click();
  await page.getByRole("button", { name: "재확인", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "계정 재확인" })).toBeVisible();
  expect(
    (await DB.prepare("SELECT * FROM commands").all()).results,
  ).toHaveLength(0);
  await page.getByRole("button", { name: "지시 보내기" }).click();
  await expect(
    page.getByRole("dialog", { name: "계정 재확인" }),
  ).not.toBeVisible();
  expect(
    (await DB.prepare("SELECT * FROM commands").all()).results,
  ).toHaveLength(1);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "확인할 일" })
    .click();
  await expect(page.getByText("작업기 전달 대기")).toBeVisible();
});
test("연결이 오래되면 상태를 밝히고 지시를 막는다", async ({ page }) => {
  await isolate(page, { stale: true });
  await expect(
    page.locator(".attention").filter({ hasText: "작업기 연결 확인" }),
  ).toBeVisible();
  await page.locator('[data-account="1"]').click();
  await expect(
    page.getByRole("button", { name: "재확인", exact: true }),
  ).toBeDisabled();
});
test("WebGL 없이도 계정과 일정 관리가 된다", async ({ page }) => {
  await isolate(page, { brokenGL: true });
  await expect(
    page.getByRole("heading", { name: "시설 목록" }),
  ).toBeVisible();
  await page.locator(".fallback-plots>button").first().click();
  await expect(
    page.getByRole("button", { name: "일정 추가", exact: true }),
  ).toBeVisible();
});
test("카메라 확대와 복귀, 재고 표시", async ({ page }) => {
  await isolate(page);
  await page.getByRole("button", { name: "시점 조절", exact: true }).click();
  await page.getByRole("button", { name: "확대", exact: true }).click();
  await page.waitForTimeout(700);
  expect(
    await page.evaluate(() => (window as any).__bizWorld.zoom),
  ).toBeGreaterThan(1);
  await page.getByRole("button", { name: "전체 단지 보기" }).click();
  await page.waitForTimeout(1000);
  expect(
    await page.evaluate(() => (window as any).__bizWorld.zoom),
  ).toBeCloseTo(1, 1);
  await page.getByRole("button", { name: "지도 표시", exact: true }).click();
  await page
    .locator(".layer-control")
    .getByRole("button", { name: "재고", exact: true })
    .click();
  await expect(page.locator('[data-account="1"] b')).toHaveText(
    String(baseline.snapshot.accounts[0].ready),
  );
});

test("200% 상당 화면과 키보드 이동·대화상자 복귀", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 720, height: 450 });
  await isolate(page);
  const launcher = page
    .getByRole("navigation")
    .getByRole("button", { name: "작업동", exact: true });
  await launcher.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "13개 작업동" }),
  ).toBeFocused();
  // Safari uses Option+Tab to include buttons when Full Keyboard Access is off.
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(page.getByRole("button", { name: "패널 닫기" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(launcher).toBeFocused();
  await page.keyboard.press("Enter");
  await page.locator(".account-list>button").first().focus();
  await page.keyboard.press("Enter");
  const action = page.getByRole("button", { name: "일정 추가", exact: true });
  await expect(action).toBeInViewport();
  await action.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "일정 추가" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(action).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
