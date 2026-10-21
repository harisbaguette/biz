import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { api, passwordHash } from "../worker/index.mjs";
import { adapter } from "../server/db.mjs";
function database() {
  const s = new DatabaseSync(":memory:");
  s.exec(
    readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"),
  );
  return adapter(s);
}
const makeSnapshot = () => ({
  version: 1,
  observedAt: new Date().toISOString(),
  accounts: Array.from({ length: 13 }, (_, i) => ({
    id: String(i + 1),
    number: i + 1,
    name: `작업동 ${i + 1}`,
    ready: 20,
  })),
  assets: [],
  calendar: [],
  recent: [],
  automation: {},
});
async function setup(local = true) {
  const env = {
    DB: database(),
    LOCAL_MODE: local,
    BRIDGE_TOKEN: "bridge-secret",
    PASSWORD_SALT: "test-salt",
    PASSWORD_HASH: await passwordHash("a-strong-test-password", "test-salt"),
  };
  const call = async (
    path,
    {
      method = "GET",
      body,
      origin = "https://biz.example",
      token,
      cookie,
    } = {},
  ) => {
    const headers = {};
    if (method !== "GET") headers.Origin = origin;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cookie) headers.Cookie = cookie;
    return api(
      new Request("https://biz.example/api" + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
  };
  return { env, call };
}
async function seed(call) {
  assert.equal(
    (
      await call("/bridge/snapshot", {
        method: "POST",
        token: "bridge-secret",
        body: makeSnapshot(),
      })
    ).status,
    200,
  );
}

test("예약 재전송은 공백·시간 경과·동시 도착에도 한 건으로 보존한다", async () => {
  const { env, call } = await setup(); await seed(call);
  const value = { id:'retry-schedule', accountId:'1', title:' 예약 메모 ', kind:'memo', dueAt:new Date(Date.now()+3600000).toISOString() };
  const replies = await Promise.all(Array.from({length:8}, () => call('/schedules',{method:'POST',body:value})));
  assert.equal(replies.filter(r=>r.status===201).length,1);
  assert.equal(replies.every(r=>[200,201].includes(r.status)),true);
  const past = '2020-01-01T00:00:00.000Z';
  await env.DB.prepare('UPDATE schedules SET due_at=? WHERE id=?').bind(past,value.id).run();
  assert.equal((await call('/schedules',{method:'POST',body:{...value,dueAt:past}})).status,200);
  assert.equal((await call('/schedules',{method:'POST',body:{...value,dueAt:past,title:'다른 내용'}})).status,409);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM schedules').first()).n,1);
});

test("지시·예약 결과는 함께 저장되고 중간 오류·반대 결과 재전송에도 일관성을 지킨다", async () => {
  const { env, call } = await setup(); await seed(call);
  const stamp = new Date().toISOString();
  await env.DB.prepare('INSERT INTO schedules VALUES(?,?,?,?,?,?,?)').bind('atomic','1','원자적 예약',stamp,'recheck','requested',stamp).run();
  await env.DB.prepare('INSERT INTO commands VALUES(?,?,?,?,?,?,?)').bind('schedule-atomic','recheck','{"accountId":"1"}','queued','',stamp,stamp).run();
  const prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => {
    const q=prepare(sql);
    if (sql.startsWith('UPDATE schedules SET status=(')) q.run=()=>{throw new Error('injected write failure');};
    return q;
  };
  const body={id:'schedule-atomic',status:'applied',message:'반영'};
  assert.equal((await call('/bridge/result',{method:'POST',token:'bridge-secret',body})).status,500);
  assert.equal((await prepare('SELECT status FROM commands').first()).status,'queued');
  assert.equal((await prepare('SELECT status FROM schedules').first()).status,'requested');
  env.DB.prepare=prepare;
  assert.equal((await call('/bridge/result',{method:'POST',token:'bridge-secret',body})).status,200);
  assert.equal((await prepare('SELECT status FROM commands').first()).status,'applied');
  assert.equal((await prepare('SELECT status FROM schedules').first()).status,'done');
  await call('/bridge/result',{method:'POST',token:'bridge-secret',body:{...body,status:'failed'}});
  assert.equal((await prepare('SELECT status FROM commands').first()).status,'applied');
  assert.equal((await prepare('SELECT status FROM schedules').first()).status,'done');
});

test("개인 관제는 인증 없이 읽거나 변경할 수 없다", async () => {
  const { call } = await setup(false);
  assert.equal((await call("/world")).status, 401);
  assert.equal(
    (await call("/commands", { method: "POST", body: {} })).status,
    401,
  );
  assert.equal((await call("/bridge/commands")).status, 401);
  assert.equal(
    (await call("/bridge/commands", { token: "wrong" })).status,
    401,
  );
});
test("로그인, HttpOnly 세션, 로그아웃", async () => {
  const { call } = await setup(false);
  let r = await call("/login", { method: "POST", body: { password: "wrong" } });
  assert.equal(r.status, 401);
  r = await call("/login", {
    method: "POST",
    body: { password: "a-strong-test-password" },
  });
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal((await call("/world", { cookie })).status, 200);
  await call("/logout", { method: "POST", cookie, body: {} });
  assert.equal((await call("/world", { cookie })).status, 401);
});
test("틀린 암호 반복은 제한한다", async () => {
  const { call } = await setup(false);
  for (let i = 0; i < 8; i++)
    await call("/login", { method: "POST", body: { password: "wrong" } });
  assert.equal(
    (await call("/login", { method: "POST", body: { password: "wrong" } }))
      .status,
    429,
  );
});
test("외부 출처 변경과 과도한 요청 차단", async () => {
  const { call } = await setup();
  assert.equal(
    (
      await call("/schedules", {
        method: "POST",
        origin: "https://evil.example",
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/schedules", {
        method: "POST",
        body: { title: "x".repeat(6000) },
      })
    ).status,
    413,
  );
});
test("실데이터 13계정 검증과 오래된 스냅샷 방지", async () => {
  const { call } = await setup();
  const data = makeSnapshot();
  data.accounts.pop();
  assert.equal(
    (
      await call("/bridge/snapshot", {
        method: "POST",
        token: "bridge-secret",
        body: data,
      })
    ).status,
    400,
  );
  await seed(call);
  data.accounts.push({ id: "13", name: "13", ready: 2 });
  data.observedAt = "2020-01-01T00:00:00Z";
  assert.equal(
    (
      await call("/bridge/snapshot", {
        method: "POST",
        token: "bridge-secret",
        body: data,
      })
    ).status,
    409,
  );
  const r = await (await call("/world")).json();
  assert.equal(r.snapshot.accounts.length, 13);
});
test("지시는 허용된 동작만, 재시도는 중복 없이, 적용 결과를 보존한다", async () => {
  const { call } = await setup();
  await seed(call);
  assert.equal(
    (
      await call("/commands", {
        method: "POST",
        body: { id: "bad", action: "shell", payload: { command: "x" } },
      })
    ).status,
    400,
  );
  const command = {
    id: "once",
    action: "recheck",
    payload: { accountId: "1" },
  };
  assert.equal(
    (await call("/commands", { method: "POST", body: command })).status,
    201,
  );
  await call("/commands", { method: "POST", body: command });
  assert.equal(
    (await (await call("/bridge/commands", { token: "bridge-secret" })).json())
      .commands.length,
    1,
  );
  assert.equal(
    (
      await call("/commands", {
        method: "POST",
        body: { ...command, payload: { accountId: "2" } },
      })
    ).status,
    409,
  );
  await call("/bridge/result", {
    method: "POST",
    token: "bridge-secret",
    body: { id: "once", status: "applied", message: "반영 완료" },
  });
  assert.equal(
    (await (await call("/bridge/commands", { token: "bridge-secret" })).json())
      .commands.length,
    0,
  );
  const data = await (await call("/world")).json();
  assert.equal(data.commands[0].status, "applied");
});
test("연결이 오래되면 새 지시를 보내지 않는다", async () => {
  const { env, call } = await setup();
  await seed(call);
  await env.DB.prepare("UPDATE snapshots SET received_at=?")
    .bind("2020-01-01T00:00:00Z")
    .run();
  assert.equal(
    (
      await call("/commands", {
        method: "POST",
        body: { id: "stale", action: "recheck", payload: { accountId: "1" } },
      })
    ).status,
    409,
  );
});

test("미리보기는 실제 재고만 요청하고 수신 후 대기열에서 지운다", async () => {
  const { call } = await setup();
  const snap = makeSnapshot();
  snap.assets = [{ id: "real-asset", title: "사용자 그림", accountId: "1" }];
  await call("/bridge/snapshot", {
    method: "POST",
    token: "bridge-secret",
    body: snap,
  });
  assert.equal(
    (await call("/previews", { method: "POST", body: { ids: ["unknown"] } }))
      .status,
    400,
  );
  assert.equal(
    (
      await call("/previews", {
        method: "POST",
        body: { ids: Array(25).fill("real-asset") },
      })
    ).status,
    400,
  );
  assert.equal(
    (await call("/previews", { method: "POST", body: { ids: ["real-asset"] } }))
      .status,
    202,
  );
  await call("/previews", { method: "POST", body: { ids: ["real-asset"] } });
  const pending = await (
    await call("/bridge/commands", { token: "bridge-secret" })
  ).json();
  assert.deepEqual(pending.previews, ["real-asset"]);
  await call("/bridge/thumbnails", {
    method: "POST",
    token: "bridge-secret",
    body: { items: [{ id: "real-asset", data: "UklGRg==" }] },
  });
  assert.deepEqual(
    (await (await call("/bridge/commands", { token: "bridge-secret" })).json())
      .previews,
    [],
  );
  const thumbnail = await call("/thumbnail/real-asset");
  assert.equal(thumbnail.status, 200);
  assert.equal(thumbnail.headers.get("Content-Type"), "image/webp");
  await call("/previews", { method: "POST", body: { ids: ["real-asset"] } });
  assert.deepEqual(
    (await (await call("/bridge/commands", { token: "bridge-secret" })).json())
      .previews,
    [],
  );
});

test("그림이 9천 개로 늘어도 작은 저장 단위로 나누고 원래 순서로 복원한다", async () => {
  const { env, call } = await setup();
  const snap = makeSnapshot();
  snap.assets = Array.from({ length: 9000 }, (_, i) => ({
    id: String(i),
    accountId: String((i % 13) + 1),
    title: "제작 그림 ".repeat(32),
    eligible: i % 2 === 0,
  }));
  assert.ok(Buffer.byteLength(JSON.stringify(snap)) > 2000000);
  assert.equal(
    (
      await call("/bridge/snapshot", {
        method: "POST",
        token: "bridge-secret",
        body: snap,
      })
    ).status,
    200,
  );
  const chunks = (
    await env.DB.prepare("SELECT data FROM snapshot_chunks ORDER BY part").all()
  ).results;
  assert.ok(chunks.length > 5);
  assert.ok(chunks.every((c) => Buffer.byteLength(c.data) < 400001));
  const restored = (await (await call("/world")).json()).snapshot;
  assert.deepEqual(restored.assets, snap.assets);
  snap.assets = snap.assets.slice(0, 10);
  snap.observedAt = new Date(Date.now() + 1).toISOString();
  assert.equal(
    (
      await call("/bridge/snapshot", {
        method: "POST",
        token: "bridge-secret",
        body: snap,
      })
    ).status,
    200,
  );
  assert.equal(
    (await env.DB.prepare("SELECT data FROM snapshot_chunks").all()).results
      .length,
    1,
  );
  assert.deepEqual(
    (await (await call("/world")).json()).snapshot.assets,
    snap.assets,
  );
});
test("일정 저장·재진입·취소와 과거 날짜 검증", async () => {
  const { call } = await setup();
  await seed(call);
  const value = {
    id: "plan-1",
    accountId: "1",
    title: "제출분 확인",
    kind: "memo",
    dueAt: new Date(Date.now() + 86400000).toISOString(),
  };
  assert.equal(
    (await call("/schedules", { method: "POST", body: value })).status,
    201,
  );
  await call("/schedules", { method: "POST", body: value });
  assert.equal((await (await call("/world")).json()).schedules.length, 1);
  assert.equal(
    (
      await call("/schedules", {
        method: "POST",
        body: { ...value, id: "past", dueAt: "2020-01-01" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/schedules/plan-1", {
        method: "PATCH",
        body: { status: "cancelled" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await call("/world")).json()).schedules[0].status,
    "cancelled",
  );
  assert.equal(
    (
      await call("/schedules/plan-1", {
        method: "PATCH",
        body: { status: "done" },
      })
    ).status,
    409,
  );
});
test("예약 재확인은 한 번만 전달되고 결과가 일정에도 반영된다", async () => {
  const { env, call } = await setup();
  await seed(call);
  const value = {
    id: "due",
    accountId: "1",
    title: "심사 확인",
    kind: "recheck",
    dueAt: new Date(Date.now() + 60000).toISOString(),
  };
  await call("/schedules", { method: "POST", body: value });
  await env.DB.prepare("UPDATE schedules SET due_at=? WHERE id=?")
    .bind("2020-01-01", "due")
    .run();
  for (let i = 0; i < 2; i++) {
    const r = await (
      await call("/bridge/commands", { token: "bridge-secret" })
    ).json();
    assert.equal(r.commands.length, 1);
  }
  await call("/bridge/result", {
    method: "POST",
    token: "bridge-secret",
    body: { id: "schedule-due", status: "applied", message: "요청 반영" },
  });
  assert.equal(
    (await (await call("/world")).json()).schedules[0].status,
    "done",
  );
});
test("다른 사업은 실제 연동과 구분해서 등록한다", async () => {
  const { call } = await setup();
  await call("/businesses", {
    method: "POST",
    body: { name: "영상 스튜디오", kind: "video", note: "운영 메모" },
  });
  const data = await (await call("/world")).json();
  assert.equal(data.businesses[0].status, "unconnected");
});

test("과거 이력 350건과 무관하게 모든 활성 일정과 최근 이력을 조회한다", async () => {
  const { env, call } = await setup();
  await seed(call);
  for (let i = 0; i < 350; i++) await env.DB.prepare("INSERT INTO schedules VALUES(?,?,?,?,?,?,?)")
    .bind(`기록-${String(i).padStart(3, '0')}`, '1', '과거 일정', '2020-01-01T00:00:00Z', 'memo', 'done', '2020').run();
  for (let i = 0; i < 310; i++) await env.DB.prepare("INSERT INTO schedules VALUES(?,?,?,?,?,?,?)")
    .bind(`active-${i}`, '1', '예정', '2030-01-01T00:00:00Z', 'memo', 'planned', '2020').run();
  const value = { id:'new-plan',accountId:'1',title:'새 일정',kind:'memo',dueAt:new Date(Date.now()+86400000).toISOString() };
  assert.equal((await call('/schedules', { method:'POST',body:value })).status,201);
  const world = await (await call('/world')).json();
  assert.ok(world.schedules.some((s) => s.id === 'new-plan'));
  assert.equal(world.schedules.filter((s) => s.status === 'planned').length,311);
  assert.equal(world.scheduleHistory.total,350);
  assert.equal(world.scheduleHistory.hasMore,true);
  const ids = new Set(world.schedules.filter((s) => s.status === 'done').map((s) => s.id));
  let cursor = world.scheduleHistory.nextCursor;
  while (cursor) {
    const page = await (await call('/schedules/history?cursor='+encodeURIComponent(cursor))).json();
    for (const item of page.items) { assert.equal(ids.has(item.id),false); ids.add(item.id); }
    cursor = page.nextCursor;
  }
  assert.equal(ids.size,350);
  assert.equal((await call('/schedules/history?cursor=invalid')).status,400);
});

test("실패 일정에 원인과 재예약 맥락이 남고 취소·새 예약으로 복구한다", async () => {
  const {env,call}=await setup(); await seed(call);
  const value={id:'failed-plan',accountId:'1',title:'심사 확인',kind:'recheck',dueAt:new Date(Date.now()+60000).toISOString()};
  await call('/schedules',{method:'POST',body:value});
  await env.DB.prepare("UPDATE schedules SET due_at='2020-01-01' WHERE id=?").bind(value.id).run();
  await call('/bridge/commands',{token:'bridge-secret'});
  await call('/bridge/result',{method:'POST',token:'bridge-secret',body:{id:'schedule-'+value.id,status:'failed',message:'작업 중이라 재확인을 반영하지 못했습니다.'}});
  const row=(await (await call('/world')).json()).schedules.find((s)=>s.id===value.id);
  assert.equal(row.status,'failed'); assert.match(row.command_message,/재확인/); assert.equal(row.account_id,'1');
  assert.equal((await call('/schedules/'+value.id,{method:'PATCH',body:{status:'cancelled'}})).status,200);
  assert.equal((await call('/schedules',{method:'POST',body:{...value,id:'retry-plan'}})).status,201);
});

test("스냅샷 읽는 사이 새 게시가 와도 한 응답에는 같은 revision만 담긴다",async()=>{
  const {env,call}=await setup();
  const old=makeSnapshot(); old.accounts[0].ready=1; old.assets=[{id:'old',title:'old'}];
  await call('/bridge/snapshot',{method:'POST',token:'bridge-secret',body:old});
  const original=env.DB.prepare.bind(env.DB); let injected=false;
  env.DB.prepare=(sql)=>{
    const statement=original(sql);
    if(sql.includes('UNION ALL SELECT part,data')){
      const read=statement.all.bind(statement);
      statement.all=async()=>{
        const rows=await read();
        if(!injected){ injected=true; const newer=makeSnapshot();newer.observedAt=new Date(Date.now()+1).toISOString();newer.accounts[0].ready=2;newer.assets=[{id:'new',title:'new'}];
          assert.equal((await call('/bridge/snapshot',{method:'POST',token:'bridge-secret',body:newer})).status,200); }
        return rows;
      };
    }
    return statement;
  };
  const data=(await (await call('/world')).json()).snapshot;
  assert.equal(injected,true); assert.equal(data.accounts[0].ready,1); assert.equal(data.assets[0].id,'old');
  const next=(await (await call('/world')).json()).snapshot;
  assert.equal(next.accounts[0].ready,2);assert.equal(next.assets[0].id,'new');
});

test("누락된 재고 청크는 빈 정상 재고로 숨기지 않는다",async()=>{
  const {env,call}=await setup();const snap=makeSnapshot();snap.assets=[{id:'asset'}];
  await call('/bridge/snapshot',{method:'POST',token:'bridge-secret',body:snap});
  await env.DB.prepare('DELETE FROM snapshot_chunks').run();
  const response=await call('/world'); assert.equal(response.status,503);assert.match((await response.json()).error,/동기화/);
});

test("앞 48개 미리보기 영구 실패가 뒤 정상 파일을 가리지 않고 유한 재시도한다",async()=>{
  const {env,call}=await setup();const snap=makeSnapshot();snap.assets=Array.from({length:49},(_,i)=>({id:`asset-${String(i).padStart(2,'0')}`}));
  await call('/bridge/snapshot',{method:'POST',token:'bridge-secret',body:snap});
  for(let i=0;i<49;i+=24)await call('/previews',{method:'POST',body:{ids:snap.assets.slice(i,i+24).map((a)=>a.id)}});
  const poll=async()=> (await (await call('/bridge/commands',{token:'bridge-secret'})).json()).previews;
  const failed=(await poll()).slice(0,48); assert.equal(failed.length,48);
  const report=()=>call('/bridge/preview-results',{method:'POST',token:'bridge-secret',body:{items:failed.map((id)=>({id,message:'원본 파일 없음'}))}});
  await report(); assert.deepEqual(await poll(),['asset-48']);
  await call('/bridge/thumbnails',{method:'POST',token:'bridge-secret',body:{items:[{id:'asset-48',data:'UklGRg=='}]}});
  for(let attempt=1;attempt<3;attempt++){
    await env.DB.prepare("UPDATE preview_failures SET retry_at='2020-01-01'").run();
    assert.equal((await poll()).length,48); await report();
  }
  assert.deepEqual(await poll(),[]);
  assert.equal((await (await call('/world')).json()).previewFailures.length,48);
  await call('/previews',{method:'POST',body:{ids:[failed[0]]}}); assert.deepEqual(await poll(),[]);
  await call('/previews',{method:'POST',body:{ids:[failed[0]],retry:true}}); assert.deepEqual(await poll(),[failed[0]]);
  await call('/bridge/thumbnails',{method:'POST',token:'bridge-secret',body:{items:[{id:failed[0],data:'UklGRg=='}]}});
  assert.equal((await (await call('/world')).json()).previewFailures.includes(failed[0]),false);
});

test("로컬 동시 batch 100개와 독립 실패 rollback이 서로 간섭하지 않는다",async()=>{
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE example(id TEXT PRIMARY KEY)');const db=adapter(sqlite);
  const results=await Promise.allSettled(Array.from({length:100},(_,i)=>db.batch([
    db.prepare('INSERT INTO example VALUES(?)').bind('first-'+i),
    db.prepare('INSERT INTO example VALUES(?)').bind(i===30?'first-30':'second-'+i),
  ])));
  assert.equal(results.filter((r)=>r.status==='fulfilled').length,99);
  assert.equal(results.filter((r)=>r.status==='rejected').length,1);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM example').get().n,198);
  assert.equal(sqlite.prepare("SELECT id FROM example WHERE id='first-30'").get(),undefined);sqlite.close();
});

test("포화·연결 단절 후 같은 ID 재전송은 기존 결과이며 다른 ID의 같은 대기 지시도 합친다",async()=>{
  const {env,call}=await setup();await seed(call);
  const value={id:'accepted',action:'recheck',payload:{accountId:'1'}};
  await call('/commands',{method:'POST',body:value});
  for(let i=0;i<19;i++)await env.DB.prepare("INSERT INTO commands(id,action,payload,created_at,updated_at) VALUES(?,?,?,?,?)")
    .bind('filler-'+i,'recheck',JSON.stringify({accountId:'filler-'+i}),'2020','2020').run();
  await env.DB.prepare("UPDATE snapshots SET received_at='2020-01-01'").run();
  const same=await call('/commands',{method:'POST',body:value});assert.equal(same.status,200);assert.equal((await same.json()).id,'accepted');
  const duplicate=await call('/commands',{method:'POST',body:{...value,id:'second-id'}});assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).id,'accepted');
  assert.equal((await call('/commands',{method:'POST',body:{...value,payload:{accountId:'2'}}})).status,409);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM commands').first()).n,20);
});

test("동시에 들어온 같은 대상 지시 16개도 하나만 접수한다",async()=>{
  const {env,call}=await setup();await seed(call);
  const responses=await Promise.all(Array.from({length:16},(_,i)=>call('/commands',{method:'POST',body:{id:'concurrent-'+i,action:'recheck',payload:{accountId:'1'}}})));
  assert.ok(responses.every((r)=>r.ok));
  const ids=await Promise.all(responses.map(async(r)=>(await r.json()).id));assert.equal(new Set(ids).size,1);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM commands').first()).n,1);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM command_requests').first()).n,16);
  await call('/bridge/result',{method:'POST',token:'bridge-secret',body:{id:ids[0],status:'applied',message:'반영 완료'}});
  for(let i=0;i<16;i++){const replay=await call('/commands',{method:'POST',body:{id:'concurrent-'+i,action:'recheck',payload:{accountId:'1'}}});assert.equal(replay.status,200);assert.equal((await replay.json()).status,'applied');}
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM commands WHERE status='queued'").first()).n,0);
});

test("추가 미리보기 실패 스키마는 기존 데이터 보존하며 적용·되돌리기·재적용한다",()=>{
  const s=new DatabaseSync(':memory:');const schema=readFileSync(new URL('../worker/schema.sql',import.meta.url),'utf8');
  s.exec(schema);s.exec("INSERT INTO schedules VALUES('keep','1','기존 일정','2030','memo','planned','2020')");
  s.exec(schema);s.exec('DROP TABLE command_requests; DROP TABLE preview_failures; DROP INDEX commands_queued_payload; DROP INDEX commands_history');
  assert.equal(s.prepare('SELECT title FROM schedules').get().title,'기존 일정');
  s.exec(schema);assert.equal(s.prepare('SELECT count(*) AS n FROM preview_failures').get().n,0);s.close();
});

test("미리보기 최대 묶음도 요청당 D1 무료 한도 50쿼리 안이다",async()=>{
  const {env,call}=await setup();const snap=makeSnapshot();snap.assets=Array.from({length:48},(_,i)=>({id:'limit-'+i}));
  await call('/bridge/snapshot',{method:'POST',token:'bridge-secret',body:snap});
  for(let i=0;i<48;i+=24)await call('/previews',{method:'POST',body:{ids:snap.assets.slice(i,i+24).map((a)=>a.id)}});
  const prepare=env.DB.prepare.bind(env.DB);let count=0;
  env.DB.prepare=(sql)=>{const q=prepare(sql);for(const name of ['first','all','run']){const fn=q[name].bind(q);q[name]=(...args)=>{count++;return fn(...args);};}return q;};
  assert.equal((await call('/bridge/preview-results',{method:'POST',token:'bridge-secret',body:{items:snap.assets.map((a)=>({id:a.id,message:'파일 없음'}))}})).status,200);
  assert.equal(count,49);count=0;
  assert.equal((await call('/bridge/thumbnails',{method:'POST',token:'bridge-secret',body:{items:snap.assets.slice(0,25).map((a)=>({id:a.id,data:'UklGRg=='}))}})).status,200);
  assert.equal(count,27);
});

test("청크가 파손된 재고도 유효한 새 스냅샷으로 복구하고 과거 게시만 거부한다",async()=>{
  const {env,call}=await setup();const snap=makeSnapshot();snap.assets=[{id:'old'}];
  await call('/bridge/snapshot',{method:'POST',token:'bridge-secret',body:snap});
  await env.DB.prepare('DELETE FROM snapshot_chunks').run();assert.equal((await call('/world')).status,503);
  assert.equal((await call('/bridge/snapshot',{method:'POST',token:'bridge-secret',body:{...snap,observedAt:'2020-01-01'}})).status,409);
  const repaired={...snap,observedAt:new Date(Date.now()+1000).toISOString(),assets:[{id:'restored'}]};
  assert.equal((await call('/bridge/snapshot',{method:'POST',token:'bridge-secret',body:repaired})).status,200);
  assert.equal((await (await call('/world')).json()).snapshot.assets[0].id,'restored');
  await env.DB.prepare('UPDATE snapshots SET data=?').bind('{broken metadata').run();
  assert.equal((await call('/bridge/snapshot',{method:'POST',token:'bridge-secret',body:repaired})).status,200);
  assert.equal((await call('/world')).status,200);
});

test("합쳐 접수한 요청 ID는 원본 지시 완료 뒤 재전송해도 다시 실행하지 않는다",async()=>{
  const {env,call}=await setup();await seed(call);
  const command={action:'automation',payload:{lane:'upload',enabled:false}};
  assert.equal((await call('/commands',{method:'POST',body:{...command,id:'request-A'}})).status,201);
  const collapsed=await call('/commands',{method:'POST',body:{...command,id:'request-B'}});assert.equal(collapsed.status,200);assert.equal((await collapsed.json()).id,'request-A');
  await call('/bridge/result',{method:'POST',token:'bridge-secret',body:{id:'request-A',status:'applied',message:'반영 완료'}});
  await env.DB.prepare("UPDATE snapshots SET received_at='2020-01-01'").run();
  const retry=await call('/commands',{method:'POST',body:{...command,id:'request-B'}});assert.equal(retry.status,200);
  const data=await retry.json();assert.equal(data.id,'request-A');assert.equal(data.status,'applied');
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM commands WHERE status='queued'").first()).n,0);
  assert.equal((await call('/commands',{method:'POST',body:{...command,id:'request-B',payload:{lane:'upload',enabled:true}}})).status,409);
});

test("실제 세션의 미리보기 24건 명시 재시도도 50쿼리 한도 안에 반영한다",async()=>{
  const {env,call}=await setup(false);const snap=makeSnapshot();snap.assets=Array.from({length:24},(_,i)=>({id:'retry-'+i}));
  await call('/bridge/snapshot',{method:'POST',token:'bridge-secret',body:snap});
  const login=await call('/login',{method:'POST',body:{password:'a-strong-test-password'}});const cookie=login.headers.get('set-cookie');assert.equal(login.status,200);
  for(const asset of snap.assets)await env.DB.prepare('INSERT INTO preview_failures VALUES(?,?,?,?,?)').bind(asset.id,3,'2020','파일 없음','2020').run();
  const prepare=env.DB.prepare.bind(env.DB);let count=0;
  env.DB.prepare=(sql)=>{const q=prepare(sql);for(const name of ['first','all','run']){const fn=q[name].bind(q);q[name]=(...args)=>{count++;if(count>50)throw new Error('Simulated D1 Free 50-query invocation budget exceeded');return fn(...args);};}return q;};
  const retry=await call('/previews',{method:'POST',cookie,body:{ids:snap.assets.map((a)=>a.id),retry:true}});
  assert.equal(retry.status,202);assert.equal(count,28);
  env.DB.prepare=prepare;
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM preview_requests').first()).n,24);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM preview_failures').first()).n,0);
});

test("최근 종료 지시 41건이 오래된 대기 지시 200건을 숨기지 않는다",async()=>{
  const {env,call}=await setup();await seed(call);
  for(let i=0;i<200;i++)await env.DB.prepare('INSERT INTO commands(id,action,payload,status,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .bind('queued-'+String(i).padStart(3,'0'),'recheck',JSON.stringify({accountId:String(i%13+1)}),'queued','2020-01-01','2020-01-01').run();
  for(let i=0;i<41;i++)await env.DB.prepare('INSERT INTO commands(id,action,payload,status,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .bind('finished-'+String(i).padStart(3,'0'),'recheck',JSON.stringify({accountId:'1'}),i%2?'failed':'applied','2030-01-01','2030-01-01').run();
  const data=await (await call('/world')).json();
  assert.equal(data.commands.filter((c)=>c.status==='queued').length,200);
  assert.equal(data.commands.filter((c)=>c.status!=='queued').length,40);
  assert.equal(data.commands.length,240);assert.equal(new Set(data.commands.map((c)=>c.id)).size,240);
  assert.ok(data.commands.some((c)=>c.id==='queued-000'));
  assert.equal(data.commands.some((c)=>c.id==='finished-000'),false);
  assert.equal(data.commands[0].id,'finished-040');
  assert.deepEqual((await (await call('/world')).json()).commands.map((c)=>c.id),data.commands.map((c)=>c.id));
});
