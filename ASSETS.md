# 사용 에셋

산업 공간 재설계의 신규 모델은 아래 **2026-10-23 산업 공정·물류 공간**에 기록한다. 이전 단계의 출처 기록은 보존하며, 현재 씬 사용 여부는 해당 구현의 모델 목록과 함께 확인한다. UI는 지정 Pattove 정본을 사용한다.

| 실제 파일 | 출처 | 권리 | 사용 |
|---|---|---|---|
| `public/assets/models/building-*.glb`, `shipping-container-*.glb` | [Kenney City Kit Industrial 2.0](https://kenney.nl/assets/city-kit-industrial) | CC0 1.0 | 13개 작업동, 공정 시설 구성 |
| `public/assets/models/truck.glb`, `box.glb` | [Kenney Car Kit](https://kenney.nl/assets/car-kit) | CC0 1.0 | 출하 도크의 정차 차량, 실제 목표 대비 재고 상자 |
| `public/assets/models/light-curved.glb` | [Kenney City Kit Roads](https://kenney.nl/assets/city-kit-roads) | CC0 1.0 | 도로 시설 |
| `public/assets/models/tree-oak.glb`, `tree-pine.glb` | [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) | CC0 1.0 | 단지 조경 |
| `public/assets/fonts/pretendard.css`, `PretendardVariable.subset.*.woff2` | [Pretendard v1.3.9](https://github.com/orioncactus/pretendard/tree/v1.3.9) | SIL OFL 1.1 | 한글 UI·숫자 |
| `lucide-react` 패키지 | [Lucide](https://lucide.dev/license) | ISC | 업무 아이콘 |
| 인증된 `/api/thumbnail/` 미리보기 | 사용자의 미리캔버스 제작원본 | 사용자 소유 | 계정 대표 그림·최근 재고. 공개 정적 빌드에 포함하지 않음 |

확인일: 2026-10-18. 모든 다운로드는 `~/.codex/scripts/asset_fetch.py`로 받았다. GLB의 외부 팔레트는 `scripts/pack-models.py`로 파일 안에 포함했다. 모양을 다른 제작자의 에셋으로 주장하지 않으며, 시설 배치·도로·상태 표시·라이팅은 이 프로젝트에서 구현했다. Kenney 원문 라이선스는 `public/assets/models/Kenney-LICENSE.txt`에 있다.

제작 라인·검수 게이트·목표 비축랙·출하 캐노피의 기능 형태는 `src/world/processFacilities.ts`에서 직접 구성했다. 내려받은 `water-tower.glb`, `solar-panel-landscape.glb`, `windmill.glb`, `delivery.glb`는 현재 장면에 사용하지 않는다. 차량 이동을 실제 제출의 진행 증거로 표현하지 않는다.

일본 3D屋さん은 웹 원본 재배포 권한이 확정되지 않았고 PLATEAU는 실제 도시 데이터여서 이번 의미 기반 단지의 재료로 선정하지 않았다. KayKit City Builder Bits와 Kenney 산업 모델을 비교하여 산업 시설 구성과 일관된 파일 규격에 맞는 Kenney를 선택했다.

사용자 X 영상, Cities: Skylines II와 shapez 2 이미지는 화면 구성 연구에만 사용했다. 앱 에셋에 포함하지 않았다. 실제 참고와 적용 원칙은 `docs/PLAN.md`에 있다.

2026-10-21 UI 재설계: 사용자가 지정한 `hong-designsystem/assets/css/ui`의 Inkpress UI 원본 CSS 23개를 `src/design-system/vendor/`에 연결했다. 출처와 파일별 해시는 해당 폴더의 `manifest.json`에 있다. `scripts/sync-design-system.mjs`로 재현하며 원본 디자인 시스템은 수정하지 않는다. 화면 구조·목록·입력·시트·모달을 이 부품의 실제 HTML과 CSS에 맞췄다. 3D는 기존 Kenney 라이선스 에셋을 재사용하고, 카메라·배치·접지·표식·재고 표현을 개선했다.

## 2026-10-22 세로 모바일 게임용 모델

기존 산업단지와 별개로 `public/assets/game-v2/`에 **KayKit City Builder Bits**를 주 팩으로 도입했다. 유색 상점·차양·옥상 물탱크·차량·가로 시설의 비례와 아틀라스를 통일한다. 같은 작가의 Medieval Hexagon 팩에서는 시대성이 없는 나무 군집·나무 상자·팔레트 6개만 보완한다. 건물·차량·조경의 실루엣을 코드로 새로 만들거나 기존 Kenney 건물의 색만 바꾼 재료가 아니다.

| 비교 후보 | 컨셉 적합도 | 커버리지 | 통일성 | 라이선스·선정 |
|---|---|---|---|---|
| [3D屋さん](https://3dyasan.com/) · 일본 제작자 우선 검토 | 실내 소품 중심으로 도시 전체를 구성하기 어려움 | 게임용 도시·차량 통합 팩 확인 불가 | 필요한 전 범주를 한 시리즈로 맞출 근거 부족 | 이전에 확인한 이용 안내만으로 웹 게임의 원본 파일 포함 허용이 확정되지 않았고, 현재 `/about/`는 404. 채택하지 않음 |
| [Quaternius Ultimate Textured Buildings](https://quaternius.com/packs/ultimatetexturedbuildings.html) | 가게·창고·직업 건물 다양 | 건물 76종, 차량·조경은 별도 팩 필요 | 장방형·회색 외장 중심, 작은 모바일 화면에서는 미세 장식이 덜 읽힘 | 공식 CC0. 프리뷰 직접 비교 후 건물 단일 범주의 후보로 보류 |
| [KayKit City Builder Bits](https://kaylousberg.itch.io/city-builder-bits) | 짧은 건물·유색 차양·점포가 있는 창작자 작업실 지구에 적합 | 무료판에 건물 8종, 차량·도로·상자·가로 시설 포함 | 같은 제작자·단일 그라디언트 아틀라스, 외장 실루엣 차이가 작게 봐도 남음 | 공식 CC0 1.0, 상업 이용·수정·제품 포함 허용, 표기 선택. **주 팩 채택** |

| 실제 파일 | 원본 출처·다운로드 | 권리·원문 고지 | 가공·용도 |
|---|---|---|---|
| `public/assets/game-v2/building-A.glb` ~ `building-H.glb` · 8개 | [공식 저장소](https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0) · [원팩 ZIP](https://codeload.github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0/zip/63976910ca04d16f0fc531b9c614244be8128713) | Kay Lousberg / KayKit · CC0 1.0. `KayKit-City-LICENSE.txt` 보존 | 개별 작업실·상점·공정 건물. 바닥 중심 정규화, 256px 아틀라스 내장, roughness .82 |
| `car-hatchback.glb`, `car-sedan.glb`, `car-stationwagon.glb` · 3개 | 위 City Builder 원팩 `Assets/gltf/car_*.gltf` | 같은 CC0 | 바퀴를 포함한 노드 계층 보존. 지구 차량·출하 장소용. 차량 이동 자체를 실제 업무의 성공 증거로 표시하지 않음 |
| `box-A.glb`, `box-B.glb`, `bush.glb`, `bench.glb`, `streetlight.glb`, `watertower.glb`, `base.glb` · 7개 | 위 City Builder 원팩 `Assets/gltf/` | 같은 CC0 | 실제 재고·작업동 앞마당·가로 시설을 구성할 소품 |
| `road-straight.glb`, `road-corner.glb`, `road-corner-curved.glb`, `road-junction.glb`, `road-straight-crossing.glb`, `road-tsplit.glb` · 6개 | 위 City Builder 원팩 `Assets/gltf/road_*.gltf` | 같은 CC0 | 2×2 단위의 도로. 원팩 건물 받침과 같은 축척 |
| `tree-A-small.glb`, `tree-A-medium.glb`, `tree-B-small.glb`, `tree-B-medium.glb`, `crate.glb`, `pallet.glb` · 6개 | [KayKit Medieval Hexagon 공식 저장소](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) · [원팩 ZIP](https://codeload.github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0/zip/84fa4e91af6a88989be7c99e0891cede11f2ca38) | Kay Lousberg / KayKit · CC0 1.0. `KayKit-Hexagon-LICENSE.txt` 보존 | 같은 작가의 둥근 로우폴리 군집 조경·비축품. 현대 도시와 어긋나는 중세 건물·무기·캐릭터는 포함하지 않음 |

작성일 기준 **GLB 30개 중 30개**를 `GLTFLoader`로 열어 직접 렌더했다. 총 1,372,880 bytes, 최대 파일 130,612 bytes, 전체 18,219 triangles. 원본 무료 City glTF 41개 중 24개와 Hexagon 소품 6개만 추출했다. 외부 이미지·버퍼 의존은 없으며 각 파일에 최대 256×256 아틀라스를 내장한다. 30개 모두 +Y 상향, XZ 중심, 바닥 Y=0. 정확한 폭·높이·깊이·삼각형·파일 크기는 `public/assets/game-v2/manifest.json`에 있다. 차량 노드 조립을 포함한 실제 런타임 bbox로 접지 30/30을 확인했다.

원팩 ZIP의 바이너리 다운로드는 이 환경의 다운로드 규칙에 따라 headless `cdp_download.py`를 사용했고, 공식 라이선스 텍스트는 `asset_fetch.py url`로 재확인했다. 제품에 홍보 프리뷰는 포함하지 않았다. 비교용 프리뷰는 ignored `artifacts/game-assets-v2/{city-models.png,quaternius-preview.jpg}`에만 둔다. 에셋 원본 그대로의 단독 판매·저작자 사칭은 하지 않는다. 작업실 배치·목표·실제 업무 상태·상호작용은 앱에서 더하는 가치다.

재현: `python3 scripts/pack-game-assets.py --city <City원팩해제경로> --hexagon <Hexagon원팩해제경로>`; 검증: `node scripts/pack-game-assets.preview.mjs`. 30개 전수 headless 렌더·JS 오류 0·접지 30/30 증거는 `artifacts/game-assets-v2/render-audit.json`, 전체 모델 캡처는 `artifacts/game-assets-v2/all-models-v2.png`다. 실제 도시 장면의 연결과 모바일 조작 검증은 `src/world/World.tsx`의 통합 장면 검증에서 별도로 확인한다.

## 2026-10-22 브랜드·지정 디자인 시스템

현재 제품 UI는 [Pattove 정본과 권리 기록](src/design-system/ASSETS.md)의 실제 부품·폰트·그림 아이콘을 사용한다. 이전 Inkpress/Lucide 기록은 교체 전 이력이다. BLUEKITE WORKS 심벌·워드마크·파비콘·OG는 이번 프로젝트에서 자체 제작했으며 [브랜드 규격](docs/BRAND.md)을 따른다.

## 2026-10-23 산업 공정·물류 공간

주 팩은 **Kenney Factory Kit 3.0**이다. 주택 대신 생산 설비·이송대·심사 스캐너·출하 도크를 사용한다. 기존 Kenney 차량과 같은 제작자이며, KayKit은 기존 화물 상자·팔레트 2종만 재사용한다. 재고량·가동·제출·오류는 씬에서 실제 업무 데이터에 연결한다.

| 비교 후보 | 컨셉 적합도 | 커버리지 | 통일성 | 라이선스·판정 |
|---|---|---|---|---|
| [cremona-polygon 로우폴리 창고 미니세트](https://booth.pm/ja/items/8997220) · 일본 제작자 우선 검토 | 빈 창고·선반·팔레트 구성은 적합 | 무료 8종은 창고 소품 중심, 공장 설비·스캐너·컨베이어 없음 | 각진 산업 가구로 창고 내부에는 맞음 | 상업·수정·완성 작품 포함 허용이나 원본/수정 소재 재배포 금지. 공개 GLB 파일로 배포할 권한이 명확하지 않아 채택하지 않음. 공식 프리뷰를 직접 봄 |
| [Kenney City Kit Industrial 2.0](https://kenney.nl/assets/city-kit-industrial) · 기존 보유 팩 | 공장 외관은 적합하나 닫힌 지붕이 실제 재고를 가림 | 외장·굴뚝·컨테이너 중심, 내부 작업 기계 부족 | Kenney 차량과 일관됨 | 공식 CC0. 신규 주 팩으로는 채택하지 않고 기존 차량만 재사용 |
| [Kenney Factory Kit 3.0](https://kenney.nl/assets/factory-kit) | 생산·물류·심사 게이트가 각 모델의 형태와 직접 대응함 | 실제 원팩 143 GLB 중 필요한 산업 설비 16종만 추출 | 단일 제작자·공통 팔레트, 기존 Kenney 차량과 맞음 | 공식 CC0 1.0. **주 팩 채택**. 공식 샘플과 실제 GLTFLoader 렌더를 직접 비교함 |

| 실제 파일 | 출처·원본 다운로드 | 권리·고지 | 가공·역할 |
|---|---|---|---|
| `public/assets/industrial/machine.glb`, `machine-window.glb`, `robot-arm-a.glb`, `hopper-round.glb`, `cog-a.glb`, `pipe-large-valve.glb` | [공식 팩 페이지](https://kenney.nl/assets/factory-kit) · [공식 ZIP](https://kenney.nl/media/pages/assets/factory-kit/edaac9d4f6-1777639602/kenney_factory-kit_3.0.zip) | Kenney · CC0 1.0, `Kenney-Factory-LICENSE.txt` 보존, 출처 표시 선택 | 생산 설비·가동부·투입구. 원래 남청색 팔레트를 산업 청록으로 바꾸고 안전 주황은 보존함 |
| `conveyor-long.glb`, `conveyor-corner.glb`, `conveyor-sides.glb`, `crane-lift.glb` | 같은 공식 팩 `Models/GLB format/` | 같은 CC0 | 생산 이송·출하·적재 설비. 외부 팔레트 내장 |
| `scanner-high.glb`, `warning-traffic.glb`, `screen-wide.glb`, `button-floor-round.glb` | 같은 공식 팩 | 같은 CC0 | 심사 게이트·운영 상태등·설비 계기판·스위치. 실제 동작은 씬이 제어하며 내장 애니메이션은 없음 |
| `structure-wall.glb`, `door-wide-open.glb` | 같은 공식 팩 | 같은 CC0 | 창고 벽체·열린 셔터. 셔터는 문틀 전체가 아니라 상단부이므로 장면에서 벽체와 조합함 |
| `public/assets/models/delivery.glb`, `truck.glb` | 기존 [Kenney Car Kit](https://kenney.nl/assets/car-kit) 파일 재사용 | 기존 CC0·`public/assets/models/Kenney-LICENSE.txt` 보존 | `delivery`는 밀폐 화물밴, `truck`은 픽업. 재다운로드하지 않음 |
| `public/assets/game-v2/crate.glb`, `pallet.glb` | 기존 [KayKit Medieval Hexagon](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) 파일 재사용 | 기존 CC0·`KayKit-Hexagon-LICENSE.txt` 보존 | 적재 실루엣을 위한 화물 상자·팔레트만 보완. 중세 건물·소품은 사용하지 않음 |

신규 16개 총 **482,036 bytes / 3,584 triangles**. 모두 XZ 중심·Y 바닥 0으로 정규화했고, 최대 256×256 PNG 팔레트를 GLB 안에 포함했다. 공통 재질 roughness는 .76이며 외부 이미지·버퍼 의존은 16개 중 0개다. 팔·집게 노드 계층을 보존했다. 모델별 크기·파일 크기·삼각형·노드·의미와 재사용 경로는 `public/assets/industrial/manifest.json`에 있다.

다운로드는 `python3 ~/.codex/scripts/asset_fetch.py url <공식ZIP> --source "Kenney Factory Kit 3.0" --license CC0-1.0 --out file`로 공식 원본을 캐시에 받았다. 제품 폴더에는 선택한 16 GLB·manifest·라이선스만 배치한다. 원팩 ZIP·홍보 이미지·비교 이미지는 제품에 포함하지 않는다. 일본 후보 프리뷰는 검토용 `artifacts/industrial-assets/japan-reference.jpg`에만 있다.

재현: `python3 scripts/pack-industrial-assets.py <공식원팩해제경로>`; 검증: `node scripts/preview-industrial-assets.mjs`. 신규 16종과 재사용 4종 **20개 중 20개**를 headless Chromium/GLTFLoader로 렌더했고, JS 오류 0·접지 20/20이다. 증거는 ignored `artifacts/industrial-assets/render-audit.json`, `all-models.png`다. 이 에셋 단독 렌더와 실제 운영 씬 연결 검증은 구분한다. 실제 씬의 모델 참조와 상태별 동작은 `src/world/World.tsx` 통합 검증에서 확인한다.
