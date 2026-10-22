import { test, expect } from "@playwright/test";
import { baselineWorld, enter, fixture } from "./game-fixture";

const viewports = [
  ["mobile-360", 360, 640], ["mobile-390", 390, 844], ["mobile-430", 430, 932],
  ["phone-landscape", 844, 390], ["small-landscape", 640, 360],
  ["tablet-portrait", 768, 1024], ["desktop", 1440, 900], ["desktop-portrait", 900, 1440],
] as const;
const stages = ["generation", "review", "submission", "inspection", "archive", "revenue"] as const;
const processKeys = ["generation", "review", "stock", "submission", "inspection", "archive", "revenue"] as const;

test.beforeAll(async () => { await baselineWorld(); });

for (const [name, width, height] of viewports) {
  test(`${name} ${width}×${height}: 하나의 화면에서 13개 창고와 7개 사업 시설을 모두 찾는다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const { baseline } = await fixture(page);
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await enter(page);

    const expectedIds = baseline.snapshot.accounts.map((account: any) => account.id).sort((a: string, b: string) => Number(a) - Number(b));
    await expect(page.locator("[data-account]")).toHaveCount(13);
    await expect(page.locator("[data-process]")).toHaveCount(6);
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.processes.length)).toBe(7);
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.visibleAccounts.length)).toBe(13);
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.loaded)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.modelFailures.length)).toBe(0);

    const evidence = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll<HTMLElement>("[data-account]")];
      const world = document.querySelector<HTMLElement>(".world")!.getBoundingClientRect();
      return {
        accountIds: buttons.map(button => button.dataset.account).sort((a, b) => Number(a) - Number(b)),
        markers: buttons.map(button => {
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          const css = getComputedStyle(button);
          return { id: button.dataset.account, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height,
            cssWidth: parseFloat(css.width), cssHeight: parseFloat(css.height),
            visibility: getComputedStyle(button).visibility, hittable: !!hit && button.contains(hit), label: button.getAttribute("aria-label") };
        }),
        accountOverlapPairs: buttons.flatMap((button, index) => buttons.slice(index + 1).flatMap(other => {
          const a = button.getBoundingClientRect(), b = other.getBoundingClientRect();
          return a.right > b.left && b.right > a.left && a.bottom > b.top && b.bottom > a.top
            ? [`${button.dataset.account}/${other.dataset.account}`] : [];
        })),
        facilityOverlapPairs: [...document.querySelectorAll<HTMLElement>("[data-process]")].flatMap((button, index, all) => all.slice(index + 1).flatMap(other => {
          const a = button.getBoundingClientRect(), b = other.getBoundingClientRect();
          return a.right > b.left && b.right > a.left && a.bottom > b.top && b.bottom > a.top
            ? [`${button.dataset.process}/${other.dataset.process}`] : [];
        })),
        facilityHits: [...document.querySelectorAll<HTMLElement>("[data-process]")].map(button => {
          const rect = button.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return { key: button.dataset.process, hittable: !!hit && button.contains(hit) };
        }),
        world: { x: world.x, y: world.y, right: world.right, bottom: world.bottom },
        debug: (window as any).__bizWorld,
        pageWidth: document.documentElement.scrollWidth,
      };
    });
    expect(evidence.accountIds).toEqual(expectedIds);
    expect(evidence.pageWidth).toBeLessThanOrEqual(width);
    for (const marker of evidence.markers) {
      expect(marker.visibility, `account ${marker.id}`).toBe("visible");
      expect(marker.width, `account ${marker.id} projected width`).toBeGreaterThanOrEqual(43.99);
      expect(marker.height, `account ${marker.id} projected height`).toBeGreaterThanOrEqual(43.99);
      expect(marker.cssWidth, `account ${marker.id} CSS hit width`).toBeGreaterThanOrEqual(44);
      expect(marker.cssHeight, `account ${marker.id} CSS hit height`).toBeGreaterThanOrEqual(44);
      expect(marker.x, `account ${marker.id} left`).toBeGreaterThanOrEqual(-1);
      expect(marker.y, `account ${marker.id} top`).toBeGreaterThanOrEqual(-1);
      expect(marker.right, `account ${marker.id} right`).toBeLessThanOrEqual(width + 1);
      expect(marker.bottom, `account ${marker.id} bottom`).toBeLessThanOrEqual(height + 1);
      expect(marker.hittable, `account ${marker.id} center must hit its own label`).toBe(true);
    }
    expect(evidence.accountOverlapPairs, "warehouse labels must not overlap each other").toEqual([]);
    expect(evidence.facilityOverlapPairs, "facility labels must not overlap each other").toEqual([]);
    for (const facility of evidence.facilityHits) expect(facility.hittable, `${facility.key} center must hit its own sign`).toBe(true);
    expect(evidence.debug.visibleAccounts.map((id: string) => id).sort((a: string, b: string) => Number(a) - Number(b))).toEqual(expectedIds);
    expect(evidence.debug.layoutColumns ?? 4).toBeGreaterThanOrEqual(2);
    for (const stage of stages) await expect(page.locator(`[data-process="${stage}"]`)).toBeVisible();
    await expect(page.locator(".district-dock")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: `artifacts/industrial-game/qa/${name}-world.png`, animations: "disabled" });
  });
}

test("같은 화면에서 1440→844→640px로 바꾸면 4→7→5열로 재배치해도 13개 창고가 남는다", async ({ page }) => {
  await fixture(page);
  const transitions = [[1440, 900, 4], [844, 390, 7], [640, 360, 5]] as const;
  await enter(page);
  for (const [width, height, columns] of transitions) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.layoutColumns)).toBe(columns);
    await expect(page.locator("[data-account]")).toHaveCount(13);
    await expect.poll(() => page.locator("[data-account]").evaluateAll(items => {
      const visible = items.filter(item => getComputedStyle(item).visibility === "visible");
      const accessible = visible.every(item => {
        const r = item.getBoundingClientRect(), css = getComputedStyle(item);
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return r.width >= 43.99 && r.height >= 43.99 && parseFloat(css.width) >= 44 && parseFloat(css.height) >= 44 && !!hit && item.contains(hit);
      });
      const overlapFree = visible.every((item, i) => visible.slice(i + 1).every(other => {
        const a = item.getBoundingClientRect(), b = other.getBoundingClientRect();
        return !(a.right > b.left && b.right > a.left && a.bottom > b.top && b.bottom > a.top);
      }));
      return { visible: visible.length, accessible, overlapFree };
    })).toEqual({ visible: 13, accessible: true, overlapFree: true });
  }
});

test("계정 창고의 실제 3D 모형을 눌러도 같은 번호의 계정이 선택된다", async ({ page }) => {
  const { baseline } = await fixture(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await enter(page);
  const targetId = baseline.snapshot.accounts[12].id;
  const physical = await page.evaluate((id) => {
    const point = (window as any).__bizWorld.physicalAccounts.find((item: any) => item.id === id);
    return { x: point.x, y: point.y };
  }, targetId);
  await page.locator(".world canvas").click({ position: physical, force: true });
  await expect(page.getByRole("region", { name: "시설 행동" })).toContainText("13번 계정");
  await expect(page.locator("[data-account]")).toHaveCount(13);
  await expect.poll(() => page.locator("[data-account]").evaluateAll(items => {
    const visible = items.filter(item => getComputedStyle(item).visibility === "visible");
    const targetsFit = visible.every(item => {
      const r = item.getBoundingClientRect(), css = getComputedStyle(item);
      return r.width >= 43.99 && r.height >= 43.99 && parseFloat(css.width) >= 44 && parseFloat(css.height) >= 44;
    });
    const hittable = visible.every(item => { const r = item.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && item.contains(hit); });
    const undersized = visible.flatMap(item => {
      const r = item.getBoundingClientRect(), css = getComputedStyle(item);
      return r.width >= 43.99 && r.height >= 43.99 && parseFloat(css.width) >= 44 && parseFloat(css.height) >= 44
        ? [] : [{ id: item.getAttribute("data-account"), width: r.width, height: r.height, cssWidth: css.width, cssHeight: css.height }];
    });
    const overlapFree = visible.every((item, i) => visible.slice(i + 1).every(other => {
      const a = item.getBoundingClientRect(), b = other.getBoundingClientRect();
      return !(a.right > b.left && b.right > a.left && a.bottom > b.top && b.bottom > a.top);
    }));
    return { count: visible.length, targetsFit, undersized, hittable, overlapFree };
  })).toEqual({ count: 13, targetsFit: true, undersized: [], hittable: true, overlapFree: true });
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.lastPick.hits.some((hit: any) => hit.account === "13"))).toBe(true);
  await page.screenshot({ path: "artifacts/industrial-game/qa/mesh-account-13.png", animations: "disabled" });
});

test("빈 창고·일부 적재·가득 찬 창고가 실제 수량과 화물 모형으로 구별된다", async ({ page }) => {
  const { DB, snapshot } = await fixture(page);
  const [empty, partial, full] = snapshot.accounts.slice(0, 3);
  Object.assign(empty, { ready: 0, target: 100 });
  Object.assign(partial, { ready: 35, target: 100 });
  Object.assign(full, { ready: 100, target: 100 });
  await DB.prepare("UPDATE snapshots SET data=? WHERE id='miricanvas'").bind(JSON.stringify(snapshot)).run();
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.cargo.slice(0, 3).map((item: any) => item.visible))).toEqual([0, 7, 18]);
  await expect(page.locator(`[data-account="${empty.id}"]`)).toContainText("0");
  await expect(page.locator(`[data-account="${partial.id}"]`)).toContainText("35");
  await expect(page.locator(`[data-account="${full.id}"]`)).toContainText("100");
  const before = await page.evaluate(() => (window as any).__bizWorld.cargo.map((item: any) => item.ready));
  await page.locator(`[data-account="${partial.id}"]`).click();
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.cargo.map((item: any) => item.ready))).toEqual(before);
  await expect(page.locator("[data-account]")).toHaveCount(13);
  await page.getByRole("button", { name: /2번 계정 재고 35개 보기/ }).click();
  await expect(page.locator(".panel-inventory")).toBeVisible();
  await page.getByRole("button", { name: "패널 닫기" }).click();
  const screenshot = await page.locator(".world canvas").screenshot();
  expect(screenshot.byteLength).toBeGreaterThan(0);
  await page.screenshot({ path: "artifacts/industrial-game/qa/warehouse-stock-levels.png", animations: "disabled" });
});

test("초기 200% 글자·좁은 세로 화면에서도 13개 창고를 유지하고 가로 넘침이 없다", async ({ page }) => {
  await page.addInitScript(() => { document.documentElement.style.fontSize = "200%"; });
  const { baseline } = await fixture(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await enter(page);
  await expect(page.locator("[data-account]")).toHaveCount(13);
  await expect.poll(() => page.locator("[data-account]").evaluateAll(items => items.filter(item => getComputedStyle(item).visibility === "visible").length)).toBe(13);
  await expect.poll(() => page.locator("[data-account]").evaluateAll(items => items.every(item => {
    const rect = item.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return !!hit && item.contains(hit);
  }))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.locator(`[data-account="${baseline.snapshot.accounts[0].id}"]`).click();
  await expect(page.getByRole("region", { name: "시설 행동" })).toContainText("1번 계정");
  await expect(page.locator("[data-account]")).toHaveCount(13);
  await expect.poll(() => page.locator("[data-account]").evaluateAll(items => items.filter(item => getComputedStyle(item).visibility === "visible").length)).toBe(13);
  await page.screenshot({ path: "artifacts/industrial-game/qa/mobile-360-large-text.png", animations: "disabled" });
});

test("끊긴 관측은 빈 재고로 오인되지 않고, 로그인 문제는 해당 트럭의 장애로 표시된다", async ({ page }) => {
  const { baseline } = await fixture(page, { stale: true, issue: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await expect(page.locator(".mission.stale")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.cargo.every((item: any) => item.unknown))).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.accountFlows.find((item: any) => item.accountId === "1")?.unknown)).toBe(true);
  expect((await page.evaluate(() => (window as any).__bizWorld.cargo[0].ready))).toBeGreaterThan(0);
  await page.locator(`[data-account="${baseline.snapshot.accounts[0].id}"]`).click();
  await expect(page.getByRole("button", { name: "재확인", exact: true })).toBeDisabled();
});

test("로그인 장애가 생기면 해당 계정의 운송 차량이 고장 상태로 바뀐다", async ({ page }) => {
  await fixture(page, { issue: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.accountFlows.find((item: any) => item.accountId === "1")?.dispatchMode)).toBe("fault");
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.trucks.find((item: any) => item.id === "1")?.mode)).toBe("fault");
  await expect(page.locator('[data-account="1"]')).toHaveClass(/danger|warning/);
  await page.screenshot({ path: "artifacts/industrial-game/qa/account-1-truck-fault.png", animations: "disabled" });
});

test("생산부터 월별 장부까지 일곱 시설이 한 공간에서 각자의 업무 행동을 연다", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  expect(await page.evaluate(() => (window as any).__bizWorld.processes.map((item: any) => item.key).sort())).toEqual([...processKeys].sort());
  await page.locator('[data-account="1"]').click();
  await expect(page.getByRole("region", { name: "시설 행동" })).toBeVisible();
  await expect(page.getByRole("button", { name: /1번 계정 재고 \d+개 보기/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /1번 계정 심사 \d+개 보기/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /1번 계정 승인·공개 \d+개 보기/ })).toBeVisible();
  await page.getByRole("button", { name: "시설 선택 닫기" }).click();
  for (const stage of stages) {
    await page.locator(`[data-process="${stage}"]`).click();
    if (stage === "revenue") {
      await expect(page.locator(".panel-revenue")).toBeVisible();
      await expect(page.locator(".finance-vault")).toHaveCount(12);
      await page.getByRole("button", { name: "패널 닫기" }).click();
      continue;
    }
    await expect(page.getByRole("region", { name: "시설 행동" })).toBeVisible();
    await expect(page.locator(".tray-heading h2")).toBeVisible();
    await page.getByRole("button", { name: "시설 선택 닫기" }).click();
  }
});
