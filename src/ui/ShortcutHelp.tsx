import { Switch } from "../design-system/components";
import { Modal } from "./Primitives";

const shortcuts = [
  ["Esc", "창 닫기 → 계정 선택 해제 → 전체 보기"],
  ["0 / Home", "13개 계정 전체 보기"],
  ["1 – 9", "해당 번호 계정 선택"],
  ["[ / ]", "이전 / 다음 계정 · 13개 순환"],
  ["↑ ↓ ← →", "화면 이동"],
  ["+ / −", "확대 / 축소"],
  ["S", "다음 일정"],
  ["H", "제출·심사 이력"],
  ["A", "자동화 설정"],
  ["F", "월 수익"],
  ["R", "화면 상태 새로고침"],
  ["?", "이 안내 열기"],
];

export function ShortcutHelp({ enabled, onChange, onClose }: { enabled: boolean; onChange: (enabled: boolean) => void; onClose: () => void }) {
  return <Modal title="단축키·조작 안내" onClose={onClose}>
    <div className="shortcut-setting"><span>단축키 사용</span><Switch aria-label="단축키 사용" checked={enabled} onChange={() => onChange(!enabled)}/></div>
    <dl className="shortcut-list">{shortcuts.map(([keys, description]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{description}</dd></div>)}</dl>
    <p className="form-help">입력 중에는 적용하지 않습니다. Esc는 단축키를 꺼도 가장 위의 창만 닫습니다. 한/영 전환과 관계없이 같은 키 위치를 사용합니다.</p>
    <p className="form-help">마우스·터치: 끌어서 이동, 휠·두 손가락으로 확대. 선택한 계정은 좌우 버튼으로 바꿀 수 있습니다. R은 표시만 갱신하며 계정 재확인을 요청하지 않습니다.</p>
  </Modal>;
}
