import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeLabels, siteLayout, accountDistrict, districtRanges, districtCenters, processes } from '../src/world/layout.ts';

function assertTargets(labels, safe, count) {
  assert.equal(new Set(labels.map(n => n.id)).size, count);
  for (const a of labels) {
    assert.ok(a.width >= 48 && a.height >= 48, `${a.id}: full touch target`);
    assert.ok(a.x - a.width / 2 >= safe.left - .01);
    assert.ok(a.x + a.width / 2 <= safe.right + .01);
    assert.ok(a.y - a.height / 2 >= safe.top - .01);
    assert.ok(a.y + a.height / 2 <= safe.bottom + .01);
    for (const b of labels) if (a !== b) {
      assert.ok(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 + 3.99 || Math.abs(a.y - b.y) >= (a.height + b.height) / 2 + 3.99, `${a.id} / ${b.id} collide`);
    }
  }
}

test('13개 작업동의 신원과 네 공정의 물리 위치는 기기 방향·화면 크기로 바뀌지 않는다', () => {
  const baseline = siteLayout(390, 844);
  for (const [width,height] of [[360,640],[320,568],[768,1024],[1024,768],[1440,900]]) {
    assert.deepEqual(siteLayout(width,height), baseline);
  }
  assert.equal(baseline.plots.length,13);
  assert.equal(baseline.facilities.length,4);
  assert.equal(new Set([...baseline.plots,...baseline.facilities].map(p=>p.join(','))).size,17);
  assert.deepEqual(processes.map(p=>p.key),['generation','review','stock','submission']);
});

test('네 지구는 4/3/3/3 계정과 자기 공정 하나를 지니고 다른 계정의 신원을 재사용하지 않는다', () => {
  const layout=siteLayout(390,844),seen=[];
  districtRanges.forEach(([first,last],district)=>{
    const [cx,cz]=districtCenters[district];
    const accounts=Array.from({length:last-first+1},(_,i)=>first+i);
    assert.equal(accounts.length,district===0?4:3);
    for(const number of accounts){
      assert.equal(accountDistrict(number),district);
      const [x,z]=layout.plots[number-1];
      assert.ok(Math.abs(x-cx)<=6 && z>=cz-2 && z<=cz+11);
      seen.push(number);
    }
    assert.deepEqual(layout.facilities[district],[cx,cz-11]);
  });
  assert.deepEqual(seen,Array.from({length:13},(_,i)=>i+1));
});

test('360×640에서 선택 트레이 위에 다섯 시설의 최소 48px 표찰이 겹치지 않고 들어간다', () => {
  const safe={left:20,right:340,top:124,bottom:420};
  const anchors=[{id:'generation',x:172,y:168,width:96,height:48},...[[115,247],[225,247],[115,351],[225,351]].map(([x,y],i)=>({id:String(i+1),x,y,width:62,height:51}))];
  const original=structuredClone(anchors);
  const labels=arrangeLabels(anchors,safe);
  assertTargets(labels,safe,5);
  assert.deepEqual(anchors,original);
  for(const node of anchors){const placed=labels.find(l=>l.id===node.id);assert.ok(Math.hypot(placed.x-node.x,placed.y-node.y)<24,`${node.id}: spatial identity`);}
});

test('가장자리 확대 화면에서도 겹친 시설은 완전한 터치 영역을 유지한다', () => {
  const safe={left:20,right:340,top:124,bottom:420};
  const labels=arrangeLabels([
    {id:'1',x:30,y:130,width:64,height:52},
    {id:'2',x:55,y:145,width:64,height:52},
    {id:'3',x:300,y:410,width:64,height:52},
    {id:'4',x:315,y:412,width:64,height:52},
  ],safe);
  assertTargets(labels,safe,4);
});
