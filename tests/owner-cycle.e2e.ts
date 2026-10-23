import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { enter, hasPrivateOwnerCycleSource, ownerCycleFixture } from "./game-fixture";

const ids = Array.from({ length: 13 }, (_, i) => String(i + 1));
function expectedReviewOverview(reviewOn:string) {
  const today = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(Date.now());
  const deadline = Date.parse(reviewOn + "T23:59:59+09:00");
  if (deadline < Date.now()) return "결과 예상일 경과";
  const current = Date.parse(today + "T12:00:00+09:00"), target = Date.parse(reviewOn + "T12:00:00+09:00");
  const delta = Math.round((target-current)/86400000);
  const [month,day]=reviewOn.slice(5).split("-").map(Number);
  const label = delta === 0 ? "오늘" : delta === 1 ? "내일" : month + "/" + day;
  return "결과 " + label + " 예상";
}

async function signs(page: import("@playwright/test").Page) {
  return page.locator("[data-account]").evaluateAll(items => items.map(item => {
    const sign = item as HTMLElement, rect = sign.getBoundingClientRect(), css = getComputedStyle(sign);
    const fields = [["심사","[data-cycle-review]"],["조건","[data-cycle-submission]"],["다음 확인","[data-cycle-next]"],["계획","[data-cycle-plan]"]].flatMap(([name,selector]) => {
      const node = sign.querySelector<HTMLElement>(selector); if(!node) return [];
      const r = node.getBoundingClientRect();
      return [{ name, text: node.innerText.trim().replace(/^\d+\s*/, ""), clipped: node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1,
        rect: { x:r.x, y:r.y, right:r.right, bottom:r.bottom } }];
    });
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { id:sign.dataset.account!, visible:css.visibility === "visible" && rect.width > 0 && rect.height > 0,
      rect:{x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height},
      css:{width:parseFloat(css.width),height:parseFloat(css.height)}, hit:!!hit && sign.contains(hit),
      hitTarget:hit?`${hit.tagName.toLowerCase()}${hit instanceof HTMLElement && hit.className?'.'+String(hit.className).trim().replace(/\s+/g,'.'):''}`:null,
      aria:sign.getAttribute("aria-label") || "", fields };
  }));
}

async function settleOverview(page: import("@playwright/test").Page,width:number,height:number) {
  let previous="", repeats=0;
  await expect.poll(async()=>{
    const state=await page.evaluate(()=>{
      const world=(window as any).__bizWorld;
      const labels=[...document.querySelectorAll<HTMLElement>("[data-account]")].map(node=>{
        const rect=node.getBoundingClientRect();
        return {id:node.dataset.account,visible:getComputedStyle(node).visibility==="visible"&&rect.width>0&&rect.height>0,
          rect:[rect.x,rect.y,rect.width,rect.height].map(value=>Math.round(value*10)/10)};
      });
      return {selected:world?.selected??null,visible:labels.filter(label=>label.visible).length,labels};
    });
    const signature=JSON.stringify(state.labels);
    repeats=signature===previous?repeats+1:0; previous=signature;
    const inside=state.labels.every(label=>!label.visible||label.rect[0]>=-1&&label.rect[1]>=-1&&label.rect[0]+label.rect[2]<=width+1&&label.rect[1]+label.rect[3]<=height+1);
    return {...state,inside,stable:repeats>=2};
  },{timeout:5000,intervals:[100,150,200,250]}).toMatchObject({selected:null,visible:13,inside:true,stable:true});
}

async function assertSigns(page: import("@playwright/test").Page, width:number, height:number) {
  await expect(page.locator("[data-account]")).toHaveCount(13);
  const all = await signs(page);
  expect(all.map(x=>x.id).sort((a,b)=>Number(a)-Number(b))).toEqual(ids);
  for (const s of all) {
    expect(s.visible, "account " + s.id + " visibility").toBe(true);
    expect(s.hit, `account ${s.id} actual center hit (got ${s.hitTarget}, rect=${JSON.stringify(s.rect)})`).toBe(true);
    expect(s.rect.width).toBeGreaterThanOrEqual(43.99); expect(s.rect.height).toBeGreaterThanOrEqual(43.99);
    expect(s.css.width).toBeGreaterThanOrEqual(44); expect(s.css.height).toBeGreaterThanOrEqual(44);
    expect(s.rect.x).toBeGreaterThanOrEqual(-1); expect(s.rect.y).toBeGreaterThanOrEqual(-1);
    expect(s.rect.right).toBeLessThanOrEqual(width+1); expect(s.rect.bottom).toBeLessThanOrEqual(height+1);
    expect(s.aria).toMatch(/심사/); expect(s.aria).toMatch(/제출|자동|제작|실행/);
    expect(s.aria).toMatch(/확인|재시도|요청|일정|시각|재개|순회/);
    expect(s.fields.map(f=>f.text).every(Boolean)).toBe(true);
    expect(s.fields.filter(f=>f.clipped)).toEqual([]);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const overlaps=await page.locator("[data-account]").evaluateAll(items=>items.flatMap((a,i)=>items.slice(i+1).flatMap(b=>{
    const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();
    return x.right>y.left&&y.right>x.left&&x.bottom>y.top&&y.bottom>x.top?[a.getAttribute("data-account")+"/"+b.getAttribute("data-account")]:[];
  })));
  expect(overlaps).toEqual([]);
  const textOverlaps=await page.locator("[data-account]").evaluateAll(items=>{
    const fields=items.flatMap(sign=>Array.from(sign.querySelectorAll<HTMLElement>("[data-cycle-review],[data-cycle-submission],[data-cycle-next],[data-cycle-plan]"),node=>({
      account:sign.getAttribute("data-account"),name:node.matches("[data-cycle-review]")?"심사":node.matches("[data-cycle-submission]")?"조건":node.matches("[data-cycle-plan]")?"계획":"다음 확인",rect:node.getBoundingClientRect()
    })));
    return fields.flatMap((a,i)=>fields.slice(i+1).flatMap(b=>{
      const x=Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left),y=Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top);
      return x>.5&&y>.5?[`${a.account}번 ${a.name} ↔ ${b.account}번 ${b.name} (${x.toFixed(1)}×${y.toFixed(1)}px)`]:[];
    }));
  });
  expect(textOverlaps,"실제 3개 상태 명판 텍스트 영역끼리 겹치지 않아야 함").toEqual([]);
  return all;
}

function assertGrid(all: Awaited<ReturnType<typeof signs>>, columns:number, rows:number, width:number) {
  const clusterCount=(values:number[],gap:number)=>values.sort((a,b)=>a-b).reduce((count,value,index,array)=>
    index===0||value-array[index-1]>gap?count+1:count,0);
  const gap=width>=1000?90:36;
  expect(clusterCount(all.map(x=>x.rect.x+x.rect.width/2),gap),"실제 명판 가로 열 수").toBe(columns);
  expect(clusterCount(all.map(x=>x.rect.y+x.rect.height/2),gap),"실제 명판 세로 행 수").toBe(rows);
}

test("13계정 전경은 선택 없이 심사·제출 조건·다음 확인을 읽을 수 있다", async ({page})=>{
  await page.setViewportSize({width:360,height:640});
  const {DB,source,snapshot}=await ownerCycleFixture(page);
  if (!hasPrivateOwnerCycleSource) expect(source.snapshot.accounts.every(account=>account.email===null&&!account.account.includes("@"))).toBe(true);
  await enter(page);
  await expect.poll(()=>page.evaluate(()=> (window as any).__bizWorld?.view)).toBe("owner-cycle-workshop");
  await expect.poll(()=>page.evaluate(()=> (window as any).__bizWorld?.loaded)).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(()=> (window as any).__bizWorld?.modelFailures)).toEqual([]);
  const all=await assertSigns(page,360,640);
  assertGrid(all,3,5,360);
  expect(all.find(x=>x.id==="1")!.fields[1].text).toBe("결과 확인 실패");
  expect(all.find(x=>x.id==="6")!.fields[1].text).toBe("언어 전환 실패");
  expect(all.find(x=>x.id==="13")!.fields[1].text).toBe("로그인 계정 다름");
  for (const id of ["1","6","13"]) expect(all.find(x=>x.id===id)!.fields[2].text).toMatch(/재시도/);
  expect(all.find(x=>x.id==="1")!.fields[0].text).toBe("심사 비었음");
  expect(all.find(x=>x.id==="6")!.fields[0].text).toBe("심사 20");
  expect(all.find(x=>x.id==="13")!.fields[0].text).toBe("심사 비었음");
  for (const id of ["2","3","4","5","7","8","9","10","11","12"]) {
    const sign=all.find(x=>x.id===id)!, account=source.snapshot.accounts.find(a=>a.id===id)!;
    expect(sign.fields[0].text).toBe("심사 20"); expect(sign.fields[1].text).toBe(expectedReviewOverview(account.reviewOn!)); expect(sign.fields[2].text).toMatch(/확인/);
  }
  expect(await page.evaluate(()=> (window as any).__bizWorld.layoutColumns)).toBe(3);
  const row=await DB.prepare("SELECT data,received_at FROM snapshots WHERE id='miricanvas'").first<any>();
  const {receivedAt:storedReceivedAt,...storedBusiness}=JSON.parse(row.data);
  const {receivedAt:sourceReceivedAt,...sourceBusiness}=source.snapshot;
  expect(storedBusiness).toEqual(sourceBusiness); expect(storedReceivedAt).not.toBe(sourceReceivedAt);
  expect(row.received_at).toBe(storedReceivedAt); expect(snapshot.receivedAt).toBe(storedReceivedAt);
  expect(source.snapshot.accounts).toHaveLength(13);
  if (!hasPrivateOwnerCycleSource) await page.screenshot({path:"artifacts/owner-cycle/qa/synthetic-360x640.png",animations:"disabled"});
});

test("개인 원본 artifact가 있을 때만 별도 원본 복제 경로를 검증한다",async ({page})=>{
  test.skip(!hasPrivateOwnerCycleSource,"비공개 source-world artifact가 없는 clean checkout에서는 개인정보 없는 synthetic fixture만 실행한다.");
  await page.setViewportSize({width:360,height:640});
  const {DB,source,snapshot}=await ownerCycleFixture(page); await enter(page);
  const all=await assertSigns(page,360,640);
  expect(source.snapshot.accounts).toHaveLength(13);
  expect(all.find(x=>x.id==="1")!.fields[0].text).toBe("심사 비었음");
  expect(all.find(x=>x.id==="1")!.fields[1].text).toBe("결과 확인 실패");
  expect(all.find(x=>x.id==="6")!.fields[0].text).toBe("심사 20");
  expect(all.find(x=>x.id==="6")!.fields[1].text).toBe("언어 전환 실패");
  expect(all.find(x=>x.id==="13")!.fields[0].text).toBe("심사 비었음");
  expect(all.find(x=>x.id==="13")!.fields[1].text).toBe("로그인 계정 다름");
  for (const id of ["2","3","4","5","7","8","9","10","11","12"]) {
    const sign=all.find(x=>x.id===id)!, account=source.snapshot.accounts.find(a=>a.id===id)!;
    expect(sign.fields[1].text).toBe(expectedReviewOverview(account.reviewOn!));
  }
  expect(all.every(x=>!x.aria.includes("@"))).toBe(true);
  const row=await DB.prepare("SELECT data,received_at FROM snapshots WHERE id='miricanvas'").first<any>();
  const {receivedAt:storedReceivedAt,...storedBusiness}=JSON.parse(row.data);
  const {receivedAt:sourceReceivedAt,...sourceBusiness}=source.snapshot;
  expect(storedBusiness).toEqual(sourceBusiness); expect(storedReceivedAt).not.toBe(sourceReceivedAt);
  expect(row.received_at).toBe(storedReceivedAt); expect(snapshot.receivedAt).toBe(storedReceivedAt);
});

test("실제 3D 계정을 선택해 작업을 확인하고 닫으면 13개 전경으로 돌아온다", async ({page})=>{
  await page.setViewportSize({width:360,height:640});
  await ownerCycleFixture(page); await enter(page);
  const physical=await page.evaluate(()=> (window as any).__bizWorld.physicalAreas.find((x:any)=>x.id==="13"&&x.area==="review"));
  const canvas=page.locator(".world canvas");
  const point={x:physical.x,y:physical.y};
  const bounds=await canvas.boundingBox(); expect(bounds).not.toBeNull();
  const exposed=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,{x:bounds!.x+point.x,y:bounds!.y+point.y});
  expect(exposed,"mesh click point must be exposed canvas, outside HTML sign").toBe("CANVAS");
  await canvas.click({position:point,force:true});
  await expect.poll(()=>page.evaluate(()=> (window as any).__bizWorld.lastPick?.hits?.[0])).toMatchObject({account:"13",area:"review"});
  await expect(page.locator(".panel-inventory")).toBeVisible();
  await page.getByRole("button",{name:"패널 닫기"}).click();
  await expect(page.getByRole("region",{name:"시설 행동"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"13번 계정",exact:true})).toBeVisible();
  const tray=page.getByRole("region",{name:"시설 행동"});
  await expect(tray.locator(".cycle-review strong")).toHaveText("심사 비었음");
  await expect(tray.locator(".cycle-next")).toContainText("제출 막힘");
  await expect(tray.locator(".cycle-next")).toContainText("재시도");
  await expect(tray.locator(".cycle-blocker")).toContainText("다른 계정으로 로그인됨");
  await expect.poll(()=>page.evaluate(()=> (window as any).__bizWorld.lastPick?.hits?.some((hit:any)=>hit.account==="13"))).toBe(true);
  await expect(page.locator("[data-account]")).toHaveCount(13);
  await expect.poll(()=>page.evaluate(()=> (window as any).__bizWorld.physicalAccounts.length)).toBe(13);
  await expect(page.locator('[data-account="13"]')).toHaveClass(/selected/);
  await page.getByRole("button",{name:"시설 선택 닫기"}).click();
  await expect(page.getByRole("region",{name:"시설 행동"})).toHaveCount(0);
  await expect(page.locator("[data-account].selected")).toHaveCount(0);
  await settleOverview(page,360,640);
  await assertSigns(page,360,640);
});

test("390px 세로와 PC에서 계정별 핵심 정보를 같은 작업소에서 읽는다", async ({page})=>{
  const {source}=await ownerCycleFixture(page);
  for (const [width,height,file,cols] of [[390,844,"source-390x844.png",3],[1440,900,"source-1440x900.png",5]] as const) {
    await page.setViewportSize({width,height});
    if(width===390) await enter(page);
    await expect.poll(()=>page.evaluate(()=> (window as any).__bizWorld?.ready===true && (window as any).__bizWorld?.processes?.length===7 && (window as any).__bizWorld?.visibleAccounts?.length===13)).toBe(true);
    await settleOverview(page,width,height);
    await expect.poll(()=>page.evaluate(()=> (window as any).__bizWorld.layoutColumns)).toBe(cols);
    const all=await assertSigns(page,width,height); assertGrid(all,cols,Math.ceil(13/cols),width); expect(all.filter(x=>x.fields[0].text==="심사 20")).toHaveLength(11);
    if (!hasPrivateOwnerCycleSource) await page.screenshot({path:"artifacts/owner-cycle/qa/"+file,animations:"disabled"});
  }
  expect(source.snapshot.accounts.map(a=>a.id)).toEqual(ids);
});

test("막힘·심사와 수동 제출 계획을 별도 줄에 동시에 표시한다",async ({page})=>{
  const plan="2026-11-02";
  const createdAt=new Date().toISOString();
  const recheckAt=new Date(Date.now()+6*60*60*1000).toISOString();
  await ownerCycleFixture(page,{
    mutateSnapshot(snapshot){ for(const id of ["1","2"]) snapshot.calendar.push({id:"synthetic-"+id,accountId:id,uploaded_on:"2026-10-23",check_on:null,checked_on:null,next_upload_on:plan,review_business_days:7,review_day_basis:"business",note:"synthetic"}); },
    schedules:[{id:"synthetic-recheck",account_id:"2",title:"재확인 요청",due_at:recheckAt,kind:"recheck",status:"planned",created_at:createdAt}],
  });
  await page.setViewportSize({width:390,height:844}); await enter(page);
  const one=page.locator('[data-account="1"]'),two=page.locator('[data-account="2"]');
  await expect(one.locator("[data-cycle-review] strong")).toHaveText("심사 비었음");
  await expect(one.locator("[data-cycle-submission]")).toHaveText("결과 확인 실패");
  await expect(one.locator("[data-cycle-plan]")).toHaveText(/^계획 /);
  await expect(one.locator("[data-cycle-next]")).toHaveText(/재시도/);
  await expect(two.locator("[data-cycle-review] strong")).toHaveText("심사 20");
  await expect(two.locator("[data-cycle-submission]")).toContainText("결과 ");
  await expect(two.locator("[data-cycle-plan]")).toHaveText(/^계획 /);
  await expect(two.locator("[data-cycle-next]")).toHaveText(/^확인 /);
  await expect(two).not.toContainText("제출 예약");
  await assertSigns(page,390,844);
  await page.getByRole("button",{name:"다음 일정",exact:true}).click();
  await expect(page.locator(".panel-schedule")).toContainText("재확인 요청");
  const cycles=await page.evaluate(()=> (window as any).__bizWorld.cycles);
  expect(cycles.find((x:any)=>x.id==="1").submissionReservation).toBeNull();
  expect(cycles.find((x:any)=>x.id==="2").submissionReservation).toBeNull();
});

test("실행 중인 계정에도 기록된 제출 계획을 유지한다",async ({page})=>{
  const plan="2026-11-02";
  await ownerCycleFixture(page,{
    mutateSnapshot(snapshot){
      snapshot.accounts.find((account:any)=>account.id==="3").running=true;
      snapshot.automation.runLockActive=true;
      snapshot.automation.statusObservedAt=new Date().toISOString();
      snapshot.automation.lastPollAt=new Date().toISOString();
      snapshot.automation.lastRunAt=new Date().toISOString();
      snapshot.calendar.push({id:"running-plan",accountId:"3",uploaded_on:"2026-10-23",check_on:null,checked_on:null,next_upload_on:plan,review_business_days:7,review_day_basis:"business",note:"synthetic"});
    },
  });
  await page.setViewportSize({width:390,height:844}); await enter(page);
  const running=page.locator('[data-account="3"]');
  await expect(running.locator("[data-cycle-submission]")).toHaveText("실행 확인 중");
  await expect(running.locator("[data-cycle-plan]")).toHaveText(/^계획 /);
  await expect(running.locator("[data-cycle-next]")).toContainText("확인");
});

test("자동화 정지 중에도 실제 실행 감지를 보존하고 더 늦은 재확인 요청을 표시한다",async ({page})=>{
  const createdAt=new Date().toISOString();
  const recheckAt=new Date(Date.now()+6*60*60*1000).toISOString();
  const {DB}=await ownerCycleFixture(page,{
    mutateSnapshot(snapshot){
      snapshot.automation.enabled=false;
      snapshot.automation.runLockActive=true;
      snapshot.automation.statusObservedAt=new Date().toISOString();
      snapshot.automation.lastPollAt=new Date().toISOString();
      snapshot.automation.lastRunAt=new Date().toISOString();
      snapshot.accounts.find((account:any)=>account.id==="3").running=true;
    },
  });
  await page.setViewportSize({width:390,height:844}); await enter(page);
  const running=page.locator('[data-account="3"]');
  await expect(running.locator("[data-cycle-submission]")).toHaveText("실행 확인 중");
  await expect(running.locator("[data-cycle-next]")).toHaveText("재개 필요");
  if(!hasPrivateOwnerCycleSource){
    await mkdir("artifacts/owner-cycle/qa",{recursive:true});
    await page.screenshot({path:"artifacts/owner-cycle/qa/candidate4-stopped-running-before-recheck.png",animations:"disabled"});
  }

  const row=await DB.prepare("SELECT data FROM snapshots WHERE id='miricanvas'").first<any>();
  const account=JSON.parse(row.data).accounts.find((item:any)=>item.id==="3");
  expect(Date.parse(recheckAt)).toBeGreaterThan(Date.parse(account.nextCheckAt));
  await DB.prepare("INSERT INTO schedules(id,account_id,title,due_at,kind,status,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind("later-running-recheck","3","늦은 재확인 요청",recheckAt,"recheck","planned",createdAt).run();
  await page.reload();
  await settleOverview(page,390,844);
  await expect.poll(()=>page.evaluate(()=> (window as any).__bizWorld?.ready===true && (window as any).__bizWorld?.visibleAccounts?.includes("3"))).toBe(true);
  await assertSigns(page,390,844);
  await expect(page.locator('[data-account="3"]')).toBeVisible();
  await expect(page.locator('[data-account="3"] [data-cycle-submission]')).toHaveText("실행 확인 중");
  await expect(page.locator('[data-account="3"] [data-cycle-next]')).toHaveText(/^요청 /);
  if(!hasPrivateOwnerCycleSource) await page.screenshot({path:"artifacts/owner-cycle/qa/candidate4-later-recheck-request-visible.png",animations:"disabled"});
});

test("자동화가 정지해도 수동 제출 계획과 재개 필요 상태를 함께 보인다",async ({page})=>{
  const plan="2026-11-02";
  await ownerCycleFixture(page,{
    mutateSnapshot(snapshot){
      snapshot.automation.enabled=false;
      snapshot.calendar.push({id:"paused-plan",accountId:"4",uploaded_on:"2026-10-23",check_on:null,checked_on:null,next_upload_on:plan,review_business_days:7,review_day_basis:"business",note:"synthetic"});
    },
  });
  await page.setViewportSize({width:390,height:844}); await enter(page);
  const paused=page.locator('[data-account="4"]');
  await expect(paused.locator("[data-cycle-submission]")).toHaveText("자동 제출 정지");
  await expect(paused.locator("[data-cycle-plan]")).toHaveText(/^계획 /);
  await expect(paused.locator("[data-cycle-next]")).toHaveText("재개 필요");
});

test("미예약·자동화 정지·stale·심사 수 불일치는 서로 다른 상태다",async ({page,context})=>{
  await ownerCycleFixture(page,{mutateSnapshot(snapshot){
    snapshot.automation.enabled=false;
    const two=snapshot.accounts.find((a:any)=>a.id==="2"); two.capacity.pending=19; two.capacity.observed_at=new Date().toISOString();
  }});
  await page.setViewportSize({width:390,height:844}); await enter(page);
  await expect(page.locator('[data-account="3"] [data-cycle-submission]')).toHaveText("자동 제출 정지");
  await expect(page.locator('[data-account="3"] [data-cycle-next]')).toHaveText("재개 필요");
  await expect(page.locator('[data-account="2"] [data-cycle-review] strong')).toHaveText(/심사 수 대조/);
  await expect(page.locator('[data-account="2"] [data-cycle-submission]')).toHaveText("심사 수 확인 필요");
  await page.close();
  const stale=await context.newPage(); await stale.setViewportSize({width:390,height:844});
  await ownerCycleFixture(stale,{stale:true}); await enter(stale);
  await expect(stale.locator('[data-account="2"] [data-cycle-review] strong')).toHaveText("상태 미확인");
  await expect(stale.locator('[data-account="2"] [data-cycle-next]')).toHaveText("일정 미확인");
});
