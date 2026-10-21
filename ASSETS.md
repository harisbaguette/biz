# 사용 에셋

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
