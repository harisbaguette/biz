# BLUEKITE WORKS

창작 사업들이 모인 작은 도시를 운영하는 게임의 브랜드다. 이름은 **BLUEKITE WORKS**, 짧은 표기는 **BLUEKITE**다. 게임 안의 각 작업실은 사업·계정이고, 브랜드는 이 작업실들을 잇는 표식이다.

심벌은 **접힌 연**이다. 넓은 윗면과 아래로 접힌 한 면을 대각선 틈 하나로 나눴다. 위에서 본 작은 섬과 날아가는 연을 같은 실루엣에 담았다. 별·작은 꼬리·내부 문양은 쓰지 않는다.

| 쓰임 | 파일 | 표시 기준 |
|---|---|---|
| 게임 HUD·좁은 헤더 | `/brand/symbol.svg` | 24–32px, 최소 16px |
| 어두운 HUD | `/brand/symbol-white.svg` | 24–32px |
| 로그인·제품 식별 | `/brand/logo-horizontal.svg` | 최소 너비 208px |
| 어두운 배경의 정식 로고 | `/brand/logo-horizontal-white.svg` | 최소 너비 208px |
| 세로 구성 | `/brand/logo-stacked.svg` | 최소 너비 224px |
| 글자 로고 | `/brand/wordmark.svg` | 최소 너비 208px |
| 단색 인쇄·새김 | `/brand/symbol-mono.svg` | 실제 틈이 뚫린 1색 벡터 |
| 파비콘 | `/favicon.svg`, `/favicon.ico` | 16·32px 전용 도형 |
| 홈 화면 | `/apple-touch-icon.png` | 180×180 |
| 설치 아이콘 | `/brand/icon-192.png`, `/brand/icon-512.png` | 모서리는 OS가 처리 |
| Maskable 설치 아이콘 | `/brand/icon-maskable-512.png` | 중앙 안전 영역 안의 심벌 |
| 공유 이미지 | `/brand/og.png` | 1200×630 |
| 웹 앱 명세 | `/site.webmanifest` | 세로 기본·standalone |

추가 원본은 `/brand/app-icon.svg`, `/brand/app-icon-maskable.svg`, `/brand/og.svg`다. 16·32·180·192·512px PNG와 1024px 가로 로고 PNG를 함께 제공한다. SVG 로고와 글자 로고에는 `<text>`·외부 글꼴·이미지·필터가 없다.

## 색과 여백

새 디자인 시스템의 ink `#2c333d`, mint `#d3e8de`, background `#f1f3f6`를 바탕으로 teal `#287b74`를 브랜드 심벌에 쓴다. Amber `#ffbf63`는 게임의 주 행동과 상태를 위한 색으로 남기고 로고에 더하지 않는다.

심벌 주변에는 표시 너비의 1/8 이상 여백을 둔다. 흰색·mint 바탕에는 기본형, ink 바탕에는 흰색형을 쓴다. 로고를 회전·늘이거나 외곽선·그림자·별·슬로건을 더하지 않는다. 작은 게임 HUD에서는 긴 글자 로고 대신 심벌을 쓴다.

## 제작과 출처

심벌은 이 프로젝트를 위해 직접 구성한 벡터다. 글자 로고는 프로젝트에 있던 **Pretendard Variable, weight 720**을 실제 경로로 변환했다. 제작 원본은 `public/assets/fonts/PretendardVariable.subset.91.woff2`이고, 현재 렌더링에는 이 글꼴 파일이 필요하지 않다. 글꼴의 SIL Open Font License 1.1 고지는 `/brand/Pretendard-OFL.txt`에 보존했다. 공식 원본: https://github.com/orioncactus/pretendard.

검토용 Buildkite·Pagekite·Kotlin·Framer 로고는 형태를 구별하기 위한 참고만 했으며 제품에 복사하거나 포함하지 않았다. 외부 일러스트·생성 이미지·구입 에셋을 로고에 사용하지 않았다.

## 확인 기록

서로 다른 3개 방향을 실제 렌더했다. 접힌 연을 선택했고, K 이니셜은 이름을 모르면 읽히지 않아 제외했다. 층을 쌓은 섬은 레이어 아이콘과 너무 비슷해 제외했다. 두 번째 도형 수정에서 아래 접힘의 한 변을 75°로 정리하고, 작은 파비콘의 틈을 더 넓혔다.

- 비교: `artifacts/brand/concepts.png`
- 최종 색·단색·반전·실제 소형 비교: `artifacts/brand/identity-sheet.png`
- 기계 검사·파일 규격: `artifacts/brand/audit.json`, `artifacts/brand/verification.json`

SVG 파일 전체에서 FAIL 0을 확인했다. 글자 윤곽에 남은 각도 경고는 Pretendard의 W·K 등 원래 글꼴 기울기이며 임의로 꺾지 않았다. 16·32px, 단색·반전, 180px 홈 화면 아이콘과 공유 이미지는 headless Chromium으로 렌더해 직접 확인했다. 실제 앱 연결과 배포 후 메타데이터 확인은 앱 통합 검증에 포함한다.
