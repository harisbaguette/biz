# 프런트엔드

디자인 기준은 `/Volumes/public/hong-designsystem`의 Inkpress UI다. 필요한 원본 CSS만 `src/design-system/vendor/`에 가져오며, 앱에서 원본 파일을 직접 고치지 않는다.

```sh
npm run design:sync    # 디자인 시스템 원본에서 갱신
npm run design:check   # 사용 중인 23개 CSS와 원본 대조
```

다른 위치의 원본은 `HONG_DESIGN_SYSTEM`으로 지정한다. 원본이 없는 환경에서도 Git에 포함된 CSS로 빌드할 수 있다. `manifest.json`에 각 파일의 SHA-256을 기록한다.

| 영역 | 사용하는 원본 | 제품에 맞춘 부분 |
|---|---|---|
| 앱과 탐색 | `page-app`, `nav-rail`, `bottom-nav` | PC 옆 메뉴, 세로 화면 하단 메뉴, 가로 휴대전화 옆 메뉴 |
| 계정·재고 | `sheet`, `block-list`, `description-list` | 그림·계정·상태·수량 정렬, 문제와 다음 행동 우선 |
| 입력과 조작 | `button`, `icon-button`, `input`, `native-select`, `field`, `form` | 기존 업무 검증과 접수·실패 상태 연결 |
| 확인·안내 | `dialog`, `alert`, `badge` | 확인 대화상자, 실패 토스트, 관측 시각 구분 |
| 인증 | `page-auth` | 기존 HTTPS 세션 인증 |

제품의 배치는 `src/style.css`, 업무 패널은 `src/ui/Panels.css`, 지도 표식은 `src/world/World.css`에서 정한다. 색·간격·글자·선·그림자는 `--ui-*` 토큰을 사용한다. Pretendard와 Lucide는 기존 설치본을 사용하며 CDN을 부르지 않는다.

3D는 UI와 같은 표면으로 칠하지 않는다. 지형·도로·시설의 접지와 깊이는 조명과 재료로 구분하고, 화면 표식에는 Inkpress 언어를 적용한다. 정상 표식의 보이는 면적은 줄이되 터치 영역은 44px 이상으로 유지한다. 재고·심사 레이어는 실제 수량을 표시한다. 제작·검수의 동작은 원본 상태를 따르며, 재고가 목표보다 적다는 이유만으로 오류를 표시하지 않는다.

검증은 격리된 데이터와 headless 브라우저에서 한다. 운영 자동화를 켜거나 제출을 실행하는 방식으로 시험하지 않는다. 실데이터 캡처와 인증 파일은 Git에 포함하지 않는다.

글자 확대 시에는 글자 크기를 유지하고 상단 브랜드·하단 메뉴 이름을 축약하며, 계정 행동 버튼을 한 열로 바꾼다. Three.js의 광원은 UI의 다크 표면색과 분리한다. 패널을 닫을 때는 실제로 열었던 버튼으로 키보드 위치를 되돌린다.
