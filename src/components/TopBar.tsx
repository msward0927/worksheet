// 위 막대: 내 워크시트로 가기, 메뉴, 제목(파일 이름) 바로 고치기, 저장 상태, 찾기 · 실행 취소 · 내보내기 · 테마 · 설정 · 속성 패널

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { docName, newFromTemplate, openFromDialog, renameDoc, saveDoc } from '../fileOps';
import { exportDoc } from '../exporter';
import { useStore } from '../store';
import { TEMPLATES } from '../templates';
import { fitView, setZoom, zoomBy } from '../viewport';
import { Icon } from './icons';

export interface MenuItem {
  label: string;
  shortcut?: string;
  run: () => void;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  /** 이 항목 위에 구분선 */
  divider?: boolean;
  /** 이 항목 위에 작은 제목 */
  group?: string;
}

/** 눌러서 여는 메뉴. trigger 는 버튼 안에 들어갈 내용 */
export function Menu({ trigger, items, label, align = 'left', btnClass = 'icon-btn', tip }: { trigger: ReactNode; items: MenuItem[]; label: string; align?: 'left' | 'right'; btnClass?: string; tip?: string }) {
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
      <button className={`${btnClass}${open ? ' on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label={label} data-tip={open ? undefined : tip}>
        {trigger}
      </button>
      {open && (
        <div className={`menu-pop${align === 'right' ? ' right' : ''}`} role="menu">
          {items.map((it, i) => (
            <div key={i}>
              {it.divider && <div className="menu-divider" />}
              {it.group && <div className="menu-label">{it.group}</div>}
              <button
                role="menuitem"
                className={`menu-item${it.danger ? ' danger' : ''}`}
                disabled={it.disabled}
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

export const Logo = () => (
  <span className="logo" aria-hidden="true">
    {Array.from({ length: 9 }, (_, i) => (
      <span key={i} className={i === 4 ? 'accent' : ''} />
    ))}
  </span>
);

export function ThemeButton() {
  const dark = useStore((s) => s.theme === 'dark');
  return (
    <button
      className="icon-btn"
      onClick={() => useStore.getState().setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? '밝은 테마로' : '어두운 테마로'}
      data-tip={dark ? '밝은 테마' : '어두운 테마'}
    >
      {dark ? <Icon.sun /> : <Icon.moon />}
    </button>
  );
}

export function SettingsButton() {
  return (
    <button className="icon-btn" onClick={() => useStore.getState().openSettings()} aria-label="설정" data-tip="설정  Ctrl+,">
      <Icon.gear />
    </button>
  );
}

/** 제목: 고치고 Enter 를 누르거나 다른 곳을 누르면 파일 이름도 함께 바뀐다 */
function TitleEdit() {
  const name = useStore((s) => docName(s.filePath, s.doc.title));
  const [draft, setDraft] = useState(name);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(name);
  }, [name, focused]);
  const commit = () => {
    setFocused(false);
    if (draft.trim() && draft.trim() !== name) void renameDoc(draft.trim());
    else setDraft(name);
  };
  return (
    <label className="autosize title-edit" data-value={draft}>
      <input
        value={draft}
        size={1}
        aria-label="워크시트 이름"
        spellCheck={false}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(name);
            setFocused(false);
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
          }
        }}
      />
    </label>
  );
}

function SaveStatus() {
  const dirty = useStore((s) => s.dirty);
  const saveState = useStore((s) => s.saveState);
  const autosave = useStore((s) => s.autosave);
  const filePath = useStore((s) => s.filePath);
  let cls = '';
  let text = '저장됨';
  if (saveState === 'error') {
    cls = 'error';
    text = '저장 실패';
  } else if (saveState === 'saving' || (dirty && autosave && filePath)) {
    cls = 'saving';
    text = '저장 중…';
  } else if (dirty) {
    cls = 'unsaved';
    text = '저장 안 됨 · Ctrl+S';
  }
  return (
    <span className={`save-status ${cls}`} role="status" title={autosave ? '바뀔 때마다 자동으로 저장돼요' : '자동 저장이 꺼져 있어요 (설정 → 화면)'}>
      {text}
    </span>
  );
}

export function TopBar() {
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const snapOn = useStore((s) => s.snap);
  const panelOpen = useStore((s) => s.panelOpen);
  const searchOpen = useStore((s) => s.searchOpen);
  const hasSel = useStore((s) => s.selected.length > 0);
  const s = useStore.getState();

  return (
    <header className="topbar">
      <button className="brand" onClick={() => s.goHome()} data-tip="내 워크시트" aria-label="내 워크시트로">
        <Logo />
      </button>
      <Menu
        label="메뉴"
        tip="메뉴"
        trigger={<Icon.menu />}
        items={[
          { group: '파일', label: '새 워크시트', shortcut: 'Ctrl+N', run: () => void newFromTemplate(TEMPLATES[0]) },
          { label: '열기…', shortcut: 'Ctrl+O', run: () => void openFromDialog() },
          { label: '다른 이름으로 저장…', shortcut: 'Ctrl+Shift+S', run: () => void saveDoc(true) },
          { label: '내 워크시트', run: () => s.goHome() },
          { group: '편집', divider: true, label: '실행 취소', shortcut: 'Ctrl+Z', run: () => s.undo(), disabled: !canUndo },
          { label: '다시 실행', shortcut: 'Ctrl+Y', run: () => s.redo(), disabled: !canRedo },
          { label: '복제', shortcut: 'Ctrl+D', run: () => s.duplicate(), disabled: !hasSel },
          { label: '워크박스로 묶기', shortcut: 'Ctrl+G', run: () => s.groupSelected(), disabled: !hasSel },
          { label: '묶음 풀기', shortcut: 'Ctrl+Shift+G', run: () => s.ungroupSelected(), disabled: !hasSel },
          { label: '모두 선택', shortcut: 'Ctrl+A', run: () => s.select(useStore.getState().doc.boxes.map((b) => b.id)) },
          { label: '삭제', shortcut: 'Delete', run: () => s.deleteSelected(), disabled: !hasSel, danger: true },
          { group: '보기', divider: true, label: '찾기 · 목차', shortcut: 'Ctrl+F', run: () => s.setSearchOpen(true) },
          { label: '화면에 맞추기', shortcut: 'Ctrl+1', run: () => fitView() },
          { label: '100% 로 보기', shortcut: 'Ctrl+0', run: () => setZoom(1) },
          { label: '항상 점에 맞추기', checked: snapOn, run: () => s.setSnap(!snapOn) },
          { label: '속성 패널', shortcut: 'Ctrl+.', checked: panelOpen, run: () => s.setPanelOpen(!panelOpen) },
          { divider: true, label: '설정', shortcut: 'Ctrl+,', run: () => s.openSettings() },
        ]}
      />
      <div className="tb-sep" />
      <div className="title-wrap">
        <TitleEdit />
        <SaveStatus />
      </div>
      <div className="spacer" />
      <div className="tb-group">
        <button className={`icon-btn${searchOpen ? ' on' : ''}`} onClick={() => s.setSearchOpen(!searchOpen)} aria-label="찾기" data-tip="찾기 · 목차  Ctrl+F">
          <Icon.search />
        </button>
        <button className="icon-btn" onClick={() => s.undo()} disabled={!canUndo} aria-label="실행 취소" data-tip="실행 취소  Ctrl+Z">
          <Icon.undo />
        </button>
        <button className="icon-btn" onClick={() => s.redo()} disabled={!canRedo} aria-label="다시 실행" data-tip="다시 실행  Ctrl+Y">
          <Icon.redo />
        </button>
      </div>
      <div className="tb-sep" />
      <div className="tb-group">
        <Menu
          label="내보내기"
          tip="내보내기"
          align="right"
          trigger={<Icon.download />}
          items={[
            { group: '전체', label: 'PNG 그림으로', run: () => void exportDoc('png', false) },
            { label: 'PDF 로', run: () => void exportDoc('pdf', false) },
            { group: '고른 박스만', divider: true, label: 'PNG 그림으로', run: () => void exportDoc('png', true), disabled: !hasSel },
            { label: 'PDF 로', run: () => void exportDoc('pdf', true), disabled: !hasSel },
          ]}
        />
        <ThemeButton />
        <SettingsButton />
        <button className={`icon-btn${panelOpen ? ' on' : ''}`} onClick={() => s.setPanelOpen(!panelOpen)} aria-label="속성 패널" data-tip="속성 패널  Ctrl+.">
          <Icon.panel />
        </button>
      </div>
    </header>
  );
}

export function ZoomControls() {
  const zoom = useStore((s) => s.doc.view.zoom);
  return (
    <div className="zoom-controls">
      <button onClick={() => zoomBy(0.8)} aria-label="축소" data-tip="축소  Ctrl+-" data-tip-up="">
        −
      </button>
      <button className="zoom-value" onClick={() => setZoom(1)} data-tip="100% 로  Ctrl+0" data-tip-up="">
        {Math.round(zoom * 100)}%
      </button>
      <button onClick={() => zoomBy(1.25)} aria-label="확대" data-tip="확대  Ctrl++" data-tip-up="">
        +
      </button>
      <span className="zoom-divider" />
      <button className="zoom-fit" onClick={() => fitView()} data-tip="화면에 맞추기  Ctrl+1" data-tip-up="">
        맞춤
      </button>
    </div>
  );
}
