# 계정 사이클 통합 QA

## 검증 범위

후보3 고정본 `http://127.0.0.1:4352` (`/tmp/biz-owner-candidate3-20261023`)에서 13계정 작업소, 계정 선택과 복귀, 심사·제출·재확인 상태, 계획과 막힘 병존, 자동화 정지·stale·수량 불일치, 수익 기록, 3D 복구, 입력 포커스와 화면 크기 회귀를 실행했다. 후보 번들은 `World-sULiLDdu.js`, `index-DcZJ7elE.js`이며 기준 해시는 [candidate3.json](../artifacts/owner-cycle/candidate3.json)에 있다.

| 주장 | 실제 결과 | 판정 |
|---|---|---|
| 모바일·태블릿·PC에서 13계정이 보이고 계정 상태를 식별할 수 있음 | Chromium과 WebKit 모두 전경, 360×640/390×844, 가로 640×360, 같은 세션 리사이즈, 1440×900 검증 통과 | 통과 |
| 심사·막힘 원인·다음 확인·제출 계획이 선택 전에 읽히며 계획은 운영 상태와 함께 남음 | 일반 13계정 화면, 원인별 막힘, 수동 계획+심사/막힘, 실행 중 계획, 정지/stale/수량 불일치 시나리오 통과 | 통과 |
| 실제 mesh 선택 후 계정 작업이 열리고 닫으면 전경으로 복귀함 | 13번 심사 영역 hit, 패널 계정/상태 확인, 닫은 뒤 13개 표찰 재노출을 확인 | 통과 |
| 장애·운영 흐름과 수익 기록이 동작함 | 금융·사업관리·예약/지시·미리보기 복구·WebGL 복구·운반 멱등성 검사 통과 | 통과 |
| 실제 200% 글자 설정에서 핵심 조작이 가능함 | 360×640에서 루트 계산 글자 크기 32px, 계정 선택, 상세 복구, 패널/예약 조작과 화면 넘침 검증 통과. 계정 표찰 자체의 px 크기를 임의로 바꾼 시험은 사용하지 않음 | 통과 |

## 실행 결과

- Chromium: 45개 중 44개 통과, 1개는 비공개 원본 전용 시험이라 건너뜀. 고유 결과는 [candidate3-chromium-02.log](../artifacts/owner-cycle/qa/candidate3-chromium-02.log), [candidate3-chromium-02.json](../artifacts/owner-cycle/qa/candidate3-chromium-02.json).
- WebKit: 45개 중 44개 통과, 1개는 같은 사유로 건너뜀. 결과는 [final-webkit.log](../artifacts/owner-cycle/qa/final-webkit.log), [final-webkit.json](../artifacts/owner-cycle/qa/final-webkit.json).
- 실제 비공개 원본 복제 시험은 별도 실행에서 Chromium 1/1, WebKit 1/1 통과했다. 시험은 원본 JSON을 읽어 테스트용 in-memory D1에 복제하고 수신 시각만 갱신한다. 실행 전후 원본 파일 SHA-256이 일치했다. 로그·결과는 `artifacts/owner-cycle/qa/private-source-{chromium,webkit}.{log,json}`에 있다. 원본 내용은 로그나 캡처에 기록하지 않았다.
- 합성 데이터만 쓴 360×640, 390×844, 1440×900 화면 캡처를 직접 확인했다: [large-text-360x640.png](../artifacts/owner-cycle/qa/large-text-360x640.png), [source-390x844.png](../artifacts/owner-cycle/qa/source-390x844.png), [source-1440x900.png](../artifacts/owner-cycle/qa/source-1440x900.png). 실제 루트 글자 설정 200% 선택 화면은 [initial-200-selected.png](../artifacts/mobile-game/qa/initial-200-selected.png)에서 확인했다.
- 실패 원인 분리를 위한 별도 스트레스 캡처 [forced-marker-fields-200pct-stress-not-user-setting.png](../artifacts/owner-cycle/qa/forced-marker-fields-200pct-stress-not-user-setting.png)와 [진단 JSON](../artifacts/owner-cycle/qa/forced-marker-fields-200pct-stress-not-user-setting.json)은 [보존한 캡처 harness](../artifacts/owner-cycle/qa/forced-marker-stress-capture.e2e.ts)로 계정 표찰 4개 필드만 CSS 강제 200%로 키운 결과다. 이 방식은 브라우저 글자 확대나 앱 설정을 재현하지 않고 셀 크기를 고정한 인공 입력이므로 사용자 설정 결함의 근거로 쓰지 않았다. 실제 루트 글자 크기 200%를 설정한 시험은 별도로 실행했고 통과했다.
- WebKit의 핀치 검증은 합성 포인터 입력으로 확대·복귀 동작을 확인한 것이다. 실제 iOS 기기의 네이티브 터치 검증으로 간주하지 않는다.
- API 쓰기 시험은 각 테스트의 격리된 in-memory D1에서 수행했다. 운영 `.local` DB에는 쓰지 않았다.
- `npx tsc --noEmit`: 통과. `npm test -- --run`: 71/71 통과. `git diff --check`: 통과. Playwright 등록: 45개/9개 파일. 프로젝트 스크립트에 mutation runner가 없어 mutation score는 N/A다.

## 시험 입력 안정성

첫 Chromium 시도는 45개 중 39개 통과, 5개 실패, 1개 skip이었다. 조사 결과 폐기된 UI 선택자, 렌더 안정화 전 한 프레임을 읽는 검사, fixture의 run-lock 조건 누락, 임의 글꼴 override, 확대 후 복귀 안정화 대기 누락이 원인이었다. 이를 실제 사용자 흐름과 설정에 맞춰 시험만 고쳤고 제품 코드는 변경하지 않았다. 이 초기 결과는 [initial-candidate3-chromium.log](../artifacts/owner-cycle/qa/initial-candidate3-chromium.log), [initial-candidate3-chromium.json](../artifacts/owner-cycle/qa/initial-candidate3-chromium.json)에 보존했다. 재확인 예약 시각은 다음 확인 시각보다 6시간 뒤로 동적으로 두어 날짜가 바뀌어도 시험 의미가 유지되게 했다. 최종 고정본 전체 실행과 실제 원본 분리 실행은 위 결과 파일을 기준으로 한다.

## 후보4 후속 확인

Benan 검토에서 발견된 실행 중 계정과 정지된 자동화의 조합을 [candidate4.json](../artifacts/owner-cycle/candidate4.json) (`http://127.0.0.1:4353`)에서 확인했다. 후보4 소스 해시 11개가 현재 코드와 일치하며 후보3 대비 `src/owner-cycle.ts`만 변경됐다. 따라서 후보3의 전체 E2E 45개 증거를 유지하고, 영향받은 `tests/owner-cycle.e2e.ts`만 후보4에서 실행했다. 이 문서는 후보4 전체 46개 실행을 주장하지 않는다.

- `tests/owner-cycle.e2e.ts`: Chromium 8/9 통과·비공개 원본 시험 1 skip, WebKit도 8/9 통과·1 skip. 전체 파일 실행 로그와 JSON은 [Chromium](../artifacts/owner-cycle/qa/candidate4-owner-cycle-chromium-final.log), [WebKit](../artifacts/owner-cycle/qa/candidate4-owner-cycle-webkit-final.log)에 있다.
- 새 반례는 정지 상태(`enabled=false`)에서 유효한 `runLockActive`, 최신 관측 시각, `running=true`를 둔다. 첫 화면에서 `실행 확인 중`과 `재개 필요`가 함께 보인다. 계정의 자동 확인 시각보다 6시간 늦은 재확인 요청을 격리 DB에 추가한 뒤, 3D 준비·13개 표찰 가시성·레이아웃 안정·실제 중앙 hit를 기다려 화면을 다시 확인하면 `실행 확인 중`은 유지되고 다음 행동은 `요청 …`으로 표시된다. 최종 타깃 시험은 Chromium과 WebKit 각각 1/1 통과했다: [Chromium 결과](../artifacts/owner-cycle/qa/candidate4-new-counterexample-chromium-02.log), [WebKit 결과](../artifacts/owner-cycle/qa/candidate4-new-counterexample-webkit.log).
- 안정화 전 로딩 화면이 찍혔던 첫 캡처는 사용하지 않는다. 최종 캡처 [정지 중 실행 감지](../artifacts/owner-cycle/qa/candidate4-stopped-running-before-recheck.png), [늦은 재확인 요청](../artifacts/owner-cycle/qa/candidate4-later-recheck-request-visible.png)를 직접 열어 3번 계정에 `실행 확인 중`과 `재개 필요`, 이후 `실행 확인 중`과 `요청 내일 …`이 맞게 보이는지 확인했다.
- 최종 단위 결과는 [final-candidate4-unit.log](../artifacts/owner-cycle/final-candidate4-unit.log) 기준 72/72 통과다. 전체 후보4 E2E 재실행은 하지 않았다.
