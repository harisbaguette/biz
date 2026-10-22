# Pattove main 적용

정본은 `/Volumes/public/디자인시스템/실행관리(Ops-Run)`의 **main 0.8.0 / Trial**이다. 상위 폴더의 옛 스타일 표지·카탈로그와 구분한다.

- `vendor/`: 공식 `src/registry/r/pattove-main-*-react.json` 10개에서 필요한 CSS·React 의존성만 가져왔다. 파일 내용은 레지스트리의 원문 그대로다.
- `vendor/react/*.d.ts`: 소비 프로젝트에서 추가한 TypeScript 선언이다. 원본 JavaScript의 런타임이나 props를 바꾸지 않는다.
- `root-tokens.css`: 원본 토큰 선언을 애플리케이션 루트에도 제공하는 생성 파일이다.
- `adapter.css`: 기존 `--ui-*` 이름을 Pattove `--p-*` 역할에 연결한다. 새 화면은 `--p-*`를 직접 쓴다.
- `components.ts`: 정식 React 컴포넌트의 내보내기다. 접근성·입력 상태·loading 동작은 원본 구현을 사용한다.
- `../ui/Icons.tsx`: 기존 코드의 아이콘 이름을 Pattove의 민트 세라믹 일러스트 ID로 연결한다. 48개 이름, 47개 정본 이미지다. 일러스트를 선화로 재제작하거나 필터로 착색하지 않는다.

앱에서 `index.css`를 가져오고 루트에 `className="ds" data-style="main"`을 둔다. `npm run design:sync`로 원본을 동기화하며 `npm run design:check`로 CSS·JSX·폰트·아이콘 이미지 전부를 확인한다. 원본 위치 변경 시 `PATTOVE_DESIGN_SYSTEM`을 지정한다. 원본에 접근하지 못한 상태에서는 출처 일치를 확인했다고 주장하지 않는다.

```tsx
import { Button, IconButton, Input } from './design-system/components';
import { Package } from './ui/Icons';

<Button variant="primary" loading={sending} onClick={send}>제출</Button>
<IconButton label="재고" variant="outline" onClick={openStock}>
  <Package size={32} />
</IconButton>
<Input name="quantity" type="number" min={1} aria-label="제출 수량" />
```

아이콘은 `<img>`를 반환한다. `size`, `className`, `style`, `aria-label` 등 이미지 속성을 받는다. `strokeWidth`, `absoluteStrokeWidth`, `color`는 기존 호출부 호환용이며 정본 일러스트를 바꾸지 않는다. 24~40px에서는 96px 원본을 사용한다. 상태를 그림의 색만으로 전달하지 않고 이름·선택·실패 표시를 함께 둔다.

색·타이포·크기·모서리·그림자는 원본 `--p-*` 토큰을 따른다. 주요 행동 높이는 `--p-control-size-md`(48px), 최솟값은 `--p-control-size-sm`(44px), 컨트롤 모서리는 `--p-control-radius`(16px), 패널은 `--p-radius`(24px)다. 공식 명세는 정본 `문서/메인 스타일 명세.md`다.
