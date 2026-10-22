import { test, expect } from "@playwright/test";
import { baselineWorld, districts, enter, fixture, visitDistrict } from "./game-fixture";

const viewports = [
  ["small-phone", 360, 640], ["phone-375", 375, 812], ["phone", 390, 844], ["tablet-portrait", 768, 1024],
  ["desktop", 1440, 900], ["landscape", 844, 390],
] as const;

test.beforeAll(async () => { await baselineWorld(); });

for (const [name, width, height] of viewports) {
  test(`${name} ${width}×${height}: 섬이 화면 안에 유지되고 현재 지구의 시설을 조작할 수 있다`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const { baseline } = await fixture(page);
    const pageErrors: string[] = [], badResponses: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("response", response => { if (response.status() >= 400 && new URL(response.url()).origin === new URL(page.url() || "http://127.0.0.1:4317").origin) badResponses.push(`${response.status()} ${new URL(response.url()).pathname}`); });
    await enter(page);

    await expect(page.getByRole("heading", { name: "아틀리에" })).toBeVisible();
    const state = await page.evaluate(() => ({
      world: document.querySelector(".world")!.getBoundingClientRect().toJSON(),
      stage: document.querySelector(".world-stage")!.getBoundingClientRect().toJSON(),
      scrollWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
      render: (window as any).__bizWorld,
    }));
    expect(state.scrollWidth).toBeLessThanOrEqual(state.viewport);
    expect(state.world.width).toBeGreaterThan(width * 0.95);
    expect(state.render.rotationLocked).toBe(true);
    expect(state.render.layoutColumns).toBe(2);
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.loaded)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.modelFailures.length)).toBe(0);
    await page.screenshot({ path: `artifacts/mobile-game/qa/${name}-world.png`, animations: "disabled" });

    for (let index = 0; index < districts.length; index++) {
      const district = districts[index];
      if (index) await visitDistrict(page, district.name);
      const geometry = await page.evaluate(() => {
        const markers = [...document.querySelectorAll<HTMLElement>(".world [data-account],.world [data-process]")]
          .filter(el => getComputedStyle(el).visibility === "visible")
          .map(el => {
            const rect = el.getBoundingClientRect();
            return { id: el.dataset.account || el.dataset.process, width: rect.width, height: rect.height,
              right: rect.right, bottom: rect.bottom, x: rect.x, y: rect.y };
          });
        return { markers, live: (window as any).__bizWorld.visibleAccounts };
      });
      expect(geometry.live).toEqual(district.ids);
      expect(geometry.markers.filter(marker => /^\d+$/.test(marker.id!)).map(marker => marker.id)).toEqual(district.ids);
      expect(geometry.markers).toHaveLength(district.ids.length + 1);
      for (const marker of geometry.markers) {
        expect(marker.width, `${district.name} ${marker.id} marker width`).toBeGreaterThanOrEqual(44);
        expect(marker.height, `${district.name} ${marker.id} marker height`).toBeGreaterThanOrEqual(44);
        expect(marker.x).toBeGreaterThanOrEqual(-1);
        expect(marker.y).toBeGreaterThanOrEqual(-1);
        expect(marker.right).toBeLessThanOrEqual(width + 1);
        expect(marker.bottom).toBeLessThanOrEqual(height + 1);
      }
      const tab = page.getByRole("button", { name: `${district.name} 지구`, exact: true });
      const tabSize = await tab.boundingBox();
      expect(tabSize!.width).toBeGreaterThanOrEqual(44);
      expect(tabSize!.height).toBeGreaterThanOrEqual(44);
      await expect(tab).toHaveAttribute("aria-pressed", "true");
      if (index === 0) {
        const account = baseline.snapshot.accounts[0];
        await page.locator(`[data-account="${account.id}"]`).click();
        await expect(page.getByRole("region", { name: "시설 행동" })).toContainText(`${account.number}번 계정`);
        await expect(page.getByRole("button", { name: "재확인", exact: true })).toBeEnabled();
        const controls = await page.locator(".game-tray button").evaluateAll(buttons => buttons.map(button => {
          const rect = button.getBoundingClientRect();
          return { name: (button as HTMLButtonElement).innerText, width: rect.width, height: rect.height };
        }));
        for (const control of controls) {
          expect(control.width, control.name).toBeGreaterThanOrEqual(44);
          expect(control.height, control.name).toBeGreaterThanOrEqual(44);
        }
        await expect(page.locator(".district-dock")).toBeHidden();
        for (const button of await page.locator(".district-dock button").all()) {
          await expect(button).toBeHidden();
          expect(await button.boundingBox()).toBeNull();
        }
        await expect.poll(() => page.locator(".game-tray .tray-heading img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        await page.screenshot({ path: `artifacts/mobile-game/qa/${name}-selected.png`, animations: "disabled" });
        await page.getByRole("button", { name: "시설 선택 닫기" }).click();
      }
    }
    expect(pageErrors).toEqual([]);
    expect(badResponses).toEqual([]);
    await info.attach("screen-metrics", { body: JSON.stringify({ name, width, height, state }), contentType: "application/json" });
  });
}

test("13계정·4공정을 지구마다 찾고 계정 상세·재고·일정에서 실제 업무 정보로 이어진다", async ({ page }) => {
  const { baseline } = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const discovered: string[] = [];
  for (const district of districts) {
    await visitDistrict(page, district.name);
    discovered.push(...await page.locator(".world [data-account]").evaluateAll(items => items.filter(e => getComputedStyle(e).visibility === "visible").map(e => (e as HTMLElement).dataset.account!)));
    await page.locator(`[data-process="${district.process}"]`).click();
    await expect(page.getByRole("region", { name: "시설 행동" })).toBeVisible();
    await expect(page.getByRole("region", { name: "시설 행동" })).toContainText("공정 시설");
    await page.getByRole("button", { name: "시설 선택 닫기" }).click();
  }
  expect([...new Set(discovered)].sort((a, b) => Number(a) - Number(b))).toEqual(baseline.snapshot.accounts.map((a: any) => a.id).sort((a: string, b: string) => Number(a) - Number(b)));

  await visitDistrict(page, "아틀리에");
  const account = baseline.snapshot.accounts[0];
  await page.locator(`[data-account="${account.id}"]`).click();
  await page.getByRole("button", { name: "상세" }).click();
  await expect(page.locator(".panel-account")).toBeVisible();
  await expect(page.locator(".panel-account")).toContainText(`${account.number}번 계정`);
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await page.locator(`[data-account="${account.id}"]`).click();
  await page.getByRole("button", { name: "재고 보기", exact: true }).click();
  await expect(page.locator(".panel-inventory")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "재고 검색" })).toBeVisible();
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await page.locator(`[data-account="${account.id}"]`).click();
  await page.getByRole("button", { name: /제출 일정/ }).click();
  await expect(page.locator(".panel-schedule")).toBeVisible();
  await expect(page.locator(".scope-line")).toContainText(`${account.number}번 계정`);
});

test("잘못된 연결 상태는 선명하게 드러나고 확인 지시를 차단한다", async ({ page }) => {
  const { baseline } = await fixture(page, { stale: true });
  await page.setViewportSize({ width: 360, height: 640 });
  await enter(page);
  await expect(page.locator(".mission.attention.stale")).toBeVisible();
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
  const parsed = await manifest.json();
  expect(parsed.name).toBe("BLUEKITE WORKS");

  const icon = await page.request.get(`${origin}/favicon.ico`);
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toMatch(/^image\/x-icon\b/);
  expect((await icon.body()).byteLength).toBeGreaterThan(0);
});
