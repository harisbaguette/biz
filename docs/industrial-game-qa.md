# 산업 단지 QA

최종 후보 `/tmp/bluekite-industrial-candidate3/dist` (4341, 2026-10-23)을 읽기 전용으로 확인했다. Playwright fixture는 실제 Worker 핸들러와 테스트별 in-memory D1을 쓰므로 운영 `.local` 데이터는 변경하지 않았다.

Chromium **47/47**, WebKit **47/47** 통과했다. 전체 E2E에는 수익 저장·재접속·충돌, 계정 13개와 사업 시설 전부 표시, 360/390/430px 세로 모바일, 844×390·640×360 가로 모바일, 세로 태블릿·PC, 실제 Three.js 창고 선택, 창고 0/부분/가득 참 상태, 제출·심사·보관·수익 동선, 장애·오류·포커스·복구가 포함된다. 같은 페이지의 1440→844→640px 리사이즈도 4→7→5열로 바뀌며 13개 표찰의 표시·터치 크기·중심 hit·겹침 0을 유지했다. 각 계정 선택 후에도 13개 창고가 계속 표시된다.

| 확인 | 결과 |
|---|---:|
| Chromium E2E | 47/47 통과, 1 worker, 1.8분 |
| WebKit E2E | 47/47 통과, 1 worker, 50.6초 |
| TypeScript `npx tsc -b --pretty false` | exit 0 |
| `git diff --check` | exit 0 |

증거 로그: [Chromium](../artifacts/industrial-game/qa/chromium-final-4341-rerun.log), [WebKit](../artifacts/industrial-game/qa/webkit-final-4341.log). 캡처와 개별 테스트 결과는 `artifacts/industrial-game/qa/`에 있다.

창고·시설 표찰의 CSS 계산 크기는 최소 44px이며, Three.js 원근 투영 뒤 DOMRect는 43.99px 이상으로 확인한다. 360px에서 43.999984px로 보이는 값은 44px 레이아웃 박스의 부동소수 투영 오차다. WebKit은 Playwright CDP를 제공하지 않아 핀치 두 손가락 입력을 합성 `PointerEvent`로 실제 OrbitControls와 월드 포인터 처리기에 보냈다. 이것은 핀치 처리 경로 회귀 확인이며, 네이티브 모바일 Safari 입력이나 실기기 터치 검증을 뜻하지 않는다. Chromium은 CDP touch dispatch를 사용했다.
