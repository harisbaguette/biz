import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../worker/index.mjs";
import { database } from "./db.mjs";
function setup(local = true) {
  const env = { DB: database(), LOCAL_MODE: local };
  const call = (path = "/management", method = "GET", body, origin = "https://biz.example") => api(new Request("https://biz.example/api" + path, {
    method, headers: { Origin: origin }, body: body ? JSON.stringify(body) : undefined,
  }), env);
  return { env, call };
}
const plan = (id = "plan-one") => ({ id, businessId: "miricanvas", kind: "plan", title: "자동화 복구", content: "실제 ID 확인 후 다음 계정. 계정 간격 30분 유지.", status: "active", dueAt: null });
test("경영 기록은 인증과 같은 출처를 요구하며 실행 지시를 만들지 않는다", async () => {
  assert.equal((await setup(false).call()).status, 401);
  assert.equal((await setup(false).call("/management", "POST", plan())).status, 401);
  const { call, env } = setup();
  assert.equal((await call("/management", "POST", plan(), "https://other.example")).status, 403);
  assert.equal((await call("/management", "POST", plan())).status, 201);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM commands").first()).n, 0);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM schedules").first()).n, 0);
});
test("계획 재전송·동시 저장은 하나로 합치고 다른 내용은 충돌로 알린다", async () => {
  const { call } = setup();
  const results = await Promise.all(Array.from({ length: 5 }, () => call("/management", "POST", plan())));
  assert.equal(results.filter(r => r.status === 201).length, 1);
  assert.ok(results.every(r => [200, 201].includes(r.status)));
  assert.equal((await call("/management", "POST", { ...plan(), content: "다른 내용" })).status, 409);
  const data = await (await call()).json();
  assert.equal(data.items.length, 1);
  assert.equal((await (await call('/management/plan-one')).json()).content, plan().content);
  assert.equal((await call('/management/missing')).status, 404);
  const updates = await Promise.all(["수정 1", "수정 2"].map(content => call("/management/plan-one", "PATCH", { ...plan(), content, revision: 1 })));
  assert.deepEqual(updates.map(r => r.status).sort(), [200, 409]);
  const saved = (await (await call()).json()).items[0];
  assert.equal(saved.revision, 2);
  assert.equal((await call("/management/plan-one", "PATCH", { ...plan(), content: saved.content, revision: 1 })).status, 200);
});
test("다른 사업의 보고·결정과 계획의 상태·기한을 구분한다", async () => {
  const { call, env } = setup();
  await env.DB.prepare("INSERT INTO businesses(id,name,kind) VALUES('other','다른 사업','other')").run();
  const record = { ...plan("report"), businessId: "other", kind: "report", status: "recorded" };
  assert.equal((await call("/management", "POST", { ...record, businessId: "missing" })).status, 404);
  assert.equal((await call("/management", "POST", { ...record, status: "done" })).status, 400);
  assert.equal((await call("/management", "POST", { ...record, dueAt: "2030-01-01" })).status, 400);
  assert.equal((await call("/management", "POST", record)).status, 201);
  assert.equal((await (await call()).json()).items.length, 0);
  assert.equal((await (await call("/management?businessId=other")).json()).items[0].id, "report");
  assert.equal((await call("/management/report", "PATCH", { ...record, businessId: "miricanvas", revision: 1 })).status, 409);
  assert.equal((await call('/management', 'POST', { ...record, id:'policy', businessId:'portfolio', kind:'decision' })).status, 201);
  assert.equal((await (await call('/management?businessId=portfolio')).json()).items.length, 1);
});
test("과거 기록을 누락 없이 페이지로 읽고 보관 기록도 유지한다", async () => {
  const { call } = setup();
  for (let i = 0; i < 45; i++) assert.equal((await call("/management", "POST", plan(`record-${i}`))).status, 201);
  const first = await (await call()).json();
  assert.equal(first.items.length, 40);
  const second = await (await call("/management?cursor=" + encodeURIComponent(first.nextCursor))).json();
  assert.equal(second.items.length, 5); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map(x => x.id)).size, 45);
  assert.equal((await call("/management?cursor=broken")).status, 400);
  assert.equal((await call("/management/record-0", "PATCH", { ...plan("record-0"), status: "archived", revision: 1 })).status, 200);
});
