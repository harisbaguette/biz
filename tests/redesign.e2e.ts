import { test, expect, type Page } from '@playwright/test';
// @ts-expect-error Exercise the real Worker through an isolated D1 adapter.
import { api } from '../worker/index.mjs';
// @ts-expect-error In-memory SQLite implementation of the D1 contract.
import { database } from './db.mjs';
let baseline: any;
test.beforeAll(async () => { baseline = await (await fetch('http://127.0.0.1:4317/api/world')).json(); });
async function fixture(page: Page, options: { issue?: boolean; invalidTime?: boolean } = {}) {
  const DB = database(), snapshot = structuredClone(baseline.snapshot);
  snapshot.observedAt = new Date().toISOString();
  snapshot.automation = { ...snapshot.automation, enabled: false, productionEnabled: false, runLockActive: false, lanes: {}, nextAt: options.invalidTime ? 'invalid-time' : new Date(Date.now() + 3600000).toISOString() };
  for (const account of snapshot.accounts) Object.assign(account, { status: 'ready_for_upload', bound: true, running: false });
  if (options.issue) Object.assign(snapshot.accounts[0], { status: 'login_required', message: '로그인이 필요합니다.' });
  await DB.prepare('INSERT INTO snapshots VALUES(?,?,?)').bind('miricanvas', JSON.stringify(snapshot), new Date().toISOString()).run();
  const env = { DB, LOCAL_MODE: true, BRIDGE_TOKEN: 'redesign-isolated' };
  await page.route('**/api/**', async route => {
    const r = route.request(), url = new URL(r.url());
    if (url.pathname.startsWith('/api/thumbnail/')) return route.continue();
    const headers = new Headers(r.headers()); headers.set('Origin', url.origin);
    const response = await api(new Request(r.url(), { method: r.method(), headers, body: r.method() === 'GET' ? undefined : r.postDataBuffer() }), env);
    if (url.pathname === '/api/world') { const data = await response.json(); data.thumbnails = baseline.thumbnails; return route.fulfill({ status: response.status, json: data }); }
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.addInitScript(() => localStorage.setItem('biz-reduced', 'true'));
  return { DB, snapshot };
}
async function ready(page: Page) { await page.goto('/'); await page.waitForFunction(() => (window as any).__bizWorld?.ready); }

test('모바일 문제 계정으로 바로 들어가 재고와 복구 행동을 한 화면에서 본다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await fixture(page, { issue: true }); await ready(page);
  await page.locator('.attention').click();
  await expect(page.locator('.panel-account')).toBeVisible();
  await expect(page.getByRole('button', { name: '재확인', exact: true })).toBeVisible();
  const stock = await page.locator('.account-stock').boundingBox();
  const footer = await page.locator('.panel-footer').boundingBox();
  expect(stock!.y + stock!.height).toBeLessThanOrEqual(footer!.y);
  await expect(page.locator('.panel-account details').filter({ hasText: '확인 기록' })).not.toHaveAttribute('open');
});

test('작은 화면에서 패널 뒤 지도는 키보드 탐색에 끼어들지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page); await ready(page);
  for (const name of ['작업동', '재고', '일정', '확인할 일', '운영']) {
    const open = page.getByRole('navigation').getByRole('button', { name, exact: true });
    await open.click();
    expect(await page.locator('.world-stage').evaluate(e => (e as HTMLElement).inert)).toBe(true);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.world-stage')))).toBe(false);
    }
    await page.getByRole('button', { name: '패널 닫기' }).click();
    expect(await page.locator('.world-stage').evaluate(e => (e as HTMLElement).inert)).toBe(false);
    await expect(open).toBeFocused();
  }
});

test('태블릿 재고는 원본 미리보기를 과도하게 늘리지 않고 충분한 열로 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await fixture(page); await ready(page);
  await page.getByRole('navigation').getByRole('button', { name: '재고', exact: true }).click();
  await page.getByRole('button', { name: '전체', exact: true }).click();
  const widths = await page.locator('.inventory-grid > button').evaluateAll(items => items.map(item => item.getBoundingClientRect().width));
  expect(widths.length).toBeGreaterThan(3);
  expect(Math.max(...widths)).toBeLessThan(220);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('일정 취소 실패는 경고로 알리고 원래 일정을 남긴다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { DB } = await fixture(page);
  await DB.prepare('INSERT INTO schedules VALUES(?,?,?,?,?,?,?)').bind('redesign-cancel-fail', '1', '취소 실패 검증', new Date(Date.now() + 3600000).toISOString(), 'memo', 'planned', new Date().toISOString()).run();
  await page.route('**/api/schedules/redesign-cancel-fail', route => route.fulfill({ status: 503, json: { error: '일정을 취소하지 못했습니다.' } }));
  await ready(page);
  await page.getByRole('navigation').getByRole('button', { name: '일정', exact: true }).click();
  await page.locator('.timeline-item').filter({ hasText: '취소 실패 검증' }).getByRole('button', { name: '취소 실패 검증 취소', exact: true }).click();
  await expect(page.locator('.toast[role="alert"]')).toContainText('일정을 취소하지 못했습니다.');
  await expect(page.locator('.toast .lucide-check')).toHaveCount(0);
  await expect(page.locator('.timeline-item').filter({ hasText: '취소 실패 검증' })).toBeVisible();
});

test('다음 확인 시각이 잘못되어도 단지와 다른 업무는 사용할 수 있다', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await fixture(page, { invalidTime: true }); await ready(page);
  await expect(page.locator('.park-summary')).toContainText('예정 없음');
  await page.getByRole('navigation').getByRole('button', { name: '재고', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '재고 검색' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('휴대전화 글자 200%에서도 본문을 읽고 일정과 재확인 버튼을 쓸 수 있다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await fixture(page, { issue: true }); await ready(page);
  await page.locator('.attention').click();
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect.poll(async () => (await page.locator('.panel-body').boundingBox())!.height).toBeGreaterThan(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(async () => {
    const buttons = await page.locator('.panel-footer button').evaluateAll(items => items.map(e => ({
      font: parseFloat(getComputedStyle(e).fontSize), height: e.getBoundingClientRect().height, overflow: e.scrollWidth > e.clientWidth,
    })));
    return buttons.every(b => b.font >= 30 && b.height < 100 && !b.overflow);
  }).toBe(true);
  await page.locator('.account-stock').scrollIntoViewIfNeeded();
  await expect(page.locator('.account-stock')).toBeInViewport();
  await page.getByRole('button', { name: '일정 추가', exact: true }).click();
  await page.getByRole('button', { name: '일정 저장', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: '일정 저장', exact: true })).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
