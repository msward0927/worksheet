// 아래 가운데에 떠 있는 도구 막대

import { useStore } from '../store';
import type { Tool } from '../types';
import { Icon } from './icons';

export const TOOLS: { tool: Tool; label: string; key: string; icon: () => JSX.Element }[] = [
  { tool: 'select', label: '선택', key: 'V', icon: Icon.select },
  { tool: 'hand', label: '화면 이동', key: 'H', icon: Icon.hand },
  { tool: 'rect', label: '워크박스', key: 'R', icon: Icon.rect },
  { tool: 'ellipse', label: '원형 워크박스', key: 'O', icon: Icon.ellipse },
  { tool: 'text', label: '텍스트', key: 'T', icon: Icon.text },
  { tool: 'sticky', label: '메모지', key: 'S', icon: Icon.sticky },
  { tool: 'number', label: '숫자 박스', key: 'N', icon: Icon.number },
  { tool: 'formula', label: '수식 박스', key: 'F', icon: () => <span className="fx">fx</span> },
  { tool: 'checklist', label: '체크 박스', key: 'C', icon: Icon.checklist },
  { tool: 'image', label: '이미지', key: 'I', icon: Icon.image },
  { tool: 'connect', label: '연결선', key: 'L', icon: Icon.connect },
];

const GROUP_END: Tool[] = ['hand', 'sticky', 'checklist'];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  return (
    <nav className="dock" aria-label="도구">
      {TOOLS.map((t) => (
        <span key={t.tool} style={{ display: 'contents' }}>
          <button
            className={`dock-btn${tool === t.tool ? ' on' : ''}`}
            aria-label={`${t.label} (${t.key})`}
            aria-pressed={tool === t.tool}
            data-tip={`${t.label}  ${t.key}`}
            data-tip-up=""
            onClick={() => useStore.getState().setTool(t.tool)}
          >
            <t.icon />
          </button>
          {GROUP_END.includes(t.tool) && <span className="dock-sep" />}
        </span>
      ))}
    </nav>
  );
}
