import { test, expect } from "@playwright/test";
import { enter, hasPrivateOwnerCycleSource, ownerCycleFixture } from "./game-fixture";

const viewportCases = [
  ["large portrait", 430, 932], ["short landscape", 844, 390], ["compact landscape", 640, 360],
  ["tablet", 768, 1024], ["desktop portrait", 900, 1440],
] as const;
const expectedProcesses = ["generation", "review", "stock", "submission", "inspection", "archive", "revenue"];

async function settleWorldGeometry(page: import("@playwright/test").Page) {
  const result = await page.evaluate(() => new Promise<{ stable: boolean; state: any }>(resolve => {
    let previous = "", matches = 0, frames = 0, state: any = null;
    const inspect = () => {
      const world = (window as any).__bizWorld;
      const canvas = document.querySelector(".world canvas")?.getBoundingClientRect();
      const labels = [...document.querySelectorAll<HTMLElement>("[data-account]")].map(node => {
        const rect = node.getBoundingClientRect(); return [node.dataset.account, ...[rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value * 10) / 10), getComputedStyle(node).visibility];
      });
      state = { viewport: [window.innerWidth, window.innerHeight], ready: world?.ready, visible: world?.visibleAccounts?.length, processes: world?.processes?.length,
        canvas: canvas && [canvas.width, canvas.height], labels };
      const sample = JSON.stringify(state);
      matches = sample === previous ? matches + 1 : 0; previous = sample; frames++;
      if (matches >= 3 && world?.ready === true && world?.visibleAccounts?.length === 13 && world?.processes?.length === 7 && (canvas?.width || 0) > 0) return resolve({ stable: true, state });
      if (frames >= 120) return resolve({ stable: false, state });
      requestAnimationFrame(inspect);
    };
    requestAnimationFrame(inspect);
  }));
  expect(result.stable, `world layout settles across consecutive rendered frames: ${JSON.stringify(result.state)}`).toBe(true);
}

async function overview(page: import("@playwright/test").Page, width: number, height: number) {
  const signs = await page.locator("[data-account]").evaluateAll(items => items.map(item => {
    const node = item as HTMLElement, r = node.getBoundingClientRect(), css = getComputedStyle(node);
    const fields = ["[data-cycle-review]", "[data-cycle-submission]", "[data-cycle-next]"].map(selector => {
      const field = node.querySelector<HTMLElement>(selector)!, rect = field.getBoundingClientRect();
      return { text: field.innerText.trim(), rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
        clipped: field.scrollWidth > field.clientWidth + 1 || field.scrollHeight > field.clientHeight + 1 };
    });
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { id: node.dataset.account!, visible: css.visibility === "visible" && r.width > 0 && r.height > 0,
      rect: { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
      css: { width: parseFloat(css.width), height: parseFloat(css.height) }, hit: !!hit && node.contains(hit),
      label: node.getAttribute("aria-label") || "", fields };
  }));
  expect(signs).toHaveLength(13);
  for (const sign of signs) {
    expect(sign.visible, `${sign.id}번 visible`).toBe(true);
    expect(sign.rect.width).toBeGreaterThanOrEqual(43.99); expect(sign.rect.height).toBeGreaterThanOrEqual(43.99);
    expect(sign.css.width).toBeGreaterThanOrEqual(44); expect(sign.css.height).toBeGreaterThanOrEqual(44);
    expect(sign.rect.x).toBeGreaterThanOrEqual(-1); expect(sign.rect.y).toBeGreaterThanOrEqual(-1);
    expect(sign.rect.right).toBeLessThanOrEqual(width + 1); expect(sign.rect.bottom).toBeLessThanOrEqual(height + 1);
    expect(sign.hit, `${sign.id}번 center hit`).toBe(true);
    expect(sign.fields.map(field => field.text).every(Boolean)).toBe(true);
    expect(sign.fields.filter(field => field.clipped)).toEqual([]);
  }
  const collisions = signs.flatMap((a, i) => signs.slice(i + 1).flatMap(b => {
    const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.x, b.rect.x);
    const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.y, b.rect.y);
    return x > 0 && y > 0 ? [`${a.id}/${b.id}`] : [];
  }));
  expect(collisions).toEqual([]);
  const textFields = signs.flatMap(sign => sign.fields.map((field, index) => ({ id: sign.id, index, rect: field.rect })));
  const textCollisions = textFields.flatMap((a, i) => textFields.slice(i + 1).flatMap(b => {
    const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.x, b.rect.x);
    const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.y, b.rect.y);
    return x > .5 && y > .5 ? [`${a.id}:${a.index}/${b.id}:${b.index}`] : [];
  }));
  expect(textCollisions, "계정 상태 명판의 실제 텍스트 영역이 서로 겹치지 않아야 함").toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  return signs;
}

test("모바일·가로·태블릿·PC 첫 화면에서 13개 계정 상태와 7공정을 잃지 않는다", async ({ page }) => {
  const { source } = await ownerCycleFixture(page);
  const pageErrors: string[] = [], badResponses: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400 && new URL(response.url()).origin === new URL(page.url() || process.env.BIZ_TEST_ORIGIN || "http://127.0.0.1:4317").origin)
      badResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  for (const [name, width, height] of viewportCases) {
    await page.setViewportSize({ width, height });
    if (name === "large portrait") await enter(page);
    else await expect.poll(() => page.evaluate(() => (window as any).__bizWorld?.ready === true && (window as any).__bizWorld?.processes?.length === 7)).toBe(true);
    await settleWorldGeometry(page);
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld?.view)).toBe("owner-cycle-workshop");
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld?.loaded)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld?.modelFailures)).toEqual([]);
    await expect(page.locator("[data-account]")).toHaveCount(13);
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.visibleAccounts.length)).toBe(13);
    const signs = await overview(page, width, height);
    expect(signs.map(sign => sign.id).sort((a, b) => Number(a) - Number(b))).toEqual(source.snapshot.accounts.map((a: any) => a.id).sort((a: string, b: string) => Number(a) - Number(b)));
    const processKeys = await page.evaluate(() => (window as any).__bizWorld.processes.map((process: any) => process.key).sort());
    expect(processKeys).toEqual([...expectedProcesses].sort());
    const processEntities = await page.evaluate(() => (window as any).__bizWorld.processes.map((process: any) => ({ key: process.key, role: process.role })));
    expect(processEntities.every((process: any) => Boolean(process.role))).toBe(true);
    const controls = await page.locator("[data-process]").evaluateAll(items => items.map(item => ({ key: (item as HTMLElement).dataset.process, rect: item.getBoundingClientRect().toJSON() })));
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every((control: any) => control.rect.width > 0 && control.rect.height > 0)).toBe(true);
    const dock = page.getByRole("navigation", { name: "관제 도구" });
    await expect(dock).toBeVisible();
    await expect(dock.getByRole("button")).toHaveCount(4);
    if (!hasPrivateOwnerCycleSource && (name === "short landscape" || name === "compact landscape" || name === "desktop portrait"))
      await page.screenshot({ path: `artifacts/owner-cycle/qa/overview-${width}x${height}.png`, animations: "disabled" });
  }
  expect(pageErrors).toEqual([]);
  expect(badResponses).toEqual([]);
});

test("같은 세션의 화면 크기 변경 후에도 13계정 전경과 계정 식별이 복구된다", async ({ page }) => {
  await ownerCycleFixture(page); await page.setViewportSize({ width: 1440, height: 900 }); await enter(page);
  for (const [width, height] of [[1440, 900], [844, 390], [640, 360]] as const) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => (window as any).__bizWorld?.ready === true && (window as any).__bizWorld?.processes?.length === 7 && (window as any).__bizWorld.visibleAccounts?.length === 13)).toBe(true);
    if (width !== 1440) await settleWorldGeometry(page);
    await expect(page.locator("[data-account]")).toHaveCount(13);
    const visible = await page.locator("[data-account]").evaluateAll(items => items.filter(item => getComputedStyle(item).visibility === "visible").length);
    expect(visible).toBe(13);
    expect(await page.evaluate(() => (window as any).__bizWorld.processes.length)).toBe(7);
  }
  await page.locator('[data-account="13"]').click();
  await expect(page.getByRole("region", { name: "시설 행동" })).toContainText("13번 계정");
  await expect(page.locator("[data-account]")).toHaveCount(13);
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.physicalAccounts.length)).toBe(13);
  await expect(page.getByRole("region", { name: "시설 행동" }).locator(".cycle-review strong")).toHaveText("심사 비었음");
  await page.getByRole("button", { name: "시설 선택 닫기" }).click();
  await expect.poll(() => page.locator("[data-account]").evaluateAll(items => items.filter(item => getComputedStyle(item).visibility === "visible").length)).toBe(13);
});

test("640×360 새 진입에서도 13계정 명판이 화면 안에 읽히고 눌린다", async ({ page }) => {
  await ownerCycleFixture(page);
  await page.setViewportSize({ width: 640, height: 360 }); await enter(page); await settleWorldGeometry(page);
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld?.visibleAccounts?.length)).toBe(13);
  await overview(page, 640, 360);
  if (!hasPrivateOwnerCycleSource) await page.screenshot({ path: "artifacts/owner-cycle/qa/overview-fresh-640x360.png", animations: "disabled" });
});

test("13번 계정 심사대를 실제 mesh로 선택해도 해당 계정의 실패와 복귀 상태가 맞다", async ({ page }) => {
  await ownerCycleFixture(page); await page.setViewportSize({ width: 390, height: 844 }); await enter(page);
  const physical = await page.evaluate(() => (window as any).__bizWorld.physicalAreas.find((area: any) => area.id === "13" && area.area === "review"));
  const canvas = page.locator(".world canvas"), bounds = await canvas.boundingBox(); expect(bounds).not.toBeNull();
  const point = { x: physical.x, y: physical.y };
  const exposed = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x: bounds!.x + point.x, y: bounds!.y + point.y });
  expect(exposed, "실제 심사대 선택점이 HTML 명판 뒤에 가려지면 안 됨").toBe("CANVAS");
  await canvas.click({ position: point, force: true });
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.lastPick?.hits?.[0])).toMatchObject({ account: "13", area: "review" });
  await expect(page.locator(".panel-inventory")).toBeVisible();
  await page.getByRole("button", { name: "패널 닫기" }).click();
  const tray = page.getByRole("region", { name: "시설 행동" });
  await expect(tray).toContainText("13번 계정");
  await expect(tray.locator(".cycle-review strong")).toHaveText("심사 비었음");
  await expect(tray.locator(".cycle-blocker")).toContainText("다른 계정으로 로그인됨");
  await expect(tray.locator(".cycle-next")).toContainText("재시도");
  await page.getByRole("button", { name: "시설 선택 닫기" }).click();
  await expect.poll(() => page.locator("[data-account]").evaluateAll(items => items.filter(item => getComputedStyle(item).visibility === "visible").length)).toBe(13);
});

test("빈·부분·충분한 제출 그림 수량은 실제 종이 묶음의 세 단계로 보인다", async ({ page }) => {
  const { DB, snapshot } = await ownerCycleFixture(page, { mutateSnapshot(s) {
    for (const [id, ready] of [["1", 0], ["2", 35], ["3", 100]] as const) {
      const account = s.accounts.find((item: any) => item.id === id)!; account.ready = ready; account.target = 100;
      s.assets = s.assets.filter((asset: any) => !(asset.accountId === id && asset.state === "ready"));
      for (let n = 1; n <= ready; n++) s.assets.push({ id: `qa-ready-${id}-${n}`, title: `QA 그림 ${n}`, accountId: id,
        state: "ready", phase: "ready", owned: true, eligible: true, keywords: [], updatedAt: new Date().toISOString() });
    }
  }});
  await page.setViewportSize({ width: 390, height: 844 }); await enter(page);
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.cargo.slice(0, 3).map((item: any) => item.ready))).toEqual([0, 35, 100]);
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.cargo.slice(0, 3).map((item: any) => item.visible))).toEqual([0, 2, 3]);
  const before = await page.evaluate(() => (window as any).__bizWorld.cargo.map((item: any) => item.ready));
  await page.locator('[data-account="2"]').click();
  await expect(page.getByRole("region", { name: "시설 행동" })).toContainText("제출할 그림 35");
  await page.getByRole("button", { name: /제출할 그림 35/ }).click();
  await expect(page.locator(".panel-inventory")).toBeVisible();
  await expect(page.getByRole("heading", { name: "제출할 그림" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__bizWorld.cargo.map((item: any) => item.ready))).toEqual(before);
  await expect.poll(() => DB.prepare("SELECT count(*) AS n FROM commands").first().then((row: any) => row.n)).toBe(0);
  expect(snapshot.accounts.find((item: any) => item.id === "2").ready).toBe(35);
});

test("기존 세 실패는 이유별로 보이고 정상 심사는 예상 결과일·확인 시각을 유지한다", async ({ page }) => {
  await ownerCycleFixture(page); await page.setViewportSize({ width: 360, height: 640 }); await enter(page);
  await expect(page.locator('[data-account="1"] [data-cycle-review]')).toContainText("심사 비었음");
  await expect(page.locator('[data-account="1"] [data-cycle-submission]')).toContainText("결과 확인 실패");
  await expect(page.locator('[data-account="1"] [data-cycle-next]')).toContainText("재시도");
  await expect(page.locator('[data-account="6"] [data-cycle-review]')).toContainText("심사 20");
  await expect(page.locator('[data-account="6"] [data-cycle-submission]')).toContainText("언어 전환 실패");
  await expect(page.locator('[data-account="13"] [data-cycle-review]')).toContainText("심사 비었음");
  await expect(page.locator('[data-account="13"] [data-cycle-submission]')).toContainText("로그인 계정 다름");
  for (const id of ["1", "6", "13"]) {
    const cycle = await page.evaluate((account) => (window as any).__bizWorld.cycles.find((item: any) => item.id === account), id);
    expect(cycle.blocked).toBe(true); expect(cycle.nextKind).toBe("retry");
  }
  const review = await page.evaluate(() => (window as any).__bizWorld.review);
  expect(review.find((item: any) => item.id === "1")).toMatchObject({ count: 0, fault: true, gate: false });
  expect(review.find((item: any) => item.id === "6")).toMatchObject({ count: 20, fault: true, gate: false });
  expect(review.find((item: any) => item.id === "13")).toMatchObject({ count: 0, gate: true });
  const healthy = await page.locator('[data-account="2"] [data-cycle-submission]').innerText();
  expect(healthy).toMatch(/^결과 .+ 예상$/);
  await page.locator('[data-account="13"]').click();
  await expect(page.getByRole("region", { name: "시설 행동" }).locator(".cycle-blocker")).toContainText("다른 계정으로 로그인됨");
});

test("작업기 정지·끊긴 관측·실패 계정은 제출 또는 재확인을 완료한 척하지 않는다", async ({ page, context }) => {
  await ownerCycleFixture(page, { mutateSnapshot(snapshot) { snapshot.automation.enabled = false; } });
  await page.setViewportSize({ width: 390, height: 844 }); await enter(page);
  await expect(page.locator('[data-account="2"] [data-cycle-submission]')).toHaveText("자동 제출 정지");
  await expect(page.locator('[data-account="2"] [data-cycle-next]')).toHaveText("재개 필요");
  await expect(page.locator('[data-account="1"] [data-cycle-submission]')).toContainText("결과 확인 실패");
  await page.locator('[data-account="1"]').click();
  await expect(page.getByRole("region", { name: "시설 행동" })).toContainText("제출 결과 확인 실패");
  await expect(page.getByRole("button", { name: "계정 재확인" })).toBeEnabled();
  await page.close();

  const stale = await context.newPage(); await stale.setViewportSize({ width: 390, height: 844 });
  await ownerCycleFixture(stale, { stale: true }); await enter(stale);
  await expect(stale.locator(".mission.stale")).toBeVisible();
  await expect(stale.locator('[data-account="2"] [data-cycle-review]')).toContainText("상태 미확인");
  await expect(stale.locator('[data-account="2"] [data-cycle-submission]')).toContainText("새 관측 대기");
  await expect(stale.locator('[data-account="2"] [data-cycle-next]')).toContainText("일정 미확인");
  await stale.locator('[data-account="2"]').click();
  await expect(stale.getByRole("button", { name: "계정 재확인" })).toBeDisabled();
});

test("생산·제출 설정·수익 시설을 눌러 올바른 작업 패널을 연다", async ({ page }) => {
  await ownerCycleFixture(page, { mutateSnapshot(snapshot) {
    const observedAt = new Date().toISOString();
    snapshot.automation.enabled = true; snapshot.automation.productionEnabled = true;
    snapshot.automation.lanes = { generation: { status: "working", observedAt }, review: { status: "idle", observedAt } };
  }}); await page.setViewportSize({ width: 390, height: 844 }); await enter(page);
  const keys = await page.evaluate(() => (window as any).__bizWorld.processes.map((item: any) => item.key));
  expect(keys.sort()).toEqual([...expectedProcesses].sort());
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.processes.find((item: any) => item.key === "generation")?.active)).toBe(true);
  for (const [key, expected] of [["generation", "자동화 설정"], ["submission", "다음 일정"]] as const) {
    await page.locator(`[data-process="${key}"]`).click();
    await expect(page.getByRole("region", { name: "시설 행동" })).toBeVisible();
    await expect(page.getByRole("button", { name: expected, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "시설 선택 닫기" }).click();
  }
  await page.locator('[data-process="revenue"]').click();
  await expect(page.locator(".panel-revenue")).toBeVisible();
  await expect(page.locator(".finance-vault")).toHaveCount(12);
  await page.getByRole("button", { name: "패널 닫기" }).click();
});
