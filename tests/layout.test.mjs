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

test('13개 창고와 일곱 공정은 모든 기기에서 빠짐없이 연결된다', () => {
  const baseline = siteLayout(390, 844);
  for (const [width,height] of [[360,640],[320,568],[768,1024]])assert.deepEqual(siteLayout(width,height), baseline);
  for(const [width,height]of [[1024,768],[1440,900]]){
    const landscape=siteLayout(width,height);assert.equal(landscape.landscape,true);assert.equal(landscape.plots.length,13);assert.equal(landscape.facilities.length,7);
    assert.equal(new Set([...landscape.plots,...landscape.facilities].map(p=>p.join(','))).size,20);
    for(let i=0;i<12;i++){if(i%4<3)assert.ok(landscape.plots[i+1][0]>landscape.plots[i][0]);else assert.ok(landscape.plots[i+1][1]>landscape.plots[i][1]);}
    assert.ok(landscape.facilities[0][0]<landscape.plots[0][0]);
    assert.ok(landscape.facilities[3][0]>landscape.plots[3][0]);
  }
  assert.equal(baseline.plots.length,13);
  assert.equal(baseline.facilities.length,7);
  assert.equal(baseline.cols,4);
  assert.equal(new Set([...baseline.plots,...baseline.facilities].map(p=>p.join(','))).size,20);
  assert.deepEqual(processes.map(p=>p.key),['generation','review','stock','submission','inspection','archive','revenue']);
});

test('13개 계정은 같은 연속 단지에 있고 마지막 창고가 제출처와 같은 행을 공유한다', () => {
  const layout=siteLayout(390,844);
  assert.deepEqual(districtRanges,[[1,13]]);
  assert.equal(districtCenters.length,1);
  for(let number=1;number<=13;number++){
    assert.equal(accountDistrict(number),0);
    const [x,z]=layout.plots[number-1];
    assert.ok(x-4.1>=layout.minX && x+4.1<=layout.maxX);
    assert.ok(z-3.6>=layout.minZ && z+3.6<=layout.maxZ);
  }
  assert.equal(layout.plots[12][1],layout.facilities[3][1]);
  assert.ok(layout.facilities[0][1]<layout.plots[0][1]);
  assert.ok(layout.facilities[3][1]<layout.facilities[4][1]);
  assert.ok(layout.facilities[4][1]<layout.facilities[5][1]);
  assert.ok(layout.facilities[5][1]<layout.facilities[6][1]);
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


test('짧은 가로 화면은 13창고를 7×2 또는 5×3으로 배치해 44px 조작 공간을 확보한다',()=>{
  const phone=siteLayout(844,390),small=siteLayout(640,360);
  assert.equal(phone.cols,7);assert.equal(small.cols,5);
  assert.equal(phone.compactLandscape,true);assert.equal(small.compactLandscape,true);
  assert.equal(new Set(phone.plots.map(p=>p[1])).size,2);assert.equal(new Set(small.plots.map(p=>p[1])).size,3);
  for(const layout of [phone,small]){assert.equal(layout.plots.length,13);assert.equal(new Set(layout.plots.map(p=>p.join(','))).size,13);}
});
