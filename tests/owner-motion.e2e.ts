import { test, expect } from '@playwright/test';
import { ownerCycleFixture, enter } from './game-fixture';

test('운반은 새 관측에만 한 번 반응하고 막힘·관측 끊김에서 출발하지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { DB, snapshot } = await ownerCycleFixture(page);
  const event = (id: string, accountId: string) => ({ id, accountId, state: 'submitted', count: 1, at: new Date().toISOString() });
  snapshot.recent = [event('past-submission', '2')];
  const publish = async (stale = false) => {
    snapshot.observedAt = new Date(Date.now() + Math.random() * 1000).toISOString();
    snapshot.receivedAt = stale ? '2020-01-01T00:00:00Z' : new Date().toISOString();
    await DB.prepare("UPDATE snapshots SET data=?, received_at=? WHERE id='miricanvas'")
      .bind(JSON.stringify(snapshot), snapshot.receivedAt).run();
    if (page.url().startsWith('http')) await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  };
  await publish(); await enter(page);
  await page.getByRole('button', { name: '자동화 설정', exact: true }).click();
  const reduced = page.getByRole('switch', { name: '움직임 줄이기' });
  await expect(reduced).toBeChecked(); await reduced.click(); await expect(reduced).not.toBeChecked();
  await page.getByRole('button', { name: '패널 닫기' }).click();
  const moving = (id: string, kind: string) => page.evaluate(({ id, kind }) =>
    !!(window as any).__bizWorld.transfers.find((item: any) => item.id === id && item.kind === kind)?.moving, { id, kind });
  expect(await moving('2', 'submission')).toBe(false);

  snapshot.recent.push(event('new-submission', '2')); await publish();
  await expect.poll(() => moving('2', 'submission'), { intervals: [25, 50, 100] }).toBe(true);
  await expect.poll(() => moving('2', 'submission'), { timeout: 5000 }).toBe(false);
  await publish();
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.cycles.length)).toBe(13);
  await page.waitForTimeout(200);
  expect(await moving('2', 'submission')).toBe(false);

  snapshot.recent.push(event('blocked-submission', '1')); await publish();
  await page.waitForTimeout(200);
  expect(await moving('1', 'submission')).toBe(false);
  const artwork = snapshot.assets.find((item: any) => item.accountId === '2' && item.state === 'submitted');
  artwork.state = 'approved'; artwork.updatedAt = new Date().toISOString();
  const account = snapshot.accounts.find((item: any) => item.id === '2');
  if (account.capacity) account.capacity.pending = 19;
  await publish();
  await expect.poll(() => moving('2', 'archive'), { intervals: [25, 50, 100] }).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.review.find((item: any) => item.id === '2').count)).toBe(19);
  await expect.poll(() => moving('2', 'archive'), { timeout: 5000 }).toBe(false);

  account.ready += 1; await publish();
  await expect.poll(() => moving('2', 'production'), { intervals: [25, 50, 100] }).toBe(true);
  await publish(true);
  await expect.poll(() => page.evaluate(() => (window as any).__bizWorld.transfers.some((item: any) => item.moving))).toBe(false);
  await expect(page.locator('[data-account="2"] [data-cycle-review] strong')).toHaveText('상태 미확인');
});
