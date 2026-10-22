import { test, expect, type Page } from "@playwright/test";
import { baselineWorld, enter, fixture } from "./game-fixture";
import { currentAssets } from "../src/operations-state";

test.beforeAll(async () => { await baselineWorld(); });
async function management(page: Page) {
  await page.getByRole("button", { name: "운영실", exact: true }).click();
  await page.getByRole("button", { name: "운영 계획·보고", exact: true }).click();
  await expect(page.getByRole("heading", { name: "운영 계획·보고" })).toBeVisible();
}

test("사업별 계획과 보고를 저장·수정하고 다시 열어도 내용과 상태를 보존한다", async ({ page }) => {
  const { DB } = await fixture(page);
  await DB.prepare("INSERT INTO businesses(id,name,kind) VALUES('other','두 번째 사업','other')").run();
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page); await management(page);
  await page.getByRole("button", { name: "기록 추가" }).click();
  await page.getByLabel("제목", { exact: true }).fill("30분 간격 복구 계획");
  await page.getByLabel("내용", { exact: true }).fill("실제 ID와 제출 결과를 대조한다.\n남은 7·8·10·13번은 순서대로 처리한다.");
  await page.getByRole("combobox", { name: "상태", exact: true }).selectOption("active");
  await page.getByRole("button", { name: "기록 저장", exact: true }).click();
  await page.locator(".management-record summary").click();
  await expect(page.locator(".management-content")).toContainText("실제 ID");
  await page.getByRole("button", { name: "기록 수정" }).click();
  await page.getByRole("combobox", { name: "상태", exact: true }).selectOption("done");
  await page.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(page.locator(".management-record summary")).toContainText("완료");
  await page.getByRole("combobox", { name: "사업", exact: true }).selectOption("other");
  await expect(page.getByText("아직 운영 기록이 없습니다.")).toBeVisible();
  await page.getByRole("button", { name: "기록 추가" }).click();
  await page.getByRole("combobox", { name: "종류", exact: true }).selectOption("report");
  await page.getByLabel("제목", { exact: true }).fill("두 번째 사업 보고");
  await page.getByLabel("내용", { exact: true }).fill("<script>window.shouldNotRun = true</script>\n확인한 결과만 기록한다.");
  await page.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(page.locator(".management-record summary")).toContainText("두 번째 사업 보고");
  await page.reload(); await management(page);
  await expect(page.locator(".management-record summary")).toContainText("30분 간격 복구 계획");
  await page.getByRole("combobox", { name: "사업", exact: true }).selectOption("other");
  await page.locator(".management-record summary").click();
  await expect(page.locator(".management-content")).toContainText("<script>");
  expect(await page.evaluate(() => (window as any).shouldNotRun)).toBeUndefined();
  expect((await DB.prepare("SELECT count(*) AS n FROM commands").first() as any).n).toBe(0);
});
test("미완료 확인을 완료로 표시하지 않고 사업 운영 이력과 재고 수치를 함께 보존한다", async ({ page }) => {
  const { DB, baseline, snapshot } = await fixture(page);
  const account = snapshot.accounts.find((a: any) => a.number === 5);
  snapshot.assets.push({ id: "qa-observed-submission-5", accountId: account.id, title: "현재 심사 중인 제작물", eligible: false,
    state: "submitted", updatedAt: new Date().toISOString() });
  Object.assign(account, { status: "blocked", running: false, checkedAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString(), lastVerifiedAt: null,
    message: "언어 메뉴를 확인하지 못했습니다.", counts: { uploaded: 20, published: 20 } });
  snapshot.automation.scan = { pending: [7, 8, 10, 13], requestedAt: new Date().toISOString() };
  await DB.prepare("UPDATE snapshots SET data=? WHERE id='miricanvas'").bind(JSON.stringify(snapshot)).run();
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.locator(`[data-account="${account.id}"]`).click();
  await page.getByRole("button", { name: "상세" }).click();
  await expect(page.locator(".panel-account")).toContainText("자동 확인 미완료");
  await expect(page.locator(".account-observation-summary")).toContainText("계정 확인 성공 미기록");
  await page.locator(".account-records summary").click();
  await expect(page.locator(".account-records")).toContainText("성공 시각 미기록");
  const actualInspectionCount = currentAssets(snapshot, account.id).filter(asset => asset.state === "submitted").length;
  await expect(page.locator(".account-flow-strip span").filter({ hasText: "심사" }).locator("strong")).toHaveText(String(actualInspectionCount));
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await page.getByRole("button", { name: "상태 수신" }).click();
  await expect(page.locator(".panel-automation")).toContainText("7번 → 8번 → 10번 → 13번");
  await expect(page.locator(".panel-automation")).toContainText("작업 종료 후 30분 간격");
  expect(baseline.snapshot.accounts.length).toBe(13);
});

test("휴대전화에서 긴 운영 보고를 읽고 저장해도 가로 넘침이 없다", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page); await management(page);
  await page.getByRole("button", { name: "기록 추가" }).click();
  await page.getByRole("combobox", { name: "종류", exact: true }).selectOption("report");
  await page.getByLabel("제목", { exact: true }).fill("오늘의 운영 보고");
  await page.getByLabel("내용", { exact: true }).fill("5번과 6번 각각 새 20개 제출 완료.\n".repeat(10));
  await page.getByRole("button", { name: "기록 저장", exact: true }).click();
  await page.locator(".management-record summary").click();
  await expect(page.getByRole("button", { name: "기록 수정" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/mobile-game/qa/management-mobile.png" });
});
