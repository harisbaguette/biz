import { test, expect } from "@playwright/test";
import { baselineWorld, enter, fixture } from "./game-fixture";

const viewports = [
  ["small-phone", 360, 640], ["phone", 390, 844], ["large-phone", 430, 932],
  ["tablet-portrait", 768, 1024], ["desktop", 1440, 900], ["landscape", 844, 390],
] as const;

test.beforeAll(async () => { await baselineWorld(); });

for (const [name, width, height] of viewports) {
  test(`${name} ${width}×${height}: 13개 창고 전체와 핵심 설비를 한 화면에서 조작한다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const { baseline } = await fixture(page);
    const pageErrors: string[] = [], badResponses: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("response", response => {
      if (response.status() >= 400 && new URL(response.url()).origin === new URL(page.url() || "http://127.0.0.1:4317").origin)
        badResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    await enter(page);

    const expectedIds = baseline.snapshot.accounts.map((a: any) => a.id).sort((a: string, b: string) => Number(a) - Number(b));
    await expect(page.locator("[data-account]")).toHaveCount(13);
    await expect(page.locator("[data-process]")).toHaveCount(6);
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.processes.length)).toBe(7);
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.visibleAccounts.length)).toBe(13);
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.loaded)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.modelFailures.length)).toBe(0);
    const markers = await page.locator("[data-account]").evaluateAll(items => items.map(item => {
      const rect = item.getBoundingClientRect(), css = getComputedStyle(item);
      return { id: (item as HTMLElement).dataset.account, visible: getComputedStyle(item).visibility,
        x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height,
        cssWidth: parseFloat(css.width), cssHeight: parseFloat(css.height) };
    }));
    expect(markers.map(m => m.id).sort((a, b) => Number(a) - Number(b))).toEqual(expectedIds);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    for (const marker of markers) {
      expect(marker.visible, `account ${marker.id}`).toBe("visible");
      expect(marker.width, `account ${marker.id} projected width`).toBeGreaterThanOrEqual(43.99);
      expect(marker.height, `account ${marker.id} projected height`).toBeGreaterThanOrEqual(43.99);
      expect(marker.cssWidth, `account ${marker.id} CSS hit width`).toBeGreaterThanOrEqual(44);
      expect(marker.cssHeight, `account ${marker.id} CSS hit height`).toBeGreaterThanOrEqual(44);
      expect(marker.x, `account ${marker.id} left`).toBeGreaterThanOrEqual(-1);
      expect(marker.y, `account ${marker.id} top`).toBeGreaterThanOrEqual(-1);
      expect(marker.right, `account ${marker.id} right`).toBeLessThanOrEqual(width + 1);
      expect(marker.bottom, `account ${marker.id} bottom`).toBeLessThanOrEqual(height + 1);
    }
    await page.screenshot({ path: `artifacts/industrial-game/qa/${name}-overview.png`, animations: "disabled" });
    expect(pageErrors).toEqual([]);
    expect(badResponses).toEqual([]);
  });
}

test("상태가 어긋나면 연결 경고를 표시하고 계정 확인 지시를 막는다", async ({ page }) => {
  const { baseline } = await fixture(page, { stale: true });
  await page.setViewportSize({ width: 360, height: 640 });
  await enter(page);
  await expect(page.locator(".mission.stale")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.cargo.every((cargo: any) => cargo.unknown))).toBe(true);
  await page.locator(`[data-account="${baseline.snapshot.accounts[0].id}"]`).click();
  await expect(page.getByRole("button", { name: "재확인", exact: true })).toBeDisabled();
  await expect(page.getByRole("region", { name: "시설 행동" })).toContainText("연결 확인");
});

test("PWA manifest와 favicon을 올바른 MIME 형식으로 제공한다", async ({ page }) => {
  await fixture(page);
  const origin = process.env.BIZ_TEST_ORIGIN || "http://127.0.0.1:4317";
  const manifest = await page.request.get(`${origin}/site.webmanifest`);
  expect(manifest.status()).toBe(200);
  expect(manifest.headers()["content-type"]).toMatch(/^application\/manifest\+json\b/);
  expect((await manifest.json()).name).toBe("BLUEKITE WORKS");
  const icon = await page.request.get(`${origin}/favicon.ico`);
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toMatch(/^image\/x-icon\b/);
  expect((await icon.body()).byteLength).toBeGreaterThan(0);
});
