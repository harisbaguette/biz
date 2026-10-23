import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ownerCycleFixture, enter } from './game-fixture';

const out = 'artifacts/animated-industry';
const read = (page: Page) => page.evaluate(() => (window as any).__bizWorld);
const rig = async (page: Page, process: string) => (await read(page))?.motions?.find((m: any) => m.process === process);
async function reduced(page: Page, enabled: boolean) {
  await page.getByRole('button', { name: '자동화 설정', exact: true }).click();
  await page.getByRole('switch', { name: '움직임 줄이기' }).setChecked(enabled);
  await page.getByRole('button', { name: '패널 닫기' }).click();
}
function active(snapshot: any) {
  snapshot.observedAt = new Date().toISOString();
  snapshot.automation.productionEnabled = true;
  snapshot.automation.lanes = Object.fromEntries(['generation', 'review', 'metadata'].map(key =>
    [key, { status: key === 'metadata' ? 'idle' : 'working', observedAt: snapshot.observedAt }]));
}
async function frozen(page: Page, process: string) {
  await expect.poll(async () => (await rig(page, process)).running).toBe(false);
  const before = await rig(page, process);
  await page.waitForTimeout(300);
  const after = await rig(page, process);
  expect(after.time).toBe(before.time);
  expect(after.pose).toEqual(before.pose);
}
async function moves(page: Page, process: string) {
  await expect.poll(async () => (await rig(page, process))?.running).toBe(true);
  const before = await rig(page, process);
  await expect.poll(async () => (await rig(page, process)).time).toBeGreaterThan(before.time + .25);
  expect((await rig(page, process)).pose).not.toEqual(before.pose);
}

test('내장 관절 모션은 관측된 생산·검수별로 재생되고 정지·오류·관측 끊김·줄이기를 지킨다', async ({ page }, info) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const { DB, snapshot } = await ownerCycleFixture(page, { mutateSnapshot: active });
  const publish = async (stale = false) => {
    snapshot.observedAt = new Date().toISOString();
    snapshot.receivedAt = stale ? '2020-01-01T00:00:00Z' : snapshot.observedAt;
    await DB.prepare("UPDATE snapshots SET data=?, received_at=? WHERE id='miricanvas'")
      .bind(JSON.stringify(snapshot), snapshot.receivedAt).run();
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/world');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await response;
  };
  await enter(page);
  expect((await read(page)).motions.map((m: any) => m.clip).sort()).toEqual(['pick-and-place', 'toggle']);
  await frozen(page, 'generation'); await frozen(page, 'review');
  await reduced(page, false);
  await moves(page, 'generation'); await moves(page, 'review');
  await expect(page.locator('[data-process="generation"] small')).toHaveText('생산·검수 중');
  expect((await read(page)).transfers.some((t: any) => t.moving)).toBe(false);
  snapshot.automation.lanes.review.status = 'idle'; await publish();
  await frozen(page, 'review'); await moves(page, 'generation');
  snapshot.automation.lanes.generation.status = 'retry_wait';
  snapshot.automation.lanes.review.status = 'reviewing'; await publish();
  await frozen(page, 'generation'); await moves(page, 'review');
  await expect(page.locator('[data-process="generation"] small')).toHaveText('검수 중');
  snapshot.automation.productionEnabled = false; await publish();
  await frozen(page, 'generation'); await frozen(page, 'review');
  active(snapshot); await publish(); await moves(page, 'generation');
  snapshot.automation.lanes.generation.observedAt = '2020-01-01T00:00:00Z'; await publish();
  await frozen(page, 'generation'); await moves(page, 'review');
  active(snapshot); await publish(true);
  await frozen(page, 'generation'); await frozen(page, 'review');
  await publish(); await moves(page, 'generation');
  await reduced(page, true);
  await frozen(page, 'generation'); await frozen(page, 'review');
  await reduced(page, false); await moves(page, 'generation');
  const beforeHidden = await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    return (window as any).__bizWorld.motions.map((m: any) => m.time);
  });
  await page.waitForTimeout(500);
  expect((await read(page)).motions.map((m: any) => m.time)).toEqual(beforeHidden);
  await page.evaluate(() => { delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await moves(page, 'generation');
  expect((await rig(page, 'generation')).time - beforeHidden[0]).toBeLessThan(.5);
  expect(errors).toEqual([]);
  await mkdir(out, { recursive: true });
  await writeFile(`${out}/${info.project.use.browserName}-state.json`, JSON.stringify(await read(page), null, 2));
});

test('모바일·태블릿·PC에서 움직이는 설비와 13계정이 함께 보이고 재배치 후에도 모션이 남는다', async ({ page }, info) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await ownerCycleFixture(page, { mutateSnapshot: active });
  await page.setViewportSize({ width: 360, height: 640 }); await enter(page); await reduced(page, false);
  await mkdir(out, { recursive: true });
  const samples = [];
  for (const [width, height] of [[360,640], [390,844], [768,1024], [1440,900], [844,390]]) {
    await page.setViewportSize({ width, height });
    const mode=width>=600&&width>height*1.2?(height<500?'landscape-short':'landscape'):height<720?'portrait-short':'portrait';
    await expect.poll(async () => { const world=await read(page); return world?.ready?world.viewMode:null; }).toBe(mode);
    await expect.poll(async () => (await read(page))?.visibleAccounts?.length).toBe(13);
    await moves(page, 'generation'); await moves(page, 'review');
    const world = await read(page);
    expect(world.modelFailures).toEqual([]); expect(world.loaded).toBe(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `${out}/${info.project.use.browserName}-${width}-moving-a.png` });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${info.project.use.browserName}-${width}-moving-b.png` });
    samples.push({ width, height, drawCalls: world.drawCalls, triangles: world.triangles, resources: world.resources, motions: world.motions });
  }
  expect(errors).toEqual([]);
  await writeFile(`${out}/${info.project.use.browserName}-viewports.json`, JSON.stringify(samples, null, 2));
});

test('애니메이션 파일 실패는 재시도로 복구하고 중복 재생기를 남기지 않는다', async ({ page }) => {
  await ownerCycleFixture(page, { mutateSnapshot: active });
  let fail = true;
  await page.route('**/assets/animated-industry/robot-arm-pick.glb', route => fail
    ? route.fulfill({ status: 503, body: 'temporary' }) : route.continue());
  await enter(page);
  expect((await read(page)).modelFailures).toEqual(['robot-arm-pick']);
  expect((await read(page)).motions).toHaveLength(1);
  fail = false;
  await page.getByRole('button', { name: '작품 도구 1개 다시 받기' }).click();
  await expect.poll(async () => (await read(page)).modelFailures).toEqual([]);
  expect((await read(page)).motions).toHaveLength(2);
  await reduced(page, false); await moves(page, 'generation'); await moves(page, 'review');
  expect((await read(page)).visibleAccounts).toHaveLength(13);
});
