import test from 'node:test';
import assert from 'node:assert/strict';
import {siteLayout,accountDistrict,districtRanges,processes} from '../src/world/layout.ts';

const viewports=[[360,640],[390,844],[430,932],[768,1024],[844,390],[1440,900]];
test('13개 계정의 심사 작업대는 기기에 맞게 같은 공간에서 순서대로 배치된다',()=>{
 for(const [width,height]of viewports){
  const layout=siteLayout(width,height),expectedCols=width>=600&&width>height*1.2?5:3;
  assert.equal(layout.plots.length,13);assert.equal(layout.cols,expectedCols);
  assert.equal(new Set(layout.plots.map(point=>point.join(','))).size,13);
  for(let i=0;i<13;i++){
   const [x,z]=layout.plots[i];
   assert.ok(x-3.5>=layout.minX&&x+3.5<=layout.maxX,`${width}: account ${i+1} side bounds`);
   assert.ok(z-2>=layout.minZ&&z+5<=layout.maxZ,`${width}: account ${i+1} table and three-line plate bounds`);
   if(i){const previous=layout.plots[i-1];if(i%expectedCols)assert.ok(x>previous[0]&&z===previous[1]);else assert.ok(x<previous[0]&&z>previous[1]);}
  }
 }
});
test('세로 전경은 3열 5행이고 마지막 빈 두 자리에 월수익과 제출 계획이 연결된다',()=>{
 for(const [width,height]of viewports.filter(([w,h])=>w<h)){
  const layout=siteLayout(width,height);assert.equal(new Set(layout.plots.map(p=>p[1])).size,5);
  const last=layout.plots[12],submission=layout.facilities[3],revenue=layout.facilities[6];
  assert.equal(last[1],submission[1]);assert.equal(last[1],revenue[1]);
  assert.ok(last[0]<revenue[0]&&revenue[0]<submission[0]);
  assert.ok(layout.facilities[0][1]<layout.plots[0][1]);
 }
});
test('계정 안의 재고·심사·완료는 분리된 원격 지구나 별도 창고 시설을 만들지 않는다',()=>{
 assert.deepEqual(districtRanges,[[1,13]]);for(let number=1;number<=13;number++)assert.equal(accountDistrict(number),0);
 for(const [width,height]of viewports){
  const layout=siteLayout(width,height);assert.equal(layout.facilities.length,7);
  assert.deepEqual(layout.facilities[2],layout.facilities[4]);assert.deepEqual(layout.facilities[4],layout.facilities[5]);
 }
 assert.deepEqual(processes.map(p=>p.key),['generation','review','stock','submission','inspection','archive','revenue']);
});
