import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { enter, hasPrivateOwnerCycleSource, ownerCycleFixture, pinchZoom } from "./game-fixture";

test("360×640 큰 글자에서도 13계정의 핵심 행이 읽히고 선택 뒤 전체 보기로 돌아온다", async ({ page }) => {
  await ownerCycleFixture(page); await page.setViewportSize({ width: 360, height: 640 }); await enter(page);
  await page.addStyleTag({content:"html{font-size:200%!important}"});
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("32px");
  await expect(page.locator("[data-account]")).toHaveCount(13);
  const signs = await page.locator("[data-account]").evaluateAll(items => items.map(item => {
    const node = item as HTMLElement, rect = node.getBoundingClientRect();
    return { id: node.dataset.account, visible: getComputedStyle(node).visibility === "visible",
      rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
      fields: ["[data-cycle-review]", "[data-cycle-submission]", "[data-cycle-next]"].map(selector => {
        const field = node.querySelector<HTMLElement>(selector)!, r = field.getBoundingClientRect();
        return { text: field.innerText.trim(), fontSize: getComputedStyle(field).fontSize,
          clipped: field.scrollWidth > field.clientWidth + 1 || field.scrollHeight > field.clientHeight + 1,
          x: r.x, y: r.y, right: r.right, bottom: r.bottom, client: [field.clientWidth, field.clientHeight], scroll: [field.scrollWidth, field.scrollHeight] };
      }) };
  }));
  if (!hasPrivateOwnerCycleSource) {
    await mkdir("artifacts/owner-cycle/qa", { recursive: true });
    await page.screenshot({ path: "artifacts/owner-cycle/qa/large-text-360x640.png", animations: "disabled" });
    await writeFile("artifacts/owner-cycle/qa/large-text-360x640-diagnostic.json", JSON.stringify({ viewport: { width: 360, height: 640 }, signs }, null, 2));
  }
  expect(signs.filter(sign => sign.visible)).toHaveLength(13);
  for (const sign of signs) {
    expect(sign.rect.x).toBeGreaterThanOrEqual(-1); expect(sign.rect.y).toBeGreaterThanOrEqual(-1);
    expect(sign.rect.right).toBeLessThanOrEqual(361); expect(sign.rect.bottom).toBeLessThanOrEqual(641);
    expect(sign.fields.every(field => field.text && !field.clipped)).toBe(true);
  }
  const fields = signs.flatMap(sign => sign.fields.map((field, index) => ({ id: sign.id, index, ...field })));
  const textOverlaps = fields.flatMap((a, i) => fields.slice(i + 1).flatMap(b => {
    const x = Math.min(a.right, b.right) - Math.max(a.x, b.x), y = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
    return x > .5 && y > .5 ? [`${a.id}:${a.index}/${b.id}:${b.index}`] : [];
  }));
  expect(textOverlaps).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.locator('[data-account="13"]').click();
  const tray = page.getByRole("region", { name: "시설 행동" });
  await expect(tray).toContainText("13번 계정");
  await expect(tray.locator(".cycle-review strong")).toHaveText("심사 비었음");
  await expect(tray.locator(".cycle-blocker")).toContainText("다른 계정으로 로그인됨");
  await page.getByRole("button", { name: "시설 선택 닫기" }).click();
  await expect(page.locator("[data-account]")).toHaveCount(13);
  const returned = await page.evaluate(() => ({ zoom: (window as any).__bizWorld.zoom, accounts: [...document.querySelectorAll<HTMLElement>("[data-account]")].map(node => {
    const r = node.getBoundingClientRect(); return { id: node.dataset.account, visibility: getComputedStyle(node).visibility, rect: [r.x,r.y,r.width,r.height] };
  }) }));
  if (!hasPrivateOwnerCycleSource) {
    await page.screenshot({ path: "artifacts/owner-cycle/qa/large-text-360x640-return.png", animations: "disabled" });
    await writeFile("artifacts/owner-cycle/qa/large-text-360x640-diagnostic.json", JSON.stringify({ viewport: { width: 360, height: 640 }, signs, returned }, null, 2));
  }
  await expect.poll(() => page.locator("[data-account]").evaluateAll(items => items.filter(item => getComputedStyle(item).visibility === "visible").length)).toBe(13);
});

test("핀치 동작은 카메라 장면을 갱신하며 상태·계정 수를 유지한다", async ({ page }) => {
  await ownerCycleFixture(page); await page.setViewportSize({ width: 390, height: 844 }); await enter(page);
  const before = await page.locator(".world canvas").screenshot();
  const cargo = await page.evaluate(() => (window as any).__bizWorld.cargo.map((item: any) => item.ready));
  const frame = await page.evaluate(() => (window as any).__bizWorld.totalFrames);
  await pinchZoom(page);
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.zoom)).toBeGreaterThan(1);
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.totalFrames)).toBeGreaterThan(frame);
  expect((await page.locator(".world canvas").screenshot()).equals(before)).toBe(false);
  expect(await page.evaluate(() => (window as any).__bizWorld.cargo.map((item: any) => item.ready))).toEqual(cargo);
  await expect(page.locator("[data-account]")).toHaveCount(13);
  await page.getByRole("button", { name: "전체 보기", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.zoom)).toBeCloseTo(1, 1);
  await expect.poll(() => page.evaluate(() => {
    const labels=[...document.querySelectorAll<HTMLElement>("[data-account]")].map(node=>{
      const r=node.getBoundingClientRect(); return {id:node.dataset.account,visible:getComputedStyle(node).visibility==="visible"&&r.width>0&&r.height>0,
        rect:[r.x,r.y,r.width,r.height].map(value=>Math.round(value*10)/10)};
    });
    return {selected:(window as any).__bizWorld.selected??null,zoom:(window as any).__bizWorld.zoom,visible:labels.filter(item=>item.visible).length,labels};
  })).toMatchObject({selected:null,visible:13});
});

test("관측이 끊기면 마지막 심사 수를 미확인으로 바꾸고 계정 지시를 막는다", async ({ page }) => {
  await ownerCycleFixture(page, { stale: true }); await page.setViewportSize({ width: 390, height: 844 }); await enter(page);
  await expect(page.locator(".mission.stale")).toBeVisible();
  await expect(page.locator('[data-account="2"] [data-cycle-review]')).toContainText("상태 미확인");
  await expect(page.locator('[data-account="2"] [data-cycle-submission]')).toContainText("새 관측 대기");
  await page.locator('[data-account="2"]').click();
  await expect(page.getByRole("region", { name: "시설 행동" })).toContainText("연결 확인");
  await expect(page.getByRole("button", { name: "계정 재확인" })).toBeDisabled();
});

test("PWA manifest와 favicon을 올바른 MIME 형식으로 제공한다", async ({ page }) => {
  await ownerCycleFixture(page);
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
