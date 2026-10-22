# 디자인 시스템 자산 출처

| 대상 | 정본·사용 근거 |
|---|---|
| CSS·React 10개 부품과 의존성 | 사용자가 지정한 `/Volumes/public/디자인시스템/실행관리(Ops-Run)`의 공식 shadcn 레지스트리. 원본 정본 버전 0.8.0 / Trial. 선택 부품·경로·SHA-256은 `vendor/manifest.json` |
| 47개 민트 세라믹 일러스트 | 정본 `assets/icons/illustrated/manifest.json`의 ID. 공식 `scripts/lib/illustration-store.mjs`의 `asset(id,{format:'webp',size:96})`로 내보낸 생성 자산. 외부 Lucide SVG를 다시 그리거나 lucide-react 패키지를 이 이미지의 출처로 표시하지 않음. 정본 자산 장부는 `실행관리(Ops-Run)/ASSETS.md` |
| Pretendard Variable | 정본 `assets/fonts/PretendardVariable.woff2`; SIL OFL 원문을 `vendor/fonts/Pretendard-LICENSE.txt`에 동봉 |
| Outfit Variable | 정본 `assets/fonts/Outfit-Variable.woff2`; SIL OFL 원문을 `vendor/fonts/Outfit-OFL.txt`에 동봉 |

정본 생성 일러스트는 라이선스가 다른 별도 아이콘 팩의 원본으로 표시하지 않는다. `ICO-*`·`lucide:*`는 정본 사전의 의미 식별자다. 이번 반입에서 브랜딩 이미지·제품 3D 모델은 다루지 않았다.
