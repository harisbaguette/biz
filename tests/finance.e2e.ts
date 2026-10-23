import { test, expect, type Page } from '@playwright/test';
import { enter, fixture } from './game-fixture';

const year = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date()));
async function openRevenue(page: Page) {
  const reopen = page.getByRole('button', { name: '수익 기록부', exact: true });
  if (await reopen.isVisible()) await reopen.click();
  else await page.locator('[data-process="revenue"]').click();
  await expect(page.getByRole('dialog', { name: '월별 수익 기록부' })).toBeVisible();
  await expect(page.locator('.finance-vault').first()).toBeEnabled();
}
async function worldMonth(page: Page, month: number) {
  return page.evaluate(m => (window as any).__bizWorld?.revenue?.months?.find((v: {month:number}) => v.month === m), month);
}
async function canvasFrame(page: Page) { return page.locator(".world canvas").screenshot(); }

test('모바일 실제 수익 시설에서 12개월·13계정을 확인하고 0원 저장·재접속·미기록 변경을 구분한다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { DB } = await fixture(page);
  await enter(page); await openRevenue(page);
  await expect(page.locator('.finance-vault')).toHaveCount(12);
  await expect(page.getByLabel('계정', { exact: true }).locator('option')).toHaveCount(13);
  expect((await page.getByLabel('계정', { exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await page.getByLabel('연도').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('.finance-balance')).toContainText('미기록');
  await page.getByRole('button', { name: '패널 닫기' }).click();
  const unrecordedFrame = await canvasFrame(page);
  await openRevenue(page);
  await page.getByRole('button', { name: '1월 미기록 기록 편집', exact: true }).click();
  await expect(page.getByLabel('확정 수익 · 원')).toBeFocused();
  await page.getByLabel('확정 수익 · 원').fill('0');
  await page.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '1월 0원 기록 편집', exact: true })).toBeEnabled();
  await expect(page.locator('.finance-balance')).toContainText('기록한 1/12개월 합계');
  await expect.poll(() => worldMonth(page, 1)).toMatchObject({ month: 1, amount: 0 });
  await page.getByRole('button', { name: '패널 닫기' }).click();
  const zeroFrame = await canvasFrame(page);
  expect(zeroFrame.equals(unrecordedFrame), '기록한 0원은 미기록과 다른 실제 Three.js 장면이어야 함').toBe(false);
  await page.reload();
  await page.waitForFunction(() => (window as any).__bizWorld?.ready === true);
  await openRevenue(page);
  await expect(page.getByRole('button', { name: '1월 0원 기록 편집', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '1월 0원 기록 편집', exact: true }).click();
  await page.getByLabel('미기록으로 변경').check();
  await page.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '1월 미기록 기록 편집', exact: true })).toBeEnabled();
  await expect(page.locator('.finance-balance')).toContainText('미기록');
  await expect.poll(() => worldMonth(page, 1)).toMatchObject({ month: 1, amount: null });
  await page.getByRole('button', { name: '패널 닫기' }).click();
  expect((await canvasFrame(page)).equals(zeroFrame), '미기록으로 되돌리면 Three.js 월 금고도 빈 상태로 바뀌어야 함').toBe(false);
  expect(await DB.prepare('SELECT amount_krw AS amount,revision FROM revenue_months').first()).toMatchObject({ amount: null, revision: 2 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/verification/finance-mobile-integrated.png', fullPage: true });
});

test('실제 수익 시설에서 저장 장애·동시 편집 입력을 보존하고 최신 기록 확인 후 저장한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { DB, snapshot } = await fixture(page);
  let fail = false;
  await page.route('**/api/revenue**', async route => {
    if (fail && route.request().method() === 'POST') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '시험 저장 장애' }) });
    return route.fallback();
  });
  await enter(page); await openRevenue(page);
  await page.getByRole('button', { name: '2월 미기록 기록 편집', exact: true }).click();
  await page.getByLabel('확정 수익 · 원').fill('10000');
  await page.getByLabel('메모 · 선택').fill('입력 유지');
  fail = true;
  await page.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '시험 저장 장애' })).toBeVisible();
  await expect(page.getByLabel('확정 수익 · 원')).toHaveValue('10000');
  fail = false;
  await DB.prepare('INSERT INTO revenue_months VALUES(?,?,?,?,?,?,?)').bind(snapshot.accounts[0].id, year, 2, 5000, '다른 화면', 1, new Date().toISOString()).run();
  await page.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '최신 기록 확인 · 입력 유지' })).toBeVisible();
  await expect(page.getByRole('button', { name: '기록 저장', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '최신 기록 확인 · 입력 유지' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '5,000원' })).toBeVisible();
  await expect(page.getByLabel('확정 수익 · 원')).toHaveValue('10000');
  await expect(page.getByLabel('메모 · 선택')).toHaveValue('입력 유지');
  await page.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '2월 10,000원 기록 편집', exact: true })).toBeEnabled();
  await expect.poll(() => worldMonth(page, 2)).toMatchObject({ month: 2, amount: 10000 });
  expect(await DB.prepare('SELECT amount_krw AS amount,revision FROM revenue_months').first()).toMatchObject({ amount: 10000, revision: 2 });
});

test('수익 기록과 계정 선택은 같은 공간의 실제 12개 금고 적재를 즉시 갱신한다', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const { DB, snapshot } = await fixture(page);
  for (const [account, month, amount] of [[0, 1, 10000], [1, 2, 20000]]) {
    await DB.prepare('INSERT INTO revenue_months VALUES(?,?,?,?,?,?,?)').bind(snapshot.accounts[account].id, year, month, amount, '', 1, new Date().toISOString()).run();
  }
  await enter(page); await openRevenue(page);
  await expect.poll(() => worldMonth(page, 1)).toMatchObject({ month: 1, amount: 10000 });
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.revenue.months.length)).toBe(12);
  await expect(page.locator('.finance-vault')).toHaveCount(12);
  await page.getByLabel('계정', { exact: true }).selectOption(snapshot.accounts[1].id);
  await expect(page.getByRole('button', { name: '2월 20,000원 기록 편집', exact: true })).toBeEnabled();
  await expect.poll(() => worldMonth(page, 1)).toMatchObject({ month: 1, amount: null });
  await expect.poll(() => worldMonth(page, 2)).toMatchObject({ month: 2, amount: 20000 });
  await page.getByRole('button', { name: '패널 닫기' }).click();
  const beforeThirty = await canvasFrame(page);
  await openRevenue(page);
  await page.getByRole('button', { name: '3월 미기록 기록 편집', exact: true }).click();
  await page.getByLabel('확정 수익 · 원').fill('30000');
  await page.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect.poll(() => worldMonth(page, 3)).toMatchObject({ month: 3, amount: 30000 });
  await page.getByRole('button', { name: '패널 닫기' }).click();
  expect((await canvasFrame(page)).equals(beforeThirty), '양수 수익이 반영되면 Three.js 금고 높이가 바뀌어야 함').toBe(false);
  await expect(page.getByRole('dialog', { name: '월별 수익 기록부' })).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.revenue.accountId)).toBe(snapshot.accounts[1].id);
  await page.screenshot({ path: 'artifacts/verification/finance-world-updated.png', fullPage: true });
  await openRevenue(page);
  await expect(page.getByLabel('계정', { exact: true })).toHaveValue(snapshot.accounts[1].id);
  await page.getByLabel('계정', { exact: true }).selectOption(snapshot.accounts[0].id);
  await expect.poll(() => worldMonth(page, 1)).toMatchObject({ month: 1, amount: 10000 });
  await expect.poll(() => worldMonth(page, 2)).toMatchObject({ month: 2, amount: null });
  await expect.poll(() => worldMonth(page, 3)).toMatchObject({ month: 3, amount: null });
  const previousYear = year - 1;
  await DB.prepare('INSERT INTO revenue_months VALUES(?,?,?,?,?,?,?)').bind(snapshot.accounts[0].id, previousYear, 4, 45000, '전년도 확정', 1, new Date().toISOString()).run();
  await page.getByLabel('연도').selectOption(String(previousYear));
  await expect(page.getByRole('button', { name: '4월 45,000원 기록 편집', exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.revenue.year)).toBe(previousYear);
  await expect.poll(() => worldMonth(page, 4)).toMatchObject({ month: 4, amount: 45000 });
  await page.getByRole('button', { name: '패널 닫기' }).click();
  await expect(page.locator('[data-process="revenue"]')).toContainText(String(previousYear));
  await openRevenue(page);
  await expect(page.getByLabel('연도')).toHaveValue(String(previousYear));
  await expect(page.getByRole('button', { name: '4월 45,000원 기록 편집', exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.revenue.year)).toBe(previousYear);
  await expect.poll(() => worldMonth(page, 4)).toMatchObject({ month: 4, amount: 45000 });
});
