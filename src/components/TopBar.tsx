// 위쪽 막대: 메뉴, 문서 제목과 저장 상태, 실행 취소/다시 실행

import { useEffect, useRef, useState } from 'react';
import { newFromTemplate, openFromDialog, saveDoc } from '../fileOps';
import { fileNameOf } from '../platform';
import { useStore } from '../store';
import { TEMPLATES } from '../templates';
import { fitView, setZoom, zoomBy } from '../viewport';
import { Icon } from './icons';

interface Item {
  label: string;
  shortcut?: string;
  run: () => void;
  checked?: boolean;
  divider?: boolean;
}

function Menu({ label, items }: { label: string; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={`menu-btn${open ? ' on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        {label}
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {items.map((it, i) => (
            <div key={i}>
              {it.divider && <div className="menu-divider" />}
              <button
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setOpen(false);
                  it.run();
                }}
              >
                <span className="menu-check">{it.checked ? '✓' : ''}</span>
                <span>{it.label}</span>
                {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ThemeButton() {
  const theme = useStore((s) => s.theme);
  const dark = theme === 'dark';
  return (
    <button
      className="icon-btn"
      onClick={() => useStore.getState().setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? '밝은 테마로' : '어두운 테마로'}
      title={dark ? '밝은 테마로' : '어두운 테마로'}
    >
      {dark ? <Icon.sun /> : <Icon.moon />}
    </button>
  );
}

export function TopBar() {
  const title = useStore((s) => s.doc.title);
  const filePath = useStore((s) => s.filePath);
  const dirty = useStore((s) => s.dirty);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const snapOn = useStore((s) => s.snap);
  const theme = useStore((s) => s.theme);
  const s = useStore.getState();

  return (
    <header className="topbar">
      <button className="brand" onClick={() => s.goHome()} title="시작 화면으로">
        <span className="logo" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className={i === 4 ? 'accent' : ''} />
          ))}
        </span>
        <span className="brand-name">Worksheet</span>
      </button>
      <nav className="menus" aria-label="메뉴">
        <Menu
          label="파일"
          items={[
            { label: '새 워크시트', shortcut: 'Ctrl+N', run: () => newFromTemplate(TEMPLATES[0]) },
            { label: '열기…', shortcut: 'Ctrl+O', run: () => void openFromDialog() },
            { label: '저장', shortcut: 'Ctrl+S', run: () => void saveDoc(), divider: true },
            { label: '다른 이름으로 저장…', shortcut: 'Ctrl+Shift+S', run: () => void saveDoc(true) },
            { label: '시작 화면', run: () => s.goHome(), divider: true },
          ]}
        />
        <Menu
          label="편집"
          items={[
            { label: '실행 취소', shortcut: 'Ctrl+Z', run: () => s.undo() },
            { label: '다시 실행', shortcut: 'Ctrl+Y', run: () => s.redo() },
            { label: '복사', shortcut: 'Ctrl+C', run: () => s.copy(), divider: true },
            { label: '붙여넣기', shortcut: 'Ctrl+V', run: () => s.paste() },
            { label: '복제', shortcut: 'Ctrl+D', run: () => s.duplicate() },
            { label: '삭제', shortcut: 'Delete', run: () => s.deleteSelected() },
            { label: '모두 선택', shortcut: 'Ctrl+A', run: () => s.select(useStore.getState().doc.boxes.map((b) => b.id)), divider: true },
          ]}
        />
        <Menu
          label="보기"
          items={[
            { label: '확대', shortcut: 'Ctrl++', run: () => zoomBy(1.25) },
            { label: '축소', shortcut: 'Ctrl+-', run: () => zoomBy(0.8) },
            { label: '100%', shortcut: 'Ctrl+0', run: () => setZoom(1) },
            { label: '화면에 맞추기', shortcut: 'Ctrl+1', run: () => fitView() },
            { label: '항상 점에 맞추기', checked: snapOn, run: () => s.setSnap(!snapOn), divider: true },
            { label: '밝은 테마', checked: theme === 'light', run: () => s.setTheme('light'), divider: true },
            { label: '어두운 테마', checked: theme === 'dark', run: () => s.setTheme('dark') },
          ]}
        />
      </nav>
      <div className="doc-title">
        <span className="doc-name">{filePath ? fileNameOf(filePath) : title || '제목 없음'}</span>
        <span className="doc-ext">.wsht</span>
        {dirty ? (
          <span className="doc-status">저장 안 됨</span>
        ) : filePath ? (
          <span className="doc-status saved">
            <Icon.check /> 저장됨
          </span>
        ) : null}
      </div>
      <div className="top-actions">
        <ThemeButton />
        <button className="icon-btn" onClick={() => s.undo()} disabled={!canUndo} aria-label="실행 취소" title="실행 취소 (Ctrl+Z)">
          <Icon.undo />
        </button>
        <button className="icon-btn" onClick={() => s.redo()} disabled={!canRedo} aria-label="다시 실행" title="다시 실행 (Ctrl+Y)">
          <Icon.redo />
        </button>
        <button className="btn" onClick={() => void saveDoc()}>
          저장
        </button>
      </div>
    </header>
  );
}

export function ZoomControls() {
  const zoom = useStore((s) => s.doc.view.zoom);
  return (
    <div className="zoom-controls">
      <button onClick={() => zoomBy(0.8)} aria-label="축소" title="축소 (Ctrl+-)">
        −
      </button>
      <button className="zoom-value" onClick={() => setZoom(1)} title="100% 로 (Ctrl+0)">
        {Math.round(zoom * 100)}%
      </button>
      <button onClick={() => zoomBy(1.25)} aria-label="확대" title="확대 (Ctrl++)">
        +
      </button>
      <span className="zoom-divider" />
      <button className="zoom-fit" onClick={() => fitView()} title="화면에 맞추기 (Ctrl+1)">
        화면 맞춤
      </button>
    </div>
  );
}
