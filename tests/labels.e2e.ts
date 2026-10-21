import { test, expect, type Page } from '@playwright/test';
let baseline: any;
test.beforeAll(async () => { baseline = await (await fetch('http://127.0.0.1:4317/api/world')).json(); });
async function openWorld(page: Page, state: string) {
  const data = structuredClone(baseline), now = new Date().toISOString();
  data.snapshot.receivedAt = state === 'stale' ? '2020-01-01T00:00:00Z' : now;
  data.snapshot.observedAt = now;
  data.commands = []; data.schedules = [];
  Object.assign(data.snapshot.automation, { enabled: false, productionEnabled: false, runLockActive: false, lanes: {} });
  for (const a of data.snapshot.accounts) Object.assign(a, { running: false, bound: true, status: 'ready_for_upload' });
  if (state === 'warning') Object.assign(data.snapshot.accounts[0], { status: 'login_required', message: '로그인이 필요합니다.' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session') return route.fulfill({ json: { authenticated: true, local: true } });
    if (path === '/api/world') return route.fulfill({ json: data });
    if (route.request().method() !== 'GET') return route.fulfill({ status: path === '/api/previews' ? 200 : 503, json: { ok: path === '/api/previews' } });
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__bizWorld?.ready);
  await page.evaluate(() => document.fonts.ready);
}
async function geometry(page: Page) {
  return page.evaluate(() => {
    const world = document.querySelector('.world')!.getBoundingClientRect();
    const labels = [...document.querySelectorAll<HTMLElement>('.world [data-account],.world [data-process]')].map(e => {
      const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest<HTMLElement>('[data-account],[data-process]');
      return { id: e.dataset.account || e.dataset.process, hit: hit?.dataset.account || hit?.dataset.process, x: r.x + r.width / 2 - world.x, y: r.y + r.height / 2 - world.y, width: r.width, height: r.height, anchorX: Number(e.dataset.anchorX), anchorY: Number(e.dataset.anchorY) };
    });
    const collisions = labels.flatMap((a, i) => labels.slice(i + 1).filter(b => Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 3.99 && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 3.99).map(b => [a.id, b.id]));
    const clipped = labels.filter(a => a.x - a.width / 2 < -0.1 || a.x + a.width / 2 > world.width + 0.1 || a.y - a.height / 2 < -0.1 || a.y + a.height / 2 > world.height + 0.1);
    return { labels, collisions, clipped, maxOffset: Math.max(...labels.map(a => Math.hypot(a.x - a.anchorX, a.y - a.anchorY))) };
  });
}
for (const [width, height] of [[360,640],[360,740],[390,844]]) for (const state of ['normal','warning','stale']) {
  test(`${width}×${height} ${state} 표찰은 건물 순서를 유지하고 모두 누를 수 있다`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await openWorld(page, state);
    await expect.poll(async () => {
      const g = await geometry(page);
      return g.labels.length === 17 && g.collisions.length === 0 && g.clipped.length === 0 && g.labels.every(a => a.id === a.hit) && g.maxOffset < 65;
    }).toBe(true);
    const g = await geometry(page);
    // In the unrotated portrait campus every marker must remain in its building's column.
    for (const label of g.labels) expect(Math.abs(label.x - label.anchorX)).toBeLessThan(25);
    const accounts = g.labels.filter(a => /^\d+$/.test(a.id!)).sort((a, b) => Number(a.id) - Number(b.id));
    for (let i = 3; i < accounts.length; i++) expect(accounts[i].y).toBeGreaterThan(accounts[i - 3].y);
    expect(errors).toEqual([]);
    await info.attach('label-geometry', { body: JSON.stringify(g), contentType: 'application/json' });
    await page.screenshot({ path: `artifacts/followup/${info.project.use.browserName}-${state}-${width}-${height}.png`, animations: 'disabled' });
  });
}
test('가장 짧은 세로 화면에서 13계정과 4공정이 정확한 업무 판으로 연결된다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openWorld(page, 'warning');
  for (const account of baseline.snapshot.accounts) {
    await page.locator(`.world [data-account="${account.id}"]`).click();
    await expect(page.locator('.panel-heading h2')).toHaveText(account.name);
    await page.getByRole('button', { name: '패널 닫기', exact: true }).click();
  }
  for (const [key, title] of [['generation','자동 운영'],['review','자동 운영'],['stock','재고 창고'],['submission','일정']]) {
    await page.locator(`.world [data-process="${key}"]`).click();
    await expect(page.locator('.panel-heading h2')).toHaveText(title);
    await page.getByRole('button', { name: '패널 닫기', exact: true }).click();
  }
});

test('짧은 세로 단지를 회전·확대하고 돌아와도 선택 영역과 계정 순서가 복구된다', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openWorld(page, 'warning');
  const records = [];
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: '시점 조절', exact: true }).click();
    await page.getByRole('button', { name: '시점 회전', exact: true }).click();
    await page.getByRole('button', { name: '시점 조절', exact: true }).click();
    await expect.poll(async () => {
      const g = await geometry(page);
      return g.collisions.length === 0 && g.clipped.length === 0 && g.labels.every(a => a.id === a.hit);
    }).toBe(true);
    records.push({ rotation: i + 1, ...await geometry(page) });
  }
  await page.getByRole('button', { name: '시점 조절', exact: true }).click();
  await page.getByRole('button', { name: '확대', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.zoom)).toBeGreaterThan(1);
  await page.getByRole('button', { name: '시점 조절', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.world [data-account],.world [data-process]')].filter(e => getComputedStyle(e).visibility === 'visible').every(e => {
    const r = e.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-account],[data-process]') === e;
  }))).toBe(true);
  await page.getByRole('button', { name: '시점 조절', exact: true }).click();
  await page.getByRole('button', { name: '전체 단지 보기', exact: true }).click();
  await page.getByRole('button', { name: '시점 조절', exact: true }).click();
  await expect.poll(async () => {
    const g = await geometry(page);
    return g.labels.length === 17 && g.maxOffset < 65 && g.collisions.length === 0 && g.clipped.length === 0 && g.labels.every(a => a.id === a.hit);
  }).toBe(true);
  expect(await page.locator('.panel:not([hidden])').count()).toBe(0);
  records.push({ reset: true, ...await geometry(page) });
  await info.attach('camera-geometry', { body: JSON.stringify(records), contentType: 'application/json' });
});
