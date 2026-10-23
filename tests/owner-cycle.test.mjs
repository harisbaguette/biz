import test from 'node:test';
import assert from 'node:assert/strict';
import { accountCycle, cycleTime } from '../src/owner-cycle.ts';
import { nextSubmission } from '../src/data.ts';

const now = Date.parse('2026-10-23T19:54:00+09:00');
const account = (v = {}) => ({ id:'1',number:1,ready:50,target:240,bound:true,status:'review_scheduled',message:'',running:false,
  reviewOn:'2026-10-26',nextCheckAt:'2026-10-24T09:30:00+09:00',capacity:null,counts:{submitted:900},...v });
function world(a, pending = 20) { return { accounts:[a],assets:Array.from({length:pending},(_,i)=>({id:String(i),accountId:a.id,state:'submitted',updatedAt:'2026-10-23T09:00:00Z'})),calendar:[],automation:{enabled:true,productionEnabled:true,lastPollAt:new Date().toISOString(),nextAt:'2026-10-23T20:00:00+09:00',lanes:{}} }; }
test('전경에는 현재 심사와 다음 확인을 동시에 표시하고 전역 순회시각을 제출예약으로 쓰지 않는다', () => {
 const a=account(), c=accountCycle(a,world(a),false,{now});
 assert.equal(c.reviewLabel,'심사 20'); assert.equal(c.submissionLabel,'제출은 심사 후');
 assert.equal(c.nextLabel,'확인 내일 09:30'); assert.equal(c.nextKind,'review-check');
 assert.equal(c.submissionReservation,null); assert.equal(c.submissionPlanOn,null);
 assert.match(c.expectedReviewLabel,/예상/);
 assert.equal(c.overviewLabel,'결과 10/26 예상');
});
test('현재1·13번처럼 심사는 비고 제출은 막힌 경우 과거 심사예상일 대신 재시도시각을 드러낸다',()=>{
 const a=account({status:'blocked',message:'브라우저 로그인 확인',nextCheckAt:'2026-10-23T23:11:00+09:00'});
 const c=accountCycle(a,world(a,0),false,{now});
 assert.equal(c.reviewLabel,'심사 비었음'); assert.equal(c.submissionLabel,'제출 막힘');
 assert.equal(c.nextLabel,'재시도 23:11'); assert.equal(c.expectedReviewLabel,null);
 assert.equal(c.tone,'blocked'); assert.equal(c.action,'account'); assert.match(c.detail,/브라우저/);
});
test('심사 중이어도 막힘과 재시도는 별도로 보존한다',()=>{
 const a=account({status:'blocked',message:'확인 실패',nextCheckAt:'2026-10-23T20:34:00+09:00'}),c=accountCycle(a,world(a),false,{now});
 assert.equal(c.reviewLabel,'심사 20');assert.equal(c.submissionLabel,'제출 막힘');assert.equal(c.nextLabel,'재시도 20:34');
});
test('서로 다른 실제 실패를 모두 로그인 문제로 축약하지 않는다',()=>{
 for (const [message,label,overview] of [
  ['현재 계정의 새 CSV 다운로드를 확인하지 못했습니다.','제출 결과 확인 실패','결과 확인 실패'],
  ['한국어 표시로 전환할 언어 항목을 확인하지 못했습니다.','브라우저 언어 전환 실패','언어 전환 실패'],
  ['현재 로그인 이메일이 대상 계정과 다릅니다.','다른 계정으로 로그인됨','로그인 계정 다름'],
 ]) {
  const a=account({status:'blocked',message}),c=accountCycle(a,world(a,0),false,{now});assert.equal(c.blocker,label);assert.equal(c.overviewLabel,overview);
 }
 const unknown=account({status:'blocked',message:'처음 보는 구체적 실패'});
 assert.equal(accountCycle(unknown,world(unknown,0),false,{now}).blocker,'처음 보는 구체적 실패');
});
test('날짜 계획은 계획으로, 실제 확인요청 예약은 요청으로 구별하고 메모는 실행으로 취급하지 않는다',()=>{
 const a=account(),s=world(a);
 s.calendar=[{id:'1',accountId:'1',uploaded_on:'2026-10-22',next_upload_on:'2026-10-28'}];
 const schedules=[{id:'memo',account_id:'1',kind:'memo',status:'planned',due_at:'2026-10-23T20:00:00+09:00'}, {id:'request',account_id:'1',kind:'recheck',status:'planned',due_at:'2026-10-23T22:00:00+09:00'}];
 const c=accountCycle(a,s,false,{now,schedules});
 assert.equal(c.submissionLabel,'제출 계획 10/28');assert.equal(c.nextLabel,'요청 22:00');assert.equal(c.nextKind,'request');assert.equal(c.submissionReservation,null);
 assert.equal(c.overviewLabel,'결과 10/26 예상');assert.equal(c.overviewPlanLabel,'계획 10/28');
 assert.match(c.detail,/실행 예약이 아닙니다/);assert.match(c.detail,/대기열에 등록/);
});
test('원본의 자격·메타데이터·연결 오류를 같은 제출 막힘으로 덮지 않는다',()=>{
 for(const [state,label]of [
  ['eligibility_required','제출 자격 확인'],['metadata_required','메타데이터 확인'],
  ['search_review_required','검색 검토 필요'],['reconciliation_required','결과 대조 필요'],
  ['login_required','로그인 필요'],['worker_unconfirmed','진행 확인 필요'],
 ]){
  const a=account({status:state,message:''}),c=accountCycle(a,world(a,0),false,{now});
  assert.equal(c.overviewLabel,label);assert.equal(c.blocked,true);
 }
 const unbound=account({bound:false,message:''});
 assert.equal(accountCycle(unbound,world(unbound,0),false,{now}).overviewLabel,'계정 연결 확인');
 const long=account({status:'metadata_required',message:'메타데이터의 필수 항목을 검증하는 중에 구체적인 오류가 발생했습니다.'});
 const c=accountCycle(long,world(long,0),false,{now});
 assert.equal(c.overviewLabel,'메타데이터 확인');assert.equal(c.blocker,long.message);
});
test('수동 제출 계획은 구체 오류·실행 감지·자동화 정지와 서로 덮어쓰지 않는다',()=>{
 const cases=[
  {values:{status:'blocked',message:'현재 로그인 이메일이 대상 계정과 다릅니다.'},enabled:true,overview:'로그인 계정 다름',next:'재시도 내일 09:30'},
  {values:{status:'blocked',message:'현재 계정의 새 CSV 다운로드를 확인하지 못했습니다.'},enabled:true,overview:'결과 확인 실패',next:'재시도 내일 09:30'},
  {values:{running:true},enabled:true,overview:'실행 확인 중',next:'확인 내일 09:30'},
  {values:{},enabled:false,overview:'자동 제출 정지',next:'재개 필요'},
 ];
 for(const {values,enabled,overview,next}of cases){
  const a=account(values),s=world(a);s.automation.enabled=enabled;
  s.calendar=[{id:'plan',accountId:'1',uploaded_on:'2026-10-22',next_upload_on:'2026-10-28'}];
  const c=accountCycle(a,s,false,{now});
  assert.equal(c.reviewLabel,'심사 20');assert.equal(c.overviewLabel,overview);
  assert.equal(c.overviewPlanLabel,'계획 10/28');assert.equal(c.nextLabel,next);assert.equal(c.submissionReservation,null);
 }
});
test('새 제출분이 생기면 이전 제출분의 오래된 다음계획을 끌고 오지 않는다',()=>{
 const a=account(),s=world(a);s.calendar=[{id:'old',accountId:'1',uploaded_on:'2026-10-20',next_upload_on:'2026-10-24'},{id:'new',accountId:'1',uploaded_on:'2026-10-22',next_upload_on:null}];
 assert.equal(accountCycle(a,s,false,{now}).submissionPlanOn,null);assert.equal(nextSubmission(s,'1'),null);
});
test('플랫폼심사수와추적그림수가다르면빈심사로단정하지않고대조필요로표시한다',()=>{
 const a=account({capacity:{pending:20,limit_count:20,observed_at:'2026-10-23T19:00:00+09:00'}}),c=accountCycle(a,world(a,0),false,{now});
 assert.equal(c.reviewMismatch,true);assert.equal(c.reviewLabel,'심사 수 대조');assert.equal(c.action,'account');assert.match(c.detail,/0개와.*20개/);
});
test('공개대기와재고없음도다음제출조건을다르게표시한다',()=>{
 const a=account({nextCheckAt:null}),s=world(a,0);
 assert.equal(accountCycle(a,s,false,{now}).submissionLabel,'자동 제출 대기');
 s.assets=[{id:'approved',accountId:'1',state:'approved',updatedAt:'2026-10-23'}];
 assert.equal(accountCycle(a,s,false,{now}).submissionLabel,'제출은 공개 후');
 assert.equal(accountCycle({...a,ready:0},world(a,0),false,{now}).submissionLabel,'제작물 대기');
});
test('끊긴관측은빈심사로바꾸지않고정지된자동화는예정된확인을약속하지않는다',()=>{
 const a=account(),s=world(a),stale=accountCycle(a,s,true,{now});
 assert.equal(stale.reviewCount,20);assert.equal(stale.reviewLabel,'상태 미확인');assert.equal(stale.nextLabel,'일정 미확인');
 s.automation.enabled=false; const paused=accountCycle(a,s,false,{now});
 assert.equal(paused.reviewLabel,'심사 20');assert.equal(paused.submissionLabel,'자동 제출 정지');assert.equal(paused.nextAt,null);assert.equal(paused.nextLabel,'재개 필요');
 const blocked=accountCycle({...a,status:'blocked'},s,false,{now});assert.equal(blocked.submissionLabel,'제출 막힘');assert.equal(blocked.nextLabel,'재개 필요');
});
test('예정이지나도자동출발/승인하지않고날짜에존재하지않는시간을만들지않는다',()=>{
 const a=account({nextCheckAt:'2026-10-23T18:00:00+09:00'}),c=accountCycle(a,world(a),false,{now});
 assert.equal(c.reviewCount,20);assert.equal(c.nextLabel,'확인 18:00 경과');
 const late=account({...a,reviewOn:'2026-10-21'}),past=accountCycle(late,world(late),false,{now});
 assert.equal(past.overviewLabel,'결과 예상일 경과');assert.equal(past.reviewCount,20);
 assert.equal(cycleTime('2026-10-24',now),'내일');assert.equal(cycleTime('2026-10-25',now),'10/25');
 assert.equal(cycleTime('2026-10-24T00:00:00+09:00',now),'내일 00:00');
});
test('자동화를 끄고 현재 작업을 마치는 동안 다음 자동 순회를 약속하지 않는다',()=>{
 const a=account({running:true}),s=world(a);s.automation.enabled=false;
 const c=accountCycle(a,s,false,{now});
 assert.equal(c.overviewLabel,'실행 확인 중');assert.equal(c.nextAt,null);
 assert.equal(c.nextKind,'paused');assert.equal(c.nextLabel,'재개 필요');
 const schedules=[{id:'later-request',account_id:'1',kind:'recheck',status:'planned',due_at:'2026-10-25T10:00:00+09:00'}];
 for(const running of [true,false]){
  const requested=accountCycle({...a,running},s,false,{now,schedules});
  assert.equal(requested.nextKind,'request');assert.equal(requested.nextAt,schedules[0].due_at);
  assert.equal(requested.nextLabel,'요청 10/25 10:00');assert.match(requested.detail,/대기열에 등록/);
 }
});
