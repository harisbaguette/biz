# Three.js·React 기술 검토

`REVIEW_COMPLETE` · 제품 판정 **반려** · P0 0건 / P1 4건 / P2 6건 / P3 0건

3D 장면을 유지하는 기본 구조와 최적화는 있으나, 계정 선택의 정확성과 실패 후 복구가 상용 관제 수준에 못 미친다. 844×390의 재고·심사 보기에서 13개 라벨 중 10개는 중심을 누르면 다른 계정이 선택된다. 확대 버튼은 내부 zoom 값만 바꾸고 화면을 그리지 않으며, 회전 후에는 라벨과 시설의 위치가 어긋난다. 3D 코드 청크 한 건이 실패하면 메뉴까지 사라지는 빈 화면이 된다. 이 네 문제는 출시에 앞서 고쳐야 한다.

## 범위·증거

지정한 소스 **5개 중 5개**를 검토했다: `src/world/World.tsx` 675줄, `src/world/layout.ts` 16줄, `src/App.tsx` 583줄, `src/style.css` 2,232줄, `src/data.ts` 113줄. 호출 관계는 `src/types.ts`, `src/main.tsx`, `src/ui/Panels.tsx`, `src/ui/Primitives.tsx`, `connector/snapshot.py`, `worker/index.mjs`와 설치된 `OrbitControls`·`WebGLRenderer`의 관련 경로를 대조했다. Git 저장소가 없어 이전 버전과의 diff는 없으며, 아래 결함은 검토 시점 구현에 존재하는 것으로 분류했다. 소스 해시는 `artifacts/review-2026-10-18/three/source-manifest.json`에 있다.

- 브라우저 시나리오 **7개 중 7개** 실행: 4개 화면 크기 × 3개 레이어(12개 조합), context loss/restore, 장식 모델 실패, JS 청크 실패.
- 소스에서 추출한 함수·설치된 OrbitControls 재현 **6개 중 6개** 실행: 오른쪽 버튼, 두 번째 손가락 해제, 긴 드래그 대조군, 응답 없는 요청의 새로고침 차단, 외부 zoom의 change 누락, 회전 뒤 행렬 갱신 순서.
- 실제 Three.js 카메라 투영 계산 **6개 중 6개** 실행.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`: 종료 코드 0.

시험은 headless Chromium과 독립 브라우저 컨텍스트에서 했다. `/api/**`는 읽어 온 스냅샷을 복제한 격리 응답으로 대체했고, 운영 지시·원본 자동화·배포·인증은 건드리지 않았다. 장면 안정 비교를 위해 계정의 `running=false`, 자동 제출 `enabled=false`를 시험 데이터에만 적용했다. 제품 코드는 수정하지 않았다.

원본 증거: [브라우저 결과](../../artifacts/review-2026-10-18/three/browser-reproductions.json), [함수·투영 결과](../../artifacts/review-2026-10-18/three/static-reproductions.json), [브라우저 실행 로그](../../artifacts/review-2026-10-18/three/browser-run.log).

## T01 · P1 · 3D 청크 실패가 관제 전체를 지운다

**실제 브라우저 재현.** `src/App.tsx:43`의 `lazy(() => import("./world/World"))`를 `src/App.tsx:226`에서 `Suspense`로만 감쌌다. 에러 경계가 없으므로 3D 청크 전송 실패가 앱 루트까지 전파된다.

- 조건: 앱은 열리지만 `/assets/World-*.js` 요청만 실패한다. 네트워크 단절 또는 배포 직후 옛 HTML이 삭제된 청크를 참조하는 경우에도 같은 경로가 된다.
- 결과: `#root.childElementCount=0`, 관제 메뉴 0개. 오류 메시지, 목록 대체 화면, 재시도 모두 없다. 실제 오류: `Failed to fetch dynamically imported module: http://127.0.0.1:4317/assets/World-Cor-jvdv.js`.
- 영향: 3D의 전송 문제 하나로 일정·계정 관리까지 전부 중단된다.
- 최소 개선: 3D 영역에 에러 경계를 두고, 해당 청크 밖에 계정 목록 대체 화면과 재시도를 둔다. 나머지 메뉴는 유지한다.
- 회귀 기준: World 청크만 실패시켜도 계정·일정 메뉴를 사용할 수 있고, 자원 전송 복구 후 재시도로 3D에 돌아올 수 있어야 한다.
- 증거: [빈 화면](../../artifacts/review-2026-10-18/three/world-chunk-failure.png), 브라우저 결과 `lazy World JS request fails`.

## T02 · P1 · 투영 라벨이 겹쳐 다른 계정으로 입력된다

**실제 DOM 투영·hit test 재현.** `src/world/World.tsx:555`는 각 투영 좌표에 라벨을 그대로 놓고 충돌·가림을 처리하지 않는다. `src/style.css:210`의 최소 너비·높이와 재고 숫자 너비가 투영된 작업동 간격을 넘는다.

| 화면 | 상태 라벨 충돌 | 재고 라벨 충돌 | 심사 라벨 충돌 | 재고·심사에서 다른 계정으로 떨어지는 라벨 중심 |
|---|---:|---:|---:|---:|
| 360×740 | 18쌍 | 18쌍 | 18쌍 | 0/13 |
| 390×844 | 8쌍 | 18쌍 | 18쌍 | 0/13 |
| 844×390 | 18쌍 | 31쌍 | 31쌍 | **10/13** |
| 900×1440 | 0쌍 | 0쌍 | 0쌍 | 화면 밖 1개(T03) |

- 조건: 844×390에서 재고 또는 심사 레이어를 선택한다.
- 결과: 1번 라벨 중심의 `elementFromPoint`는 2번, 2번은 3번, 3번은 4번이다. 같은 문제가 5→6, 6→7, 7→8, 9→10, 10→11, 11→12, 12→13에서도 생긴다. 390×844의 세로 화면도 라벨 18쌍이 겹쳐 시설과 수량을 가린다.
- 영향: 화면에 표시된 계정과 사용자가 누르는 대상의 일치가 깨진다. 게임처럼 시설을 직접 눌러 관리한다는 핵심 조작의 결함이다.
- 최소 개선: 실제 라벨 크기를 포함해 카메라를 맞추고, 공간이 부족할 때만 선택 계정의 수량을 펼치거나 가리지 않는 별도 위치로 옮긴다. 숫자와 조작 영역을 함께 보존한다.
- 회귀 기준: 지원 화면 크기·3개 레이어 각각에서 모든 라벨 중심 및 주요 숫자 영역의 hit target이 자신의 계정이어야 한다. 겹침 검사와 시설 직접 선택을 추가한다.
- 증거: [390×844](../../artifacts/review-2026-10-18/three/labels-390x844-stock.png), [844×390](../../artifacts/review-2026-10-18/three/labels-844x390-stock.png). 기존 `tests/world.e2e.ts:109` 이후는 작업동 목록으로 계정을 열어 이 결함을 통과시킨다.

## T03 · P2 · 세로 PC에서 전체 단지 보기가 전체를 담지 못한다

**실제 브라우저 재현 + Three.js 수학 재현.** `src/world/World.tsx:590`은 화면 너비만으로 `span=43`을 선택한다. 900×1440에서는 가로 표시 범위가 약 28.37 world units로 좁아진다. `reset()`(`src/world/World.tsx:289`)도 같은 고정 zoom=1로 돌아갈 뿐 경계를 맞추지 않는다.

- 조건: 900×1440 기본 진입 또는 전체 단지 보기.
- 결과: 9번 라벨 중심이 **x=-30.56px**, 세 레이어 모두 화면 밖이다. 시설 일부와 외곽도 잘린다. 경고가 9번에 생기면 사용자가 지도를 옮겨 찾거나 목록을 열어야 한다.
- 최소 개선: 단지의 투영된 경계와 UI가 차지하는 영역으로 카메라를 맞춘다. 너비 분기 대신 가로·세로 양쪽을 충족하는 zoom을 계산하고 reset에도 같은 계산을 쓴다.
- 회귀 기준: 900×1440을 포함한 각 화면 비율에서 전체 단지 보기 후 13개 시설·라벨이 조작 가능한 영역 안에 있어야 한다.
- 증거: [900×1440](../../artifacts/review-2026-10-18/three/labels-900x1440-stock.png), 두 JSON의 해당 viewport.

## T04 · P2 · WebGL이 복구돼도 목록 모드에 갇힌다

**실제 WebGL extension 재현.** `src/world/World.tsx:226`의 `lost()`는 `setError(true)`만 실행한다. `webglcontextrestored` 수신 또는 사용자 재시도가 없다. effect는 빈 의존 배열이고 오류 상태 전환으로 cleanup이 실행되지도 않는다.

- 조건: 장면 로드 후 `WEBGL_lose_context.loseContext()`를 호출하고 이어 `restoreContext()`를 호출한다.
- 결과: GPU context는 `isContextLost=false`로 복구됐지만 `fallback=true`, 지도 라벨 0개가 유지된다. 그 뒤 1.2초 동안 RAF 등록이 73회 더 발생했다. 목록 모드에서도 기존 renderer·controls·loop가 살아 있다.
- 영향: 일시적인 컨텍스트 손실이 영구적인 3D 이탈로 바뀐다. 목록은 작동하므로 데이터 손실로 분류하지 않는다.
- 최소 개선: 손실 시 렌더를 멈추고 복구 시 자원·그림자·투영 표시를 다시 갱신하거나, 명시적인 3D 재시작으로 renderer를 재생성한다. 목록을 유지한다면 기존 루프와 자원을 종료한다.
- 회귀 기준: loss→restore 후 13개 라벨이 복구되거나 사용자가 한 번의 재시도로 복구할 수 있어야 한다. 목록 모드에 남을 때는 기존 WebGL 루프가 멈춰야 한다.
- 증거: [복구 후에도 목록 모드](../../artifacts/review-2026-10-18/three/context-restored.png), 브라우저 결과 `WebGL loss then restoration`.

## T05 · P2 · 응답 없는 요청 하나가 이후 새로고침을 모두 차단한다

**소스 추출 함수 재현·정적 확정.** `src/App.tsx:71`의 `refresh()`는 요청 전 `polling.current=true`를 설정하고 요청이 settle한 뒤에만 해제한다. `src/data.ts:99`의 `fetch()`에는 시간 제한·취소가 없다.

- 조건: `/api/world` 연결은 됐지만 응답 또는 JSON 본문이 끝나지 않는다.
- 결과: 최초 refresh 뒤 수동·타이머에 해당하는 추가 refresh를 2회 호출해도 실제 요청은 총 1회다. visibilitychange의 refresh도 같은 가드에 막힌다. 재연결 UI로 대기 중 요청을 대체할 방법이 없다.
- 영향: 정보가 오래되어 지시가 막힌 뒤에도 앱 안에서 복구할 수 없다. 네트워크가 무조건 영원히 대기한다고 주장하는 것은 아니며, 브라우저의 종료·시간 초과까지 복구를 맡겨 둔 것이 결함이다.
- 최소 개선: 요청에 유한 시간 제한과 `AbortController`를 적용하고, 수동 재연결은 기존 요청을 취소한 뒤 새 요청을 시작한다. 요청 순서가 바뀌어 과거 결과가 최신 결과를 덮지 않도록 한다.
- 회귀 기준: 응답을 멈춘 상태에서도 정해진 시간 안에 오류로 전환되고, 서버 복구 후 수동 재연결로 최신 상태를 받는다.
- 증거: `static-reproductions.json`의 `one hanging /world request blocks manual and timer retries`: `attemptedRefreshes=3`, `requestsStarted=1`.

## T06 · P2 · 나무 모델 하나의 일시 장애가 3D 전체를 영구 중단시킨다

**실제 브라우저 재현.** `src/world/World.tsx:311`의 `Promise.all(tasks.map(load))`는 필수 시설과 장식 24개를 같은 성공 조건으로 묶는다. 하나라도 실패하면 `src/world/World.tsx:473`에서 전체를 오류 상태로 만든다.

- 조건: `tree-pine.glb` 한 개만 503으로 응답한다. 이후 해당 자원 요청은 정상으로 돌리고 상태 새로고침을 누른다.
- 결과: 나머지 자원은 정상이어도 목록 모드로 바뀌고, 네트워크 복구 후에도 나무 요청은 총 1회, 목록 모드는 계속 유지된다. 안내는 실제 원인과 다르게 “이 기기에서는 목록으로 시설을 관리할 수 있어요”다.
- 최소 개선: 필수 시설과 선택 장식을 나누어 실패한 장식은 생략한다. 필수 자원 실패에는 원인에 맞는 안내와 자원 재시도를 제공한다.
- 회귀 기준: 선택 장식 1개 실패 시 13개 시설 관제를 유지한다. 필수 자원 실패 뒤 네트워크 복구 시 재시도가 실제 자원 요청을 다시 보낸다.
- 증거: [장식 실패 화면](../../artifacts/review-2026-10-18/three/optional-tree-failure.png), 브라우저 결과 `one optional tree model fails, then network recovers and user refreshes`.

## T07 · P2 · 두 손가락 제스처를 계정 선택으로 오인한다

**소스 추출 입력 함수 재현·정적 확정.** `src/world/World.tsx:207`은 모든 포인터가 공유하는 `down` 하나를 덮어 쓰고 `src/world/World.tsx:211`에서는 이동 거리만 판별한다. 포인터 ID·주 포인터·버튼·취소·멀티터치 이력 검사가 없다. `OrbitControls`는 별도로 두 손가락 확대·회전을 활성화한다(`src/world/World.tsx:121`).

- 조건: 첫 손가락 down, 둘째 손가락 down 후 둘째 손가락을 그 위치에서 올린다. 해당 위치에 시설 hit가 있다.
- 결과: 둘째 손가락의 해제를 계정 3 선택으로 처리한다. 오른쪽 버튼의 정지 해제도 동일하게 계정 선택을 일으킨다. 긴 단일 드래그 대조군은 선택하지 않는다.
- 영향: 확대·회전하다 계정 패널이 불쑥 열리고, PC에서는 추가 카메라 focus까지 시작한다. 모바일의 직접 조작 신뢰도를 떨어뜨린다.
- 최소 개선: 주 포인터의 단일 탭만 선택으로 확정하고, 두 번째 포인터가 등장한 제스처 전체는 선택에서 제외한다. pointercancel·버튼·pointerId를 추적한다.
- 회귀 기준: 단일 탭만 한 번 선택하고, 우클릭·핀치·회전·취소는 선택을 발생시키지 않는다. 실제 터치 장치에서의 빈도는 별도 미검증이다.
- 증거: `static-reproductions.json` 첫 3개 체크와 `static-reproductions.mjs`의 소스 추출 함수.

## T08 · P2 · 모바일 가로 화면에서 하단 메뉴가 뷰포트 밖으로 밀린다

**실제 스크린샷 + CSS 정적 확정.** `src/style.css:93`의 `.app`은 `height:100dvh`와 `min-height:440px`를 함께 가진다. 가로 화면 규칙(`src/style.css:2120`)은 이를 해제하지 않는다.

- 조건: 844×390 가로 화면.
- 결과: 앱 최소 높이가 화면보다 50px 크다. 하단 dock은 화면 아래에 배치되고 스크린샷에는 윗부분만 보인다. 가로 화면 전용 레이아웃이 있어도 주요 탐색을 보려면 페이지를 추가로 스크롤해야 한다.
- 최소 개선: 낮은 가로 화면에서는 앱 높이를 실제 viewport에 맞추고, dock·패널·지도 가용 영역을 같은 기준으로 배치한다. 부족한 상세 내용만 패널 안에서 스크롤한다.
- 회귀 기준: 844×390과 720×450에서 처음 진입한 상태의 dock 전체가 viewport 안에 있어야 하며, 필수 조작을 위해 body 세로 스크롤이 필요 없어야 한다.
- 증거: [844×390 하단](../../artifacts/review-2026-10-18/three/labels-844x390-stock.png). UX/UI 검토와 중복될 수 있어 합산 시 같은 원인으로 묶어야 한다.

## T09 · P1 · 확대 버튼이 내부 zoom만 바꾸고 화면을 그리지 않는다

**게임 검토자의 브라우저 재현 재사용 + 설치된 OrbitControls 단위 실행으로 원인 확정.** `src/world/World.tsx:282`는 `targetZoom`만 바꾸고, `src/world/World.tsx:514`의 매 프레임 보간도 `dirty=true`를 설정하지 않는다. `OrbitControls.update()`의 change 이벤트가 이를 대신할 것으로 기대한 구조다.

- 조건: 계정 작업이 없는 정지 장면에서 확대 버튼을 한 번 누르고 기다린다.
- 결과: 게임 담당 증거의 `totalFrames`는 **2→2**, `zoom`은 **1→1.218**로 바뀐다. 라벨 위치와 화면은 그대로다. 같은 설치판 OrbitControls로 zoom을 50회 보간한 독립 실행에서도 `change`는 **0회**, zoom은 1.21979였다.
- 원인: `OrbitControls.js:794`는 update에 들어왔을 때의 `camera.zoom`을 `prevZoom`으로 잡고 자기 `_scale`만 반영한다. 외부에서 미리 바뀐 zoom은 감지하지 못한다. 이어 change 조건(`OrbitControls.js:813`)은 위치·회전·target만 비교한다.
- 영향: 확대·축소가 눌러도 반응하지 않다가, 다른 조작이나 다음 스냅샷 갱신 때 갑자기 적용된다. 게임식 지도 탐색의 기본 조작이 깨진다.
- 최소 개선: 모든 수동 카메라 보간에서 dirty를 명시적으로 설정하고 마지막 목표 값도 화면에 그린다. 컨트롤러의 target 상태 변경도 무효화 경로에 포함한다.
- 회귀 기준: 정지 상태에서 확대·축소할 때 실제 렌더 프레임이 증가하고, 시설·라벨의 화면 위치나 크기가 즉시 변해야 한다. `__bizWorld.zoom` 숫자만 검사해서는 안 된다.
- 증거: [게임 담당 카메라 결과](../../artifacts/review-2026-10-18/game/camera-gestures.json), [확대 전](../../artifacts/review-2026-10-18/game/zoom-before.png), [확대 후](../../artifacts/review-2026-10-18/game/zoom-after.png), 함수 결과 `external zoom interpolation emits no OrbitControls change event`.

## T10 · P1 · 시점 회전 후 HTML 라벨이 다른 위치에 고정된다

**게임 검토자의 브라우저 재현 재사용 + Three.js 행렬 실행으로 원인 확정.** `src/world/World.tsx:555`는 `project(camera)`로 라벨을 계산한 뒤 `src/world/World.tsx:564`에서 장면을 그린다. 수동 회전으로 바뀐 카메라 quaternion에 대한 `matrixWorldInverse` 갱신을 투영 전에 보장하지 않는다.

- 조건: 정지 장면에서 시점 회전 버튼을 한 번 누른다.
- 결과: 시설은 회전하지만 라벨이 왼쪽·바닥으로 벗어난 상태에서 멈춘다. 게임 담당 카메라 결과에서 회전 후 1번 라벨의 왼쪽 좌표는 -354.97px다. 초기 카메라에서 같은 45도 회전·투영 순서를 재현한 단위 실행의 1번 라벨 오차는 약 **982px**였다.
- 원인: `OrbitControls.update()`는 `Object3D.lookAt()`을 호출한다. `lookAt()`은 quaternion을 바꾸기 전에 `updateWorldMatrix()`를 실행한다. 그 뒤 World가 바로 라벨을 투영하면 새 위치와 이전 방향의 역행렬을 쓰고, 실제 renderer는 그 후 최신 행렬로 시설을 그린다. `dirty=false`가 되면 다음 루프에서 올바른 라벨 좌표를 다시 쓰지 않는다.
- 영향: 표시 번호와 실제 시설을 연결할 수 없고 다수 라벨이 지도에서 사라진다. 시설 선택과 경고 위치 인지가 무너진다.
- 최소 개선: controls와 수동 카메라 변경을 모두 적용한 뒤 `camera.updateMatrixWorld()`를 호출하고, 같은 최신 행렬을 사용해 시설 렌더와 라벨 투영을 수행한다.
- 회귀 기준: 45도씩 여러 번 회전하고 매번 안정화한 뒤, 각 라벨이 해당 plot의 최신 투영 좌표에 작은 허용 오차 내로 일치해야 한다. 다음 데이터 갱신을 기다려야 맞는 결과는 통과시키지 않는다.
- 증거: [회전 화면](../../artifacts/review-2026-10-18/game/desktop-rotated-static-compass.png), 게임 담당 카메라 결과, 함수 결과 `rotation marker projection before renderer updates camera matrix`. 같은 원인의 게임 담당 지적과 합산하지 않는다.

## 성능·수명주기에 대한 판정 한계

정적 장면의 dirty 렌더, 모델 instancing, geometry merge, observer·controls·renderer cleanup은 확인했다. World는 lazy load하고 모델 24개는 병렬로 요청하므로, 코드 분할이나 모델 요청을 무조건 결함으로 취급하지 않았다. 기존 90 draw calls·약 5.5만 삼각형 수치는 이식 가능한 성능 보증이 아니다. 이번 실행은 FPS 벤치마크가 아니며 실제 iPhone·iPad·Android의 발열·배터리·GPU 메모리는 미검증이다.

로드 중 unmount의 비동기 자원 처리, 현재 디스플레이가 바뀔 때의 DPR 재계산, reduced-motion의 카메라 보간, 순서가 바뀐 계정 배열의 plot 대응은 잠재적 보완점이다. 다만 이번 검토에서 실제 메모리 증가·실기기 화질 문제·운영 데이터의 순서 변화를 입증하지 못했으므로 위 10개 확정 결함에 섞지 않았다. 성능 측정 없이 “버벅인다” 또는 “메모리가 샌다”고 판정하지 않는다.

검토 산출물은 이 문서와 `artifacts/review-2026-10-18/three/`에만 작성했다. 고치기보다 혹평하라는 요청에 맞춰 제품 수정은 0개다.
