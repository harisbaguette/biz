# 세로 모바일 게임 재설계 독립 심사

2026-10-22 · 검수자: Benan · 규모 L

**최종 판정: BENAN_COMPLETE · 검증 범위 승인. CODE·게임 UI/운영 흐름 9.06/10, COMMERCIAL.** 이번 심사의 즉시·조속 결함은 모두 수정 확인했다. 기본 게임 흐름, 실제 관측과 지시의 구분, 문제 원인, 모바일 큰 글자에서 선택 시설 보존까지 통과했다. 보고서의 발견 표 13행은 모두 처방 확인을 마쳤다.

승인 범위는 세계 중심의 시설 선택·운영 판단·상세 진입/복귀, 실제 데이터 의미, 검증한 반응형 화면과 입력이다. **상용 산업게임급 재미·실기기 품질·실배포 완료를 인증하는 점수는 아니다.** 최종 독립 재검수는 고정된 4341 빌드 `index-DPX99-yo.js` / `World-Djlo5Hk7.js` / `index-BqdJKKt4.css`에서 시행했다.

이 문서는 사용자에게 거부된 이전 SaaS 화면의 9.1점과 승인을 사용하지 않는다. 이번 세계 중심 구조와 실제 작업 흐름을 새로 평가한다. 장기 재미·실제 기기의 엄지 감각·발열·배터리를 자동 시험으로 입증했다고 주장하지 않는다.

## 범위

주 검토 파일은 21개 중 21개다. 화면·상태·공용 부품·브랜드·에셋 기록을 포함한다.

| 영역 | 직접 검토한 파일 |
|---|---|
| 게임 진입·배치·상태 | `src/App.tsx`, `src/style.css`, `src/game-state.ts` |
| Three.js·입력·시설 | `src/world/World.tsx`, `World.css`, `layout.ts`, `processFacilities.ts` |
| 실제 DS 연결 | `src/ui/Primitives.tsx`, `src/ui/Icons.tsx`, `src/design-system/README.md`, `components.ts`, `adapter.css`, `index.css`, `root-tokens.css` |
| 목적·조작·브랜드 기록 | `docs/mobile-game-direction.md`, `docs/mobile-game-gamer-review.md`, `docs/BRAND.md`, `ASSETS.md` |
| 앱 메타데이터·표식 | `index.html`, `public/brand/symbol.svg`, `public/favicon.svg` |

추가로 `src/data.ts`, `src/types.ts`, `src/ui/Panels.tsx`, `tests/game-state.test.mjs`의 관련 상태·연결부를 읽었다. 긴 업무 패널 전체, 서버 인증·권한·원본 자동화는 새로 전수 감사하지 않았다. 패널 저장 회귀와 브라우저 범용성은 별도 QA의 이번 빌드 증거를 재사용한다. 과거 제품의 E2E 결과는 이번 제품 합격 수로 합산하지 않는다.

지정 DS는 상위 폴더의 옛 카탈로그가 아닌 `/Volumes/public/디자인시스템/실행관리(Ops-Run)`의 **main 0.8.0 / Trial**이다. 해당 README와 `문서/메인 스타일 명세.md`를 직접 대조했다. 원본 파일 91개의 내용 일치는 `npm run design:check`로 확인했다. 원본 91개 일치가 소비 화면의 배치까지 옳다는 증거는 아니므로 실물을 별도로 봤다.

## 목적 대조

현재 화면은 네 지구 → 건물 → 접근 카메라 → 현장 트레이 → 실제 관측 변화로 이어진다. 화면 중앙에 세계를 놓고 별도 홈페이지·대시보드를 먼저 읽게 하지 않는다. 13개 계정을 한 화면에 표찰 17개로 압축하는 대신 네 지구에 4/3/3/3개로 나눈다. 재고·일정·계정·기록의 긴 목록과 입력 폼은 상세 도구로 남는다.

건물에 실제 재고의 목표 대비 상자가 보이고, 정상·문제·미관측은 표찰·상태등·이름으로 드러난다. 확인할 일에서 실제 문제 시설로 접근할 수 있다. 지시 접수를 실적 증가나 계정 확인 성공으로 바꾸지 않는다. 세계가 실제 작업의 대상을 고르고, 문제를 찾아 행동하는 장소라는 점은 이전 구조와 실질적으로 달라졌다.

다만 장기적인 동기는 실제 사업의 진척에 의존한다. 접속만으로 재화·성공·긴급 임무를 만들어 재미를 증명하지 않는다. 상용 경영게임과 같은 재방문 의욕이나 사용자의 만족은 이 시험의 합격 범위에 포함하지 않는다.

## 발견 사항 전체

현재 제품 수정은 주 작업자·세계 작업자가 맡았다. 심사자는 격리 반례와 재검증만 수행했다.

| ID·심각도 | 반례·근거 | 처방과 확인 |
|---|---|---|
| B-M01 🔴 해결 | 검수 lane이 idle이고 metadata만 storage_wait이면 세계 경고와 현장 트레이의 ‘대기’가 모순. `metadata-review.png`, `metadata-home.png` | `src/game-state.ts:5`의 `processState()`를 App·World·지구 배지에서 공유. `metadata-home-fixed.png`, `metadata-review-fixed.png`에서 저장 공간 부족과 지구 경고 일치 |
| B-M02 🔴 해결 | command applied, 이후 lastVerifiedAt 없음에도 접수 표시가 사라짐. `applied-no-observation.png` | `src/game-state.ts:20`의 `commandObservation()`으로 지시 대기/반영 후 확인 대기/후속 확인 성공/실패 구별. `recheck.json`의 대기·성공·실패 장면에서 확인. 재확인은 반영 후 미관측 상태에서 복구 경로로 허용하며 수치는 임의 증가하지 않음 |
| B-M02 보충 🔴 해결 | login_required + applied 미관측이면 World 회색 대기와 aria가 기존 로그인 문제를 가림. `issue-and-wait-fixed.png` | `src/world/World.tsx:36`, `:160`, `:173`에서 기존 문제 우선, 대기점 병존, 두 상태 이름 제공. 최종 `final-issue-wait-home.png`·`final-issue-wait-selected.png`: warning + 자물쇠 + 대기점 + ‘로그인 필요 · 지시 반영 · 확인 대기’ |
| B-M03 🟡 해결 | review idle + metadata working이면 label은 ‘대기’인데 active=true로 움직임 | `src/game-state.ts:10`에서 메타데이터 실행을 선택하고 선택한 tone으로 active 결정. 독립 `node --test tests/game-state.test.mjs` 3/3 통과 |
| B-M04 🟡 해결 | HUD·상태·지구 이름 9–11px가 지정 DS 보조 글자 12px보다 작았음 | `src/style.css:25`의 rem 글자 척도, HUD·상태는 12px 기준. `recheck.json`의 실제 computed font와 캡처 확인 |
| B-M05 🟡 해결 | stale에서 마지막 성공 수신 시각이 주 화면에 없어 오래된 세계를 언제 것으로 봐야 할지 모름 | `src/App.tsx:164`, `:175`, `:179`에서 마지막 수신 시각 제공. `small-stale-fixed.png`에서 시각·재확인 비활성 확인 |
| B-M06 🟡 해결 | 현재 지구만 맞추는 버튼이 전체 단지 보기로 안내됨 | `src/App.tsx:166` ‘현재 지구 보기’. 실제 카메라 범위와 이름 일치 |
| B-M07 🟡 해결 | 360×640 글자 200%에서 자원 문구 넘침, 트레이 확장 후 선택 시설 가림, 준비 전 확대 시 축약 규칙 미적용 | `src/App.tsx:77`에서 실제 너비/root 글자 크기로 compact-text를 판정하고 HUD·트레이 실측. `src/style.css:29`와 `src/world/World.tsx:129`에서 축약·옥상 초점 적용. rem→em 변경만으로는 해결되지 않아 채택하지 않음. 최종 `measured-accessibility-{before,after}-ready.json` 전후4/4 통과: 보조24px 유지, 자원 넘침0, 선택01 hit1, 행동3개≥44px. 원래 가림 반례는 `large-selected-before-safe-area.png`와 `final.json`에 보존 |
| G-M01 🔴 해결·게이머 발견 | 실제 Canvas 02/12 건물 터치가 공정으로 오선택됨. DOM 표찰 성공만으로는 발견 불가 | 실제 좌표의 표찰 경계 검사와 보이는 건물 우선 선택, 옥상 표찰 배치. 게이머의 독립 `mesh-touch.json` 26/26 성공, JS 오류0 재사용 |
| G-M02 🔴 해결·게이머 발견 | 선택 후 오른쪽 도구 열이 다른 계정 표찰을 가림 | 선택 중 도구 열 제거. 게이머 최종 계정 표찰61/61 중앙 히트, 자체 선택 화면에서도 가림 해소 확인 |
| G-M03 🔴 해결·게이머 발견 | 팬 뒤 하단 ‘기록’ 영역이 04 표찰을 가림 | 해당 상시 영역 제거, 기록은 섬 메뉴로 이동. 게이머 두 폭 팬 뒤 가림0 증거 재사용 |
| B-M08 🟢 해결·문서 | 방향 문서에 옛 토큰 정본 경로와 구현에 없는 +/−·Home 단축키 약속이 남음 | 방향 문서의 정본 경로와 실제 Tab·Enter 확대/복귀 버튼 조작으로 수정 확인. 제품 행동 경로도 보존됨 |
| B-M09 🟢 해결·정리 | 수정 전 `src/style.css`에 DOM에서 제거된 game-world-note·district-nav-heading 스타일 잔존 | 주 작업자가 미사용 선언8개 제거. 독립 `rg -n 'game-world-note|district-nav-heading' src` 결과0 확인. 실효 화면 변화 없음 |

## 실제 실행과 증거

브라우저는 headless Chromium 1개만 사용했다. `/api/**`를 전부 브라우저 메모리 fixture로 응답하고 썸네일은 생략했다. 최초 접수 장면의 쓰기 1회도 mock 응답이다. 원본 사업 API·DB·제작·제출·로그인·일정에는 쓰지 않았다. 검수 브라우저는 모두 닫았다.

| 묶음 | 실제 수와 출력 | 범위 |
|---|---|---|
| 최초 반례·기본 흐름 | 16개 중16개 캡처·직접 확인 | 390·360 홈/시설/확인/접수/메타데이터/상세 복귀/공정/단절. 첫 실행은 중복 이름 selector로 7장 뒤 중단했고 나머지9장을 별도 완주. `result.json`과 `remaining.json`에 그대로 보존 |
| 수정 후 독립 재현 | 10개 중10개 캡처·직접 확인, JavaScript 오류0 | `recheck.json`. metadata 문제/반영 미관측/실제 확인/문제 병존/명령 실패/짧은 세로 단절/큰 글자/로그인. 스크립트 passed가 남은 시각 결함까지 없다는 뜻은 아님 |
| 병존·큰 글자 반례 | 4개 중4개 캡처·직접 확인, 오류0·업무 쓰기0 | `final.json`. 병존2장 통과, 큰 글자 선택 가림으로 전체 passed 미부여. 실패 기록은 그대로 보존 |
| 최종 큰 글자·초기화 순서 | 4개 중4개 캡처·직접 확인, 검사4개 통과 | `measured-accessibility-before-ready.json`·`measured-accessibility-after-ready.json` 모두 passed:true. 준비 전·후 각 홈/선택2장, JavaScript 오류0·차단 업무 쓰기0 |
| 공유 상태 단위 | 3개 중3개 | `node --test tests/game-state.test.mjs`: tests3, pass3, fail0 |
| 실제 DS 원문 | 91개 중91개 | `npm run design:check`: `Pattove main: 91/91 originals verified; 10 component registries; 47 illustration IDs` |

주요 검수 묶음은 총34장 중34장을 직접 봤다. 이 수에는 수정 전 실패 증거도 포함된다. 초기 공유4장과 중간 진단 반복 장면을 최종 성공 장면 수에 더하지 않는다.

중단·실패도 숨기지 않았다. 중복 이름 selector, 인라인 아이콘 URL에 `/lock/i`를 찾은 관측기, 분기 밖 state 변수의 관측기 오류는 각각 보존 후 고쳤다. `final-observer-failure.json`·`accessibility-observer-failure.json`은 제품 결함과 구분한다. 빌드 중 파일이 교체되어 HTML/CSS 참조가 어긋난 실행은 재시작한 고정 빌드로 확인했다. 고정 뒤에도 남았던 초기 글자 확대의 query 미적용은 실제 제품 반례였으며 `accessibility-before-ready.json`에 보존했다. `query-diagnostic.json`은 일부 HUD assertion을 건너뛴 원인 진단이고 acceptancePassed:false이므로 합격 수에 사용하지 않는다. 마지막 승인에는 assertion을 모두 적용한 measured 두 결과만 사용했다.

### 재사용한 다른 전문 검증

| 증거 | 유효 범위·수치 |
|---|---|
| `artifacts/mobile-game/gamer/result.json` | 최종56/56 장면, 오류0·문서 가로넘침0. 지구34/34·계정61/61·공정31/31 히트. 예전 노출 수83·20과 합산하지 않음 |
| `gamer/gestures.json` | 실제 CDP 팬40회·핀치40회, 오선택·업무 쓰기0. 두 폭 빈 땅 해제·회전 잠금 |
| `gamer/state-loop.json` | 두 폭 접수→실제 후속 스냅샷→단절 루프. 접수 직후341·11 유지, 관측 fixture 뒤441·111과 실제 상자 변화. applied 후 관측 없음은 이 심사 별도 반례로 보완 |
| `gamer/mesh-touch.json` | 실제 Canvas 건물26/26 직접 터치, 전부 정확한 계정 선택. 표찰 클릭 검사를 대체한 별도 실검증 |
| `artifacts/mobile-game/qa/final-run.log` | 고정4341 Chromium 전체30/30, WebKit 대상10/10. 360·375·390·768세로·1440·844가로, 포커스 복귀, 실행 전200%, PWA MIME, 격리 DB 업무 회귀. WebKit 전체30건을 재실행했다고 주장하지 않음 |
| `artifacts/game-assets-v2/render-audit.json` | 에셋 담당의 GLB30/30 로드·렌더, 오류0·접지30/30. 이 심사자가 모델30개를 별도 렌더한 것은 아님 |
| `artifacts/brand/verification.json` | 브랜드 담당의25파일·SVG/PNG/ICO/manifest 확인. 이 심사자는 실제 로그인·HUD·심벌·favicon 연결을 직접 확인 |

게이머의38장과 QA의14장 전체를 이 심사자가 다시 봤다고 주장하지 않는다. QA가 처음 안내한 `artifacts/verification/e2e-{chromium,webkit}.json`은 실제로10/21 이전판12/36건임을 확인하여 배제했다. QA가 이번 실행 도구 stdout을 순서대로 보존한 `final-run.log` 65줄 전체와 정정한 요약을 읽고 새30/10건의 증거로 사용했다. 시험을 추가 반복해 수를 부풀리지 않았다. 라이선스·출처·용량은 `ASSETS.md`의 실제 파일 및 원문 고지와 에셋 담당 증거를 재사용했다. 이번 화면의 유색 작업동·도로·조경·상자는 한 작가의 팩으로 연결되고, 옛 회색 공장 반복과 섞인 인상은 해소됐다. 전용 AAA 아트를 제작한 것으로 평가하지 않는다.

## 공격 시나리오 5개

1. **반복 조작·실수:** queued 또는 stale에서 재확인을 반복하려 해도 비활성이다. 실제 지시는 대상과 동작을 확인하는 모달을 거친다. applied 미관측의 재확인은 영구 대기를 피할 복구 경로로 남는다. 서버 권한 우회는 이번 검수에 포함하지 않았다.
2. **장애:** metadata storage_wait, command failed, applied 미관측, 오래된 수신을 주입했다. 원인이 시설·트레이에서 유지되고 성공으로 둔갑하지 않는다. 큰 글자 선택 가림과 준비 전 확대의 축약 규칙 미적용까지 최종4장으로 수정 확인했다.
3. **실패를 가정한 세 원인:** 접수를 성공으로 오인, 건물 오선택, 상세를 닫으면 현장을 잃음. 상태 관측 분리, Canvas 실터치26건, 자체 상세→복귀 장면으로 각각 방어를 확인했다. 반복 사용 의욕 상실은 아직 실제 사용자 관찰이 없다.
4. **규모 증가:** 현재13계정과4공정, 지구당3–4개 시설을 검사했다. 모델23종 로드와 제한된 동시 표찰 구조는 확인했다. 계정·이력10배/100배, 새 사업 추가를 부하 시험했다고 주장하지 않는다.
5. **처음 사용하는 사람:** 네 지구에서 지정 시설까지 두 번의 선택 입력으로 접근하고, 세계→현장 행동→상세→같은 현장 복귀가 가능하다. 이는 입력 경로의 증거이며 사람이10초 안에 이해하거나3분 안에 다시 방문하고 싶어 한다는 증거는 아니다.

## 채점과 수용 기준

이 점수는 이번 초기 프로토타입과 수정 후의 CODE·게임 UI/운영 흐름을 같은 기준으로 비교한 값이다. 이전 제품 점수를 출발점으로 쓰지 않았다. 장기 재미는 점수로 추정하지 않았다.

| 기준 | 가중치 | 이번 수정 전 | 수정 후 |
|---|---:|---:|---:|
| 세계 중심 주 흐름 | 12 | 8.5 | 9.0 |
| 13계정 탐색·공간 기억 | 12 | 9.0 | 9.2 |
| 실제 업무 행동·상세 연속성 | 10 | 8.0 | 8.9 |
| 수치·지시·관측의 진실성 | 18 | 6.0 | 9.4 |
| 문제 인지·오류 복구 | 10 | 6.5 | 9.1 |
| 실제 터치·카메라·가림 방지 | 10 | 7.0 | 9.0 |
| 짧은 세로·큰 글자 대응 | 8 | 6.5 | 8.9 |
| 지정 DS 실제 사용·UI 일관성 | 8 | 8.0 | 9.0 |
| 장면·에셋·브랜드 편집 | 6 | 8.8 | 8.8 |
| 증거·문서·변경 경계 | 6 | 8.0 | 8.8 |

Python 계산: 가중치100, 수정 전7.498→**7.50 REJECT**, 수정 후9.064→**9.06 COMMERCIAL**. 값과 검토 파일21개 해시는 `artifacts/mobile-game/benan/review-evidence.json`에 있다. 장면 편집 점수를 기능 결함 수정만으로 올리지 않았고, 실제 기기·장기 몰입 미확인을 높은 점수로 덮지 않았다.

수용 기준10개 중 검증 가능한9개는 수용했다: 세계 중심, 13계정 접근, 4공정 연결, 재고·일정 상세 진입/복귀, 접수/반영/확인 구분, 오류 원인·복구, 터치 선택/팬/핀치, 큰 글자·반응형 배치, 실제 DS·브랜드 연결. 나머지1개인 ‘사람이 계속 운영하고 싶어 하는가’는 미확인이다. 따라서 승인은 이9개의 실제 검증 범위에 한정한다. 남은 코드 결함 백로그는 없으며, 아래 관찰·배포 경계는 미검증으로 유지한다.

## 남는 검증 경계

- 실기기 Android/iPhone/iPad의 엄지 조작, 키보드·OS 글자 확대의 실제 조합, GPU·발열·배터리·저전력 장시간 실행.
- 사람의 첫 사용 이해 시간, 세션 반복·재방문 동기, 사용자가 요구한 상용 산업게임급 만족도.
- 모든 실제 계정의 원격 재확인·로그인·제출을 새 UI에서 실행한 결과. 원본 업무를 시험 목적으로 변경하지 않았다.
- 이번 최종 소스의 실제 도메인 배포 후 연결·썸네일·브라우저 검증은 주 작업자의 배포 증거가 필요하다.

주요 재현 명령:

```sh
node artifacts/mobile-game/benan/check.mjs
BIZ_BENAN_REMAINING=1 node artifacts/mobile-game/benan/check.mjs
node artifacts/mobile-game/benan/recheck.mjs
BIZ_BENAN_ORIGIN=http://127.0.0.1:4341 BIZ_BENAN_RUN=measured BIZ_BENAN_LARGE_ONLY=1 node artifacts/mobile-game/benan/final.mjs
BIZ_BENAN_ORIGIN=http://127.0.0.1:4341 BIZ_BENAN_RUN=measured BIZ_BENAN_LARGE_ONLY=1 BIZ_BENAN_FONT_AFTER_READY=1 node artifacts/mobile-game/benan/final.mjs
node --test tests/game-state.test.mjs
npm run design:check
```

원본 출력: 상태 단위 `tests 3 / pass 3 / fail 0`; 최종 전후 각각 `{"passed":true,"planned":2,"screens":2,"checks":2,"errors":[],"writes":0}`. CODEX codenav는 실행 권한이 없어 `python3 /Users/kh/.local/bin/codenav outline …`로 읽었고 TSX의 심볼 없음은 필요한 줄 범위 직접 읽기로 보완했다.

수정 파일: 이 보고서와 `artifacts/mobile-game/benan/`의 격리 검수 스크립트·JSON·캡처. 제품 코드는 수정하지 않았다.
