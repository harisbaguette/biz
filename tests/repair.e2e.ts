import { test, expect, type Page } from '@playwright/test';
// @ts-expect-error Worker HTTP contract is exercised with an isolated D1 adapter.
import { api } from '../worker/index.mjs';
// @ts-expect-error Node SQLite adapter for temporary test data.
import { database } from './db.mjs';
let baseline: any;
test.beforeAll(async () => { baseline = await (await fetch('http://127.0.0.1:4317/api/world')).json(); });
async function fixture(page: Page) {
  const DB = database(), snapshot = structuredClone(baseline.snapshot);
  snapshot.observedAt = new Date().toISOString();
  await DB.prepare('INSERT INTO snapshots VALUES(?,?,?)').bind('miricanvas', JSON.stringify(snapshot), new Date().toISOString()).run();
  const env = { DB, LOCAL_MODE: true, BRIDGE_TOKEN: 'repair-test-only' };
  await page.route('**/api/**', async route => {
    const r = route.request(), url = new URL(r.url());
    if (url.pathname.startsWith('/api/thumbnail/')) return route.continue();
    const headers = new Headers(r.headers()); headers.set('Origin', url.origin);
    const response = await api(new Request(r.url(), { method: r.method(), headers, body: r.method() === 'GET' ? undefined : r.postDataBuffer() }), env);
    if (url.pathname === '/api/world') {
      const data = await response.json(); data.thumbnails = baseline.thumbnails;
      return route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(data) });
    }
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  return { DB, snapshot };
}
async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__bizWorld?.ready === true);
  await expect(page.locator('.panel-null')).not.toBeVisible();
}
test('실패한 3D 코드 로딩을 격리하고 목록 관리와 다시 불러오기를 유지한다', async ({ page }) => {
  await fixture(page);
  let blocked = true;
  await page.route(/\/assets\/World-[^/]+\.js(?:\?.*)?$/, route => blocked ? route.abort('failed') : route.continue());
  await page.goto('/');
  await expect(page.getByRole('region', { name: '작업동 목록 보기' })).toBeVisible();
  await page.locator('.fallback-accounts button').first().click();
  await expect(page.getByRole('button', { name: '일정 추가', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '패널 닫기' }).click();
  await page.getByRole('button', { name: '3D 다시 열기' }).click();
  await expect(page.getByRole('button', { name: '3D 다시 열기' })).toBeVisible();
  blocked = false;
  await page.getByRole('button', { name: '3D 다시 열기' }).click();
  await page.waitForFunction(() => (window as any).__bizWorld?.ready === true);
  await expect(page.getByRole('region', { name: '작업동 목록 보기' })).not.toBeVisible();
});
test('3D 스타일 로딩 실패도 다시 열기로 복구한다', async ({ page }) => {
  await fixture(page);
  let blocked = true;
  await page.route(/\/assets\/World-[^/]+\.css(?:\?.*)?$/, route => blocked ? route.abort('failed') : route.continue());
  await page.goto('/');
  await expect(page.getByRole('region', { name: '작업동 목록 보기' })).toBeVisible();
  blocked = false;
  await page.getByRole('button', { name: '3D 다시 열기' }).click();
  await page.waitForFunction(() => (window as any).__bizWorld?.ready === true);
  await expect(page.locator('[data-account="1"]')).toBeVisible();
});
test('3D 재시도 중 배포 버전이 바뀌면 새 문서로 이동해 앱 버전 혼합을 막는다', async ({ page }) => {
  await fixture(page);
  let blocked = true;
  await page.route(/\/assets\/World-[^/]+\.js(?:\?.*)?$/, route => blocked ? route.abort('failed') : route.continue());
  await page.route('**/build-manifest.json?*', async route => {
    const response = await route.fetch(), manifest = await response.json();
    manifest['index.html'].file = 'assets/index-new-version.js';
    await route.fulfill({ json: manifest });
  });
  await page.goto('/');
  await expect(page.getByRole('region', { name: '작업동 목록 보기' })).toBeVisible();
  blocked = false;
  await page.getByRole('button', { name: '3D 다시 열기' }).click();
  await page.waitForURL(/biz_build=/);
  await expect(page.getByRole('navigation')).toHaveCount(1);
  // This fixture changes only the manifest, not the deployed assets. If WebKit
  // retains the original failed URL, recover against the real same-build manifest.
  await page.unroute('**/build-manifest.json?*');
  await expect.poll(async () => await page.evaluate(() => Boolean((window as any).__bizWorld?.ready) || Boolean(document.querySelector('.world-recovery')))).toBe(true);
  if (await page.getByRole('region', { name: '작업동 목록 보기' }).isVisible()) {
    await page.getByRole('button', { name: '3D 다시 열기' }).click();
  }
  await page.waitForFunction(() => (window as any).__bizWorld?.ready === true);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByRole('navigation')).toHaveCount(1);
});
test('정지 화면에서 카메라 확대는 실제 캔버스 픽셀을 바꾼다', async ({ page }) => {
  await fixture(page);
  await page.addInitScript(() => localStorage.setItem('biz-reduced', 'true'));
  await ready(page);
  await page.waitForTimeout(500);
  const before = await page.locator('canvas').screenshot();
  const frames = await page.evaluate(() => (window as any).__bizWorld.totalFrames);
  await page.getByRole('button', { name: '시점 조절', exact: true }).click();
  await page.getByRole('button', { name: '확대', exact: true }).click();
  await page.waitForTimeout(600);
  const after = await page.locator('canvas').screenshot();
  expect(after.equals(before)).toBe(false);
  expect(await page.evaluate(() => (window as any).__bizWorld.totalFrames)).toBeGreaterThan(frames);
});
test('재고 검색·필터를 보존하고 전역 일정은 계정 범위를 해제한다', async ({ page }) => {
  await fixture(page); await ready(page);
  await page.locator('[data-account="1"]').click();
  await page.getByRole('button', { name: '창고 열기' }).click();
  await page.getByRole('textbox', { name: '재고 검색' }).fill('재고검색유지검증');
  await page.getByRole('button', { name: '패널 닫기' }).click();
  await page.getByRole('navigation').getByRole('button', { name: '재고', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '재고 검색' })).toHaveValue('재고검색유지검증');
  await expect(page.locator('.scope-line')).toContainText('모든 작업동');
  await page.getByRole('navigation').getByRole('button', { name: '일정', exact: true }).click();
  await expect(page.locator('.scope-line')).toContainText('모든 작업동');
});
test('실패한 예약의 원인을 보고 새 예약으로 복구하며 기존 실패 기록을 보존한다', async ({ page }) => {
  const { DB } = await fixture(page);
  await DB.prepare('INSERT INTO schedules VALUES(?,?,?,?,?,?,?)').bind('failed-review','1','실패 원인 재현',new Date().toISOString(),'recheck','failed',new Date().toISOString()).run();
  await ready(page);
  await page.getByRole('navigation').getByRole('button', { name: '일정', exact: true }).click();
  const row = page.locator('.timeline-item').filter({ hasText: '실패 원인 재현' });
  await expect(row).toContainText('처리 실패');
  await row.getByRole('button', { name: '다시 예약' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('할 일', { exact: true })).toHaveValue('실패 원인 재현');
  await dialog.getByLabel('일시', { exact: false }).fill(new Date(Date.now() + 48 * 3600000).toISOString().slice(0,16));
  await dialog.getByRole('button', { name: '일정 저장' }).click();
  await expect(dialog).not.toBeVisible();
  const rows = (await DB.prepare('SELECT * FROM schedules ORDER BY created_at').all()).results;
  expect(rows).toHaveLength(2);
  expect(rows.find((r: any) => r.id === 'failed-review').status).toBe('failed');
  expect(rows.find((r: any) => r.id !== 'failed-review').status).toBe('planned');
  await page.locator('.timeline-item').filter({ hasText: '처리 실패' }).getByRole('button', { name: '기록 닫기' }).click();
  await expect.poll(async () => (await DB.prepare('SELECT status FROM schedules WHERE id=?').bind('failed-review').first()).status).toBe('cancelled');
  await expect(page.locator('.timeline-item').filter({ hasText: '처리 실패' })).not.toBeVisible();
  await page.locator('summary').filter({ hasText: '완료·취소 기록' }).click();
  await expect(page.locator('.history')).toContainText('실패 원인 재현');
  await expect(page.locator('.history')).toContainText('취소');
  await page.screenshot({ path: 'artifacts/verification/recovered-schedule.png' });
});

test('공정에서 계정으로 이동하면 선택 강조도 해당 계정으로 옮긴다', async ({ page }) => {
  await fixture(page); await ready(page);
  await page.locator('[data-process="stock"]').click();
  await expect(page.locator('[data-process="stock"]')).toHaveClass(/selected/);
  await page.getByRole('button', { name: '패널 닫기' }).click();
  await page.locator('[data-account="1"]').click();
  await expect(page.locator('[data-account="1"]')).toHaveClass(/selected/);
  await expect(page.locator('[data-process="stock"]')).not.toHaveClass(/selected/);
});
