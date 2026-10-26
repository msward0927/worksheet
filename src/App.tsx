import { useEffect } from 'react';
import { Canvas, pasteFallback } from './components/Canvas';
import { Home } from './components/Home';
import { PropertiesPanel } from './components/PropertiesPanel';
import { TOOLS, Toolbar } from './components/Toolbar';
import { SettingsDialog } from './components/SettingsDialog';
import { SettingsButton, ThemeButton, TopBar, ZoomControls } from './components/TopBar';
import { newFromTemplate, openContent, openFromDialog, saveDoc } from './fileOps';
import { fileNameOf, platform } from './platform';
import { useStore } from './store';
import { TEMPLATES } from './templates';
import { BASE_DOT, fitView, setZoom, zoomBy } from './viewport';

function isTyping(el: EventTarget | null) {
  return el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === ',') {
        e.preventDefault();
        s.openSettings();
        return;
      }
      // 텍스트 박스 글자 꾸밈 (편집 중에도 동작)
      if (mod && (key === 'b' || key === 'i' || key === 'u') && !s.settingsOpen && s.screen === 'editor') {
        const field = ({ b: 'bold', i: 'italic', u: 'underline' } as const)[key];
        const texts = s.doc.boxes.filter((b) => s.selected.includes(b.id) && b.kind === 'text');
        if (texts.length > 0) {
          e.preventDefault();
          const on = !texts.every((b) => b[field]);
          s.updateBoxes(
            texts.map((b) => b.id),
            { [field]: on },
          );
          return;
        }
      }
      // 설정 창이 열려 있으면 Esc 로 닫는 것 말고는 캔버스 단축키를 쓰지 않는다
      if (s.settingsOpen) {
        if (e.key === 'Escape') s.closeSettings();
        return;
      }

      // 입력 중에도 동작하는 단축키
      if (mod && key === 's') {
        e.preventDefault();
        if (s.screen === 'editor') void saveDoc(e.shiftKey);
        return;
      }
      if (mod && key === 'o') {
        e.preventDefault();
        void openFromDialog();
        return;
      }
      if (mod && key === 'n') {
        e.preventDefault();
        newFromTemplate(TEMPLATES[0]);
        return;
      }
      if (s.screen !== 'editor' || isTyping(e.target)) return;

      if (mod) {
        if (key === 'z' && !e.shiftKey) s.undo();
        else if ((key === 'z' && e.shiftKey) || key === 'y') s.redo();
        else if (key === 'd') s.duplicate();
        else if (key === 'a') s.select(s.doc.boxes.map((b) => b.id));
        else if (key === 'c') s.copy();
        else if (key === 'v') {
          pasteFallback();
          return;
        } else if (key === '0') setZoom(1);
        else if (key === '1') fitView();
        else if (key === '=' || key === '+') zoomBy(1.25);
        else if (key === '-') zoomBy(0.8);
        else return;
        e.preventDefault();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        s.deleteSelected();
        return;
      }
      if (e.key === 'Escape') {
        if (s.tool !== 'select') s.setTool('select');
        else s.select([]);
        return;
      }
      if (e.key === 'Enter' && s.selected.length === 1) {
        e.preventDefault();
        s.setEditing(s.selected[0]);
        return;
      }
      if (e.key.startsWith('Arrow') && s.selected.length > 0) {
        e.preventDefault();
        // 방향키는 1px, Shift+방향키는 점 한 칸씩 옮긴다
        const step = e.shiftKey ? BASE_DOT : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        s.moveBy(s.selected, dx, dy, 'nudge');
        return;
      }
      if (e.altKey || e.repeat) return;
      const t = TOOLS.find((x) => x.key.toLowerCase() === key);
      if (t) s.setTool(t.tool);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** 창 제목, 저장 안 됨 표시, 닫기 전 저장을 메인 프로세스와 맞춘다 */
function useDesktopSync() {
  const dirty = useStore((s) => s.dirty);
  const title = useStore((s) => (s.filePath ? fileNameOf(s.filePath) : s.doc.title));
  const screen = useStore((s) => s.screen);
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    platform.setTheme(theme);
  }, [theme]);
  useEffect(() => platform.setDirty(dirty), [dirty]);
  useEffect(() => {
    platform.setTitle(screen === 'editor' ? `${dirty ? '● ' : ''}${title || '제목 없음'} — Worksheet` : 'Worksheet');
  }, [title, dirty, screen]);

  useEffect(() => {
    platform.onSaveAndClose(async () => {
      if (await saveDoc()) platform.forceClose();
    });
    // 실행할 때 .wsht 파일을 넘겨받았다면 바로 연다
    platform.initialFile().then((f) => f && openContent(f.content, f.path));
  }, []);
}

export function App() {
  const screen = useStore((s) => s.screen);
  const toast = useStore((s) => s.toast);
  const settingsOpen = useStore((s) => s.settingsOpen);
  useKeyboard();
  useDesktopSync();

  return (
    <div className="app">
      {screen === 'home' ? (
        <>
          <header className="topbar">
            <div className="brand static">
              <span className="logo" aria-hidden="true">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} className={i === 4 ? 'accent' : ''} />
                ))}
              </span>
              <span className="brand-name">Worksheet</span>
            </div>
            <div className="spacer" />
            <ThemeButton />
            <SettingsButton />
          </header>
          <Home />
        </>
      ) : (
        <>
          <TopBar />
          <div className="workspace">
            <Toolbar />
            <div className="canvas-wrap">
              <Canvas />
              <ZoomControls />
            </div>
            <PropertiesPanel />
          </div>
        </>
      )}
      {settingsOpen && <SettingsDialog />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
