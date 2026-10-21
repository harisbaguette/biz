# Three.js·React 독립 재심

`REVIEW_COMPLETE` · **기술 수정 범위 승인** · 기존 10건과 추가 resize·재연결 버튼·WebKit 재로딩 반례의 수정 확인. 최종 WebKit 통합 **19/19** 통과 근거까지 확인했다. 제품 코드는 수정하지 않았다.

독립 실행한 4317 배포형은 `World-CIh3XYIR.js` 빌드다. 이후 가로 화면의 라벨 3행 공동 배치와 이격된 정상 라벨의 연결선 보강은 마지막 소스 및 제작자의 최종 18조합·306개 hit 검사 결과를 재사용했다. 이 마지막 배치 조정까지 독립 브라우저로 다시 실행했다고 주장하지 않는다. 최종 시각·게임 품질 판정은 별도 UI·게임 재심 범위다.

## 확인 범위

이전 T01~T10 **10개 중 10개**의 수정 경로를 대조했다. 소스 범위는 `src/world/World.tsx`, `src/world/layout.ts`, `src/world/World.css`, `src/App.tsx`, `src/data.ts`, `src/style.css` **6개 중 6개**이며, 추가로 `IconButton`과 설치된 Three.js·OrbitControls의 관련 계약을 확인했다.

| 기존 결함 | 수정 경로 | 재심 결과 |
|---|---|---|
| T01 World 청크 실패가 전체 앱을 지움 | `WorldBoundary`, 청크 밖 `WorldFallback`, 새 lazy·고유 URL 재시도 | 독립 Chromium 대체 관리·복귀 확인 후 발견된 WebKit 재로딩 반례까지 수정; 최종 WebKit 19/19 통과 |
| T02 라벨 중첩·다른 계정 선택 | 17개 hit rectangle을 배치하고 연결선을 보존 | 독립 9조합 모두 충돌·오입력 0; 후속 가로 배치는 제작자 최종 18조합 근거 재사용 |
| T03 세로 PC에서 전체 단지 잘림 | 양축 경계·HUD 안전 영역으로 `fit()` 계산 | 독립 900×1440 3레이어 모두 17표식 안쪽 |
| T04 WebGL 복구 후 목록에 고착 | loss 시 RAF 중지, restore 시 renderer 재생성 | 독립 실행 통과: 손실 중 RAF 0, 복구 후 17표식 |
| T05 대기 요청이 모든 새로고침을 차단 | fetch·본문 읽기에 적용되는 12초 취소 | 독립 HTTP 실행 통과 |
| T06 선택 모델 1개 실패로 전체 중단 | `Promise.allSettled`, 개별 대체 시설 | 독립 실행 통과: tree-pine 503에도 모델 19개·17표식·목록 전환 0 |
| T07 우클릭·멀티터치 오선택 | pointer ID·주 포인터·이동·취소·복수 포인터 이력 추적 | 독립 입력 함수 5/5 통과 |
| T08 가로 모바일 하단 메뉴 이탈 | `.app { min-height:0 }` 및 낮은 화면 HUD 배치 | 독립 844×390의 메뉴 하단 y=380, 화면 안쪽 |
| T09 확대가 내부 zoom만 변경 | 컨트롤러와 zoom 보간이 `dirty=true` 설정 | 독립 3비율 모두 실제 렌더 증가, zoom=1.22 |
| T10 회전 후 시설·라벨 이탈 | controls 변경 후 투영 전에 카메라 행렬 갱신 | 독립 3비율의 회전 앵커 최대 오차 0.00595px |

## 새로 찾아 전달한 반례

1. 확대·이동 뒤 같은 열 수를 유지하며 창 비율을 바꾸면 `resize()`가 카메라 frustum을 갱신하지 않아 장면이 늘어나는 경로를 찾았다. 담당자가 화면당 world units를 유지하며 네 frustum 경계를 새 크기로 갱신하도록 수정했다. 담당자 실행의 1600×1200→1000×1200 두 카메라 projection을 독립 재계산한 픽셀 가로/세로 비율은 **1.0→1.0**, 열 수는 **4→4**였다. [resize-audit.json](../../artifacts/review-2026-10-18/three-recheck/resize-audit.json).
2. `.network-error { pointer-events:none }`가 내부 “다시 연결” 버튼에도 상속되어 클릭을 막는 경로를 찾았다. 주 작업자가 버튼에 `pointer-events:auto`를 적용했다. 독립 브라우저에서 버튼 중심의 hit가 “다시 연결” 자신이고, 첫 503 후 실제 버튼 클릭으로 두 번째 요청이 성공하며 오류가 사라짐을 확인했다.

## 독립 실행 근거

`artifacts/review-2026-10-18/three-recheck/timeout.mjs`는 임시 HTTP 서버에서 200 응답 헤더와 끝나지 않은 JSON 일부만 보낸다. 수정된 `request()`는 **12,009.9ms**에 읽기를 취소하고 다음 요청에 성공했다. 응답 헤더만 늦는 경우를 흉내 낸 것이 아니라 본문 대기도 포함한 실행이다. 결과는 [timeout.json](../../artifacts/review-2026-10-18/three-recheck/timeout.json).

현재 소스의 pointer 함수를 추출한 독립 실행은 단일 주 포인터 탭 1회 선택, 우클릭·두 번째 손가락·멀리 이동 후 원위치·pointercancel 0회 선택으로 **5개 중 5개 통과**했다. 결과는 [pointers.json](../../artifacts/review-2026-10-18/three-recheck/pointers.json).

독립 브라우저 시나리오 **7개 중 7개**를 실행했다. `/api/**`는 읽은 스냅샷의 복제 응답으로 격리했고, 미리보기 GET만 통과시켰다. 운영 API 쓰기·원본 자동화 조작은 **0회**, 모든 시나리오의 `pageerror`는 **0개**였다. 사용한 브라우저는 headless Chromium이며, 종료 후 슬롯을 반환했다.

| 화면 | 확인한 레이어 | 표식 수 | 충돌 / 중심 오입력 / 화면 밖 | 확대 후 실제 추가 렌더 | 회전 앵커 최대 오차 |
|---|---|---:|---|---:|---:|
| 390×844 | 상태·재고·심사 | 각각 17개 | 각각 0 / 0 / 0 | 11회 | 0.00574px |
| 844×390 | 상태·재고·심사 | 각각 17개 | 각각 0 / 0 / 0 | 12회 | 0.00595px |
| 900×1440 | 상태·재고·심사 | 각각 17개 | 각각 0 / 0 / 0 | 6회 | 0.00508px |

나머지 4개 시나리오는 WebGL loss/restore, 선택 모델 503, 오류 재연결 버튼, World 청크 실패 및 복구다. `WEBGL_lose_context`로 실제 손실·복구를 발생시켰고 손실 중 RAF 추가 등록은 0회였다. 청크 실패에서도 계정 13개와 메뉴를 유지하고 계정 상세를 열 수 있었으며, 전송 정상화 후 “3D 다시 열기”로 복귀했다.

원본 결과: [browser.json](../../artifacts/review-2026-10-18/three-recheck/browser.json), [실행 로그](../../artifacts/review-2026-10-18/three-recheck/browser-run.log). 독립 캡처: [모바일](../../artifacts/review-2026-10-18/three-recheck/labels-390x844.png), [가로 모바일](../../artifacts/review-2026-10-18/three-recheck/labels-844x390.png), [세로 PC](../../artifacts/review-2026-10-18/three-recheck/labels-900x1440.png).

후속 가로 배치의 근거는 `artifacts/repair-world/check.json`, `artifacts/repair-world/interactions.json`, `artifacts/repair-world/844x390.png`다. 정상 라벨도 앵커에서 28px 넘게 이동하면 연결선을 유지하도록 바뀐 소스를 확인했다. 위 독립 캡처는 그 마지막 배치 전 모습이므로 최종 시각 자료로 혼동하지 않아야 한다.

최종 TypeScript `--noEmit` 검사는 종료 코드 0이었다. 검토 시점 소스 6개의 해시는 `artifacts/review-2026-10-18/three-recheck/source-manifest.json`에 남겼다.

## 판정 한계

이 재심은 기능·실패 복구·카메라·입력·기기별 화면 범위의 기술 검토다. 상용 게임급 시각 품질이나 장기간 재미를 대신 승인하지 않는다. 실제 휴대전화·태블릿의 GPU 성능·발열·배터리·장시간 메모리 증가는 미검증이다.

## 추가 WebKit 복구 변경 검토

단순 `location.reload()`로 실패한 모듈이 복구되지 않는 WebKit 반례 때문에 변경된 `src/world-loader.ts`, `src/App.tsx`, `vite.config.ts` **3개 중 3개**를 추가 검토했다. 주 작업자의 최종 WebKit 통합 결과 `expected=19`, `unexpected=0`, `flaky=0`을 원본 JSON에서 확인했다. 실행 시간은 약 30.3초였다. [원본 결과](../../artifacts/verification/e2e-webkit.json), [확인 시점 요약·해시](../../artifacts/review-2026-10-18/three-recheck/webkit-final-summary.json).

- 재시도마다 새로운 `lazy`와 에러 경계 key를 만들고, UUID query가 다른 World JS·CSS를 불러온다. 정상 첫 로드는 기존 코드 분할 경로를 유지한다.
- manifest·모듈 경로는 같은 origin의 빌드 assets로 제한한다. CSS는 명시적 load/error와 시간 제한으로 확인하며 실패한 시도의 link는 제거한다.
- 최신 manifest가 실행 중 main과 다른 빌드이면 새 World를 import하지 않고 query를 바꾼 문서로 이동한다. 이 검사가 없으면 새 World의 정적 main import가 두 번째 앱 루트를 부팅할 수 있다는 반례를 발견해 전달했고 수정됐다.
- 독립 guard 실행 **2개 중 2개 통과**: 버전 불일치 시 CSS 생성 0개·다른 World import 전에 문서 이동, 외부 모듈 경로 거부. 기존 query와 hash 보존도 확인했다. [loader-guard.json](../../artifacts/review-2026-10-18/three-recheck/loader-guard.json).
- 최종 manifest의 `World-DlyJCbvW.js` 정적 의존성은 초기 main·React뿐이다. Three.js를 별도 chunk로 두지 않아 재시도에서도 실패한 Three URL을 다시 참조하는 경로를 제거했다. [빌드 manifest](../../artifacts/review-2026-10-18/three-recheck/loader-build-manifest.json).
- 이 변경 범위에서 남은 중요 코드 지적은 없다. TypeScript 검사 종료 코드 0. 소스 해시는 `loader-source-manifest.json`에 별도로 남겼다.

최종 WebKit 시험에는 World 본체 반복 실패 뒤 재시도, CSS 전송 실패 뒤 재시도, 배포 버전 불일치 시 새 문서 이동·단일 앱 유지·기존 빌드 복구가 포함됐다. 버전 시험은 manifest를 가짜 새 버전으로 바꾸어 이동 분기를 실행한 뒤 실제 manifest로 복구한 것이며, 서로 다른 실제 서버 배포 두 개를 교체한 시험으로 확대 해석하지 않는다. 위 새 복구의 브라우저 실행은 주 작업자의 통합 근거를 재사용했고, 독립 검토자는 코드·빌드 의존성·guard 2개 실행·결과 JSON을 확인했다.
