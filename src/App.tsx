import { useEffect } from 'react';
import { Canvas, pasteFallback } from './components/Canvas';
import { Home } from './components/Home';
import { PropertiesPanel } from './components/PropertiesPanel';
import { QuickBar } from './components/QuickBar';
import { SearchPanel } from './components/SearchPanel';
import { TOOLS, Toolbar } from './components/Toolbar';
import { SettingsDialog } from './components/SettingsDialog';
import { TopBar, ZoomControls } from './components/TopBar';
import { docName, flushSave, newFromTemplate, openContent, openFromDialog, saveDoc, startAutosave } from './fileOps';
import { platform } from './platform';
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
        const texts = s.doc.boxes.filter((b) => s.selected.includes(b.id) && (b.kind === 'text' || b.kind === 'shape'));
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
        void newFromTemplate(TEMPLATES[0]);
        return;
      }
      if (s.screen !== 'editor') return;
      if (mod && key === 'f') {
        e.preventDefault();
        s.setSearchOpen(true);
        return;
      }
      if (mod && key === '.') {
        e.preventDefault();
        s.setPanelOpen(!s.panelOpen);
        return;
      }
      if (isTyping(e.target)) return;

      if (mod) {
        if (key === 'z' && !e.shiftKey) s.undo();
        else if ((key === 'z' && e.shiftKey) || key === 'y') s.redo();
        else if (key === 'd') s.duplicate();
        else if (key === 'g' && e.shiftKey) s.ungroupSelected();
        else if (key === 'g') s.groupSelected();
        else if (e.key === 'Enter' && s.selected.length === 1) s.addNext(s.selected[0], 'below');
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
      // Tab: 오른쪽에 이어지는 새 박스
      if (e.key === 'Tab' && s.selected.length === 1) {
        e.preventDefault();
        s.addNext(s.selected[0], 'right');
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

/** 창 제목, 저장 상태, 닫기 전 저장을 메인 프로세스와 맞춘다 */
function useDesktopSync() {
  const dirty = useStore((s) => s.dirty);
  const willAutosave = useStore((s) => s.autosave && s.filePath !== null);
  const title = useStore((s) => docName(s.filePath, s.doc.title));
  const screen = useStore((s) => s.screen);
  const theme = useStore((s) => s.theme);

  useEffect(() => startAutosave(), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    platform.setTheme(theme);
  }, [theme]);
  useEffect(() => platform.setDirty(!dirty ? 'clean' : willAutosave ? 'autosave' : 'unsaved'), [dirty, willAutosave]);
  useEffect(() => {
    platform.setTitle(screen === 'editor' ? `${dirty && !willAutosave ? '● ' : ''}${title} — Worksheet` : 'Worksheet');
  }, [title, dirty, willAutosave, screen]);

  useEffect(() => {
    // 창을 닫을 때: 기다리던 저장을 마치고 닫는다
    platform.onSaveAndClose(async () => {
      const ok = useStore.getState().filePath ? await flushSave() : await saveDoc();
      if (ok || window.confirm('저장하지 못했어요. 그래도 닫을까요?')) platform.forceClose();
    });
    // 실행할 때 .wsht 파일을 넘겨받았다면 바로 연다
    platform.initialFile().then((f) => f && openContent(f.content, f.path));
  }, []);
}

export function App() {
  const screen = useStore((s) => s.screen);
  const toast = useStore((s) => s.toast);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const searchOpen = useStore((s) => s.searchOpen);
  const panelOpen = useStore((s) => s.panelOpen);
  useKeyboard();
  useDesktopSync();

  return (
    <div className="app">
      {screen === 'home' ? (
        <Home />
      ) : (
        <>
          <TopBar />
          <div className="workspace">
            <div className="canvas-wrap">
              <Canvas />
              <ZoomControls />
              <Toolbar />
              <QuickBar />
              {searchOpen && <SearchPanel />}
              {panelOpen && <PropertiesPanel />}
            </div>
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
