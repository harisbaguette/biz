# 계정 작업소 기술 검토

현재 판정: **기술 검토 완료 — 확인한 결함 3개 중 3개 수정 확인, 남은 중요 결함 0개**. 새로 구현된 코드만 검토했으며 이전 승인은 사용하지 않았다. 제품 수정은 0개다. 이는 아래 코드·반례 범위의 판정이며 제품 전체 출시 승인은 아니다.

검토 대상 `World.tsx`, `layout.ts`, `processFacilities.ts`, `World.css`, `owner-cycle.ts` **5개 중 5개**를 읽고 호출 관계인 App의 선택·반응형 흐름과 기존 계정 상태 계산을 대조했다. 요구 대조에서 맡은 범위의 누락·임의 확장은 확인하지 못했다. 아래는 이번 구현에서 직접 확인해 수정으로 연결한 결함이다.

## 후보 3의 재검증

검증 대상은 `http://127.0.0.1:4352`, `World-sULiLDdu.js`, `index-DcZJ7elE.js`다. 검토한 파일 **5개 중 5개**의 SHA-256이 고정된 [후보 3 기록](../../artifacts/owner-cycle/candidate3.json)과 일치했다. [소스 대조 결과](../../artifacts/owner-cycle-three/final-source-check.json)

| 결함 | 같은 반례의 수정 후 결과 |
|---|---|
| OC-T01 | 이미지 첫 요청만 503이면 페이지 reload 없이 2번째 요청으로 복구. 계속 503이면 초기 요청+자동 3회, 총 4회에서 정지. 1.25초 추가 대기 중 증가 없음. 화면의 44×44 복구 버튼을 실제 클릭하자 5번째 요청이 성공하고 실패 목록·시도 목록이 비워짐. textures 24→25, cache 21→22 복원. |
| OC-T02 | 390×844에서 13번 선택 후 400×844→390×844에서 zoom=2.35·selected=13·13번 명판 가시성 유지. 선택 닫기 후 zoom=1, selected=null, 13개 명판 모두 가시. |
| OC-T03 | 실제 builder·merge 함수의 격리 재실행에서 숨긴 공용 바늘의 가시 Mesh는 병합 전후 0/0 유지. |

브라우저 반례 **3개 중 3개**(일시 이미지 실패, 지속 이미지 실패·수동 복구, 선택 resize·닫기)와 정적 시계 반례 **1개 중 1개**를 통과했다. [실행 JSON](../../artifacts/owner-cycle-three/repair-recheck.json), [실행 스크립트](../../artifacts/owner-cycle-three/repair-recheck.mjs), [복구 버튼 화면](../../artifacts/owner-cycle-three/thumbnail-retry-visible.png), [정적 시계 결과](../../artifacts/owner-cycle-three/hidden-static-clock-after.json). JS 오류 0, 차단이 필요한 실제 업무 쓰기 시도 0. 사용한 독립 Chromium 브라우저는 종료했다.

## 초기에 확인한 결함 3건 — 모두 수정 확인

### OC-T01 · P2 · 이미지 1회의 일시 실패가 관측 갱신으로 복구되지 않는다

- 경로: `src/world/World.tsx:84`의 `picture()`, `:94`의 같은 candidate 건너뛰기, `:103`의 인쇄기 candidate 건너뛰기.
- 조건: 처음 불러오는 작품 이미지 1개만 503 응답한 뒤 네트워크를 정상화한다.
- 재현: candidate 4351의 독립 headless 컨텍스트에서 새 `observedAt`를 포함한 관측을 3회 갱신해도 해당 이미지 요청은 총 1회, 실패 목록 유지, textures 24·cache 21로 유지됐다. 전체 **페이지 reload** 후에는 2번째 요청이 성공해 실패 목록 0, textures 25·cache 22가 됐다. 관측 refresh와 페이지 reload는 다른 결과다.
- 영향: 같은 후보 그림을 유지하는 동안 실제 그림이 계속 빠지지만 이미지 전용 실패·재시도 안내가 없다. 모델 6개는 정상이므로 모델 재받기 버튼도 나타나지 않는다.
- 최소 개선: 같은 후보의 실패를 영구 캐시하지 말고 유한 재시도·명시적 복구를 제공한다. 성공 시 실패 목록을 제거한다.
- 근거: [thumbnail-recovery.json](../../artifacts/owner-cycle-three/thumbnail-recovery.json), 같은 폴더 재현 스크립트. 운영 POST 0, `pageerror` 0.

### OC-T02 · P2 · 선택한 계정이 같은 모드의 resize 뒤 화면에서 사라진다

- 경로: `src/world/World.tsx:227`의 무조건 `fit(true)` 및 `:217`의 안전 영역 값이 바뀔 때만 focus 복원.
- 조건: 390×844에서 13번을 선택하고 400×844로 바꾼 뒤 390×844로 돌아온다. 두 화면 모두 같은 portrait 모드다.
- 재현: 선택 직후 zoom=2.35, visible=[10,13]. 너비 왕복 후 zoom=1, selected=13·13번 트레이는 유지되지만 visible=[1..12]가 되어 정작 13번 표식이 사라졌다.
- 영향: 선택 상태와 지도 초점이 분리돼 선택한 계정을 보면서 관리하는 계약이 깨진다.
- 최소 개선: resize에서 선택 계정이 있으면 새 안전 영역 계산 뒤 그 계정의 focus를 복원한다. 선택을 닫을 때 전체 13개 전경으로 돌아가는 경로를 유지한다.
- 근거: [selected-resize.json](../../artifacts/owner-cycle-three/selected-resize.json). 운영 POST 0.

### OC-T03 · P2 · 숨긴 공용 시계 바늘이 정적 병합 뒤 다시 보인다

- 경로: `src/world/processFacilities.ts:97`의 `buildSubmissionClock()` 및 `src/world/World.tsx:108`의 `mergeAndInstance()`.
- 조건: 공용 제출 설정 시계의 `hour-hand`·`minute-hand` Group을 숨긴 뒤 정적 geometry 병합을 한다. 공용 시계 holder는 dynamic이 아니다.
- 재현: 실제 builder와 실제 merge 함수를 Three.js 격리 실행에 사용했다. 숨긴 바늘의 가시 Mesh는 병합 전 0/0, 병합 후 1/1이었다. 원래 Group의 visible은 계속 false지만 병합 결과가 Scene 직속의 visible Mesh가 되었다.
- 영향: 확정 실행 시각을 표시하지 않으려고 숨긴 바늘이 기본 모형의 시각으로 다시 나타난다.
- 최소 개선: 정적 병합에서 숨겨진 조상을 가진 Mesh를 제외하거나 이 시계도 가시성 계약이 보존되는 동적 경로로 처리한다.
- 근거: 초기 격리 실행에서 위의 0/0→1/1을 확인했다. [재현 스크립트](../../artifacts/owner-cycle-three/hidden-static-clock.mjs)는 실제 builder와 실제 merge 함수를 사용한다. 숨긴 조상을 제외하는 후속 수정 뒤 같은 스크립트의 [재실행 결과](../../artifacts/owner-cycle-three/hidden-static-clock-after.json)는 0/0→0/0이다. 최종 화면 픽셀 비교는 하지 않았다. **계정별 dynamic 시계의 Group 조상 가시성은 정상**이며 이 지적과 구분한다.

## 유효한 확인과 범위

- 후보 3 소스에서 `node node_modules/typescript/bin/tsc --noEmit --pretty false`: 종료 코드 0.
- 후보 3 소스에서 `node --test tests/owner-cycle.test.mjs`: **12개 중 12개 통과**. 심사·제출 계획·재확인 요청·관측 끊김의 데이터 구분과 수동 계획 병존은 이 범위에서 유지됐다.
- 제공된 `artifacts/owner-cycle-world/resource-check.json`을 재사용했다. 동일 상태 15회 관측 동안 geometries 266·textures 25·bindings 39·cache 22가 유지됐고 이미지 22개가 각각 한 번 요청됐다. 이 결과는 동일 상태 반복의 안정성 근거이며 이미지 실패·계속 바뀌는 새 이미지·장시간 물리 기기의 메모리 보증으로 확대하지 않는다.
- 인스턴스 갱신이 dynamic root까지의 조상 visible을 확인하는 경로를 직접 읽었다. 따라서 계정별 시계 손·재고·심사·보관 그룹의 숨김을 모두 결함으로 취급하지 않았다.
- 모든 자체 브라우저 검증은 headless, API GET만 허용하고 실제 업무 POST는 차단했다. 사용한 브라우저는 종료했다. 실기기 발열·배터리·장시간 메모리 변화는 미검증이다.

이미지 실패 복구의 자체 브라우저 검증은 Chromium에 한정한다. WebKit·실제 iOS에서 이 실패 주입을 별도 실행하지 않았으며, 다른 담당자의 기능 검증을 이 결과로 대신하지 않는다.
