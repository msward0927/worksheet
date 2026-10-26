// 앱 전체 상태. 문서(Doc)를 바꾸는 동작은 모두 여기를 거치고, 실행 취소 기록도 여기서 관리한다.

import { create } from 'zustand';
import { cloneBoxes, makeEdge } from './boxes';
import { loadSnap, loadTheme, saveSnap, saveTheme, type Theme } from './theme';
import { adopt, normalizeOrder, reparent, topLevel, translate, withDescendants } from './tree';
import type { Box, Doc, Edge, Tool, View } from './types';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1200;

export type SettingsTab = 'display' | 'canvas' | 'mouse' | 'keys' | 'formula' | 'about';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

interface Clipboard {
  boxes: Box[];
  edges: Edge[];
}

interface State {
  screen: 'home' | 'editor';
  doc: Doc;
  filePath: string | null;
  dirty: boolean;
  tool: Tool;
  selected: string[];
  selectedEdge: string | null;
  editingId: string | null;
  snap: boolean;
  theme: Theme;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  past: Doc[];
  future: Doc[];
  clipboard: Clipboard | null;
  toast: string | null;

  openDoc(doc: Doc, path: string | null): void;
  goHome(): void;
  markSaved(path: string): void;
  setTitle(title: string): void;
  setView(view: View): void;
  setTool(tool: Tool): void;
  setSnap(snap: boolean): void;
  setTheme(theme: Theme): void;
  openSettings(tab?: SettingsTab): void;
  closeSettings(): void;
  setEditing(id: string | null): void;
  select(ids: string[], edge?: string | null): void;
  showToast(msg: string): void;

  /** 지금 상태를 실행 취소 기록에 남긴다. 드래그 시작처럼 연속된 변경의 처음에 부른다 */
  checkpoint(): void;
  /** 기록을 남기면서 문서를 바꾼다. key 가 같은 변경이 잇달아 오면 하나로 합친다 (글자 입력 등) */
  change(recipe: (doc: Doc) => Doc, key?: string): void;
  /** 기록 없이 문서를 바꾼다. checkpoint() 다음의 드래그 중 변경에 쓴다 */
  changeSilently(recipe: (doc: Doc) => Doc): void;

  addBox(box: Box): void;
  updateBox(id: string, patch: Partial<Box>, key?: string): void;
  updateBoxes(ids: string[], patch: Partial<Box>): void;
  /** 박스들을 자식과 함께 옮기고, 놓인 자리에 맞게 부모를 다시 정한다 */
  moveBy(ids: string[], dx: number, dy: number, key?: string): void;
  /** 내용 없이 편집을 마친 텍스트 박스를 기록 없이 지운다 */
  discardIfEmpty(id: string): void;
  deleteSelected(): void;
  addEdge(from: string, to: string): void;
  updateEdge(id: string, patch: Partial<Edge>, key?: string): void;
  copy(): void;
  paste(at?: { x: number; y: number }): void;
  duplicate(): void;
  bringToFront(): void;
  sendToBack(): void;
  align(mode: AlignMode): void;
  undo(): void;
  redo(): void;
}

let lastKey: string | undefined;
let lastTime = 0;

const replaceBox = (doc: Doc, id: string, patch: Partial<Box>): Doc => ({
  ...doc,
  boxes: doc.boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)),
});

export const useStore = create<State>((set, get) => ({
  screen: 'home',
  doc: { app: 'worksheet', version: 1, title: '제목 없음', boxes: [], edges: [], view: { x: 0, y: 0, zoom: 1 } },
  filePath: null,
  dirty: false,
  tool: 'select',
  selected: [],
  selectedEdge: null,
  editingId: null,
  snap: loadSnap(),
  theme: loadTheme(),
  settingsOpen: false,
  settingsTab: 'display',
  past: [],
  future: [],
  clipboard: null,
  toast: null,

  openDoc(doc, path) {
    lastKey = undefined;
    set({
      screen: 'editor',
      doc,
      filePath: path,
      dirty: false,
      tool: 'select',
      selected: [],
      selectedEdge: null,
      editingId: null,
      past: [],
      future: [],
    });
  },
  goHome() {
    set({ screen: 'home', editingId: null });
  },
  markSaved(path) {
    set({ filePath: path, dirty: false });
  },
  setTitle(title) {
    get().change((d) => ({ ...d, title }), 'title');
  },
  setView(view) {
    set((s) => ({ doc: { ...s.doc, view } }));
  },
  setTool(tool) {
    set({ tool, editingId: null });
  },
  setSnap(snap) {
    saveSnap(snap);
    set({ snap });
  },
  setTheme(theme) {
    saveTheme(theme);
    set({ theme });
  },
  openSettings(tab) {
    set((s) => ({ settingsOpen: true, settingsTab: tab ?? s.settingsTab, editingId: null }));
  },
  closeSettings() {
    set({ settingsOpen: false });
  },
  setEditing(id) {
    lastKey = undefined;
    set({ editingId: id });
  },
  select(ids, edge = null) {
    const s = get();
    set({ selected: ids, selectedEdge: edge, editingId: s.editingId && ids.includes(s.editingId) ? s.editingId : null });
  },
  showToast(msg) {
    set({ toast: msg });
    window.setTimeout(() => {
      if (get().toast === msg) set({ toast: null });
    }, 2600);
  },

  checkpoint() {
    lastKey = undefined;
    set((s) => ({ past: [...s.past, s.doc].slice(-HISTORY_LIMIT), future: [] }));
  },
  change(recipe, key) {
    const now = Date.now();
    const merge = key !== undefined && key === lastKey && now - lastTime < COALESCE_MS;
    lastKey = key;
    lastTime = now;
    set((s) => ({
      doc: recipe(s.doc),
      dirty: true,
      past: merge ? s.past : [...s.past, s.doc].slice(-HISTORY_LIMIT),
      future: [],
    }));
  },
  changeSilently(recipe) {
    set((s) => ({ doc: recipe(s.doc), dirty: true }));
  },

  addBox(box) {
    get().change((d) => {
      // 워크박스 안에 만들면 그 워크박스의 자식이 되고,
      // 새 워크박스가 다른 박스들을 둘러싸면 그 박스들을 안으로 넣는다
      let boxes = reparent([...d.boxes, box], [box.id]);
      if (box.kind === 'shape') boxes = adopt(boxes, box.id);
      return { ...d, boxes };
    });
    set({ selected: [box.id], selectedEdge: null });
  },
  updateBox(id, patch, key) {
    get().change((d) => replaceBox(d, id, patch), key ?? `${id}:${Object.keys(patch).join(',')}`);
  },
  updateBoxes(ids, patch) {
    const set_ = new Set(ids);
    get().change((d) => ({ ...d, boxes: d.boxes.map((b) => (set_.has(b.id) ? { ...b, ...patch } : b)) }));
  },
  moveBy(ids, dx, dy, key) {
    get().change((d) => {
      const moved = translate(d.boxes, ids, dx, dy);
      return { ...d, boxes: reparent(moved, topLevel(moved, ids)) };
    }, key);
  },
  discardIfEmpty(id) {
    const box = get().doc.boxes.find((b) => b.id === id);
    if (!box || box.kind !== 'text' || box.text.trim() || box.name.trim() || box.fill !== 'transparent' || box.stroke !== 'none') return;
    set((s) => ({
      doc: { ...s.doc, boxes: s.doc.boxes.filter((b) => b.id !== id), edges: s.doc.edges.filter((e) => e.from !== id && e.to !== id) },
      selected: s.selected.filter((x) => x !== id),
    }));
  },
  deleteSelected() {
    const { selected, selectedEdge } = get();
    if (selected.length === 0 && !selectedEdge) return;
    // 워크박스를 지우면 안에 든 박스도 함께 지운다
    const ids = withDescendants(get().doc.boxes, selected);
    get().change((d) => ({
      ...d,
      boxes: d.boxes.filter((b) => !ids.has(b.id)),
      edges: d.edges.filter((e) => e.id !== selectedEdge && !ids.has(e.from) && !ids.has(e.to)),
    }));
    set({ selected: [], selectedEdge: null, editingId: null });
  },
  addEdge(from, to) {
    if (from === to) return;
    const exists = get().doc.edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from));
    if (exists) {
      get().showToast('이미 연결된 박스예요');
      return;
    }
    const edge = makeEdge(from, to);
    get().change((d) => ({ ...d, edges: [...d.edges, edge] }));
    set({ selected: [], selectedEdge: edge.id });
  },
  updateEdge(id, patch, key) {
    get().change(
      (d) => ({ ...d, edges: d.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }),
      key ?? `${id}:${Object.keys(patch).join(',')}`,
    );
  },

  copy() {
    const { doc, selected } = get();
    if (selected.length === 0) return;
    const ids = withDescendants(doc.boxes, selected);
    set({
      clipboard: {
        boxes: doc.boxes.filter((b) => ids.has(b.id)),
        edges: doc.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
      },
    });
  },
  paste(at) {
    const clip = get().clipboard;
    if (!clip || clip.boxes.length === 0) return;
    const minX = Math.min(...clip.boxes.map((b) => b.x));
    const minY = Math.min(...clip.boxes.map((b) => b.y));
    const dx = at ? at.x - minX : 24;
    const dy = at ? at.y - minY : 24;
    const cloned = cloneBoxes(clip.boxes, clip.edges, get().doc.boxes);
    const boxes = cloned.boxes.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy }));
    const edges = cloned.edges;
    const pastedIds = new Set(boxes.map((b) => b.id));
    const roots = boxes.filter((b) => !b.parentId || !pastedIds.has(b.parentId)).map((b) => b.id);
    get().change((d) => ({ ...d, boxes: reparent([...d.boxes, ...boxes], roots), edges: [...d.edges, ...edges] }));
    // 다음 붙여넣기가 같은 자리에 겹치지 않도록 클립보드도 옮겨 둔다
    set({ selected: roots, selectedEdge: null, clipboard: at ? clip : { boxes, edges } });
  },
  duplicate() {
    const prev = get().clipboard;
    get().copy();
    get().paste();
    set({ clipboard: prev });
  },
  bringToFront() {
    const ids = new Set(get().selected);
    get().change((d) => ({ ...d, boxes: normalizeOrder([...d.boxes.filter((b) => !ids.has(b.id)), ...d.boxes.filter((b) => ids.has(b.id))]) }));
  },
  sendToBack() {
    const ids = new Set(get().selected);
    get().change((d) => ({ ...d, boxes: normalizeOrder([...d.boxes.filter((b) => ids.has(b.id)), ...d.boxes.filter((b) => !ids.has(b.id))]) }));
  },
  align(mode) {
    const ids = new Set(get().selected);
    const boxes = get().doc.boxes.filter((b) => ids.has(b.id));
    if (boxes.length < 2) return;
    const left = Math.min(...boxes.map((b) => b.x));
    const right = Math.max(...boxes.map((b) => b.x + b.w));
    const top = Math.min(...boxes.map((b) => b.y));
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    const pos = (b: Box): Partial<Box> => {
      switch (mode) {
        case 'left':
          return { x: left };
        case 'right':
          return { x: right - b.w };
        case 'hcenter':
          return { x: (left + right) / 2 - b.w / 2 };
        case 'top':
          return { y: top };
        case 'bottom':
          return { y: bottom - b.h };
        case 'vcenter':
          return { y: (top + bottom) / 2 - b.h / 2 };
      }
    };
    get().change((d) => {
      let next = d.boxes;
      for (const b of boxes) {
        const p = pos(b);
        next = translate(next, [b.id], (p.x ?? b.x) - b.x, (p.y ?? b.y) - b.y);
      }
      return { ...d, boxes: reparent(next, topLevel(next, ids)) };
    });
  },

  undo() {
    const { past, doc, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    lastKey = undefined;
    set({
      doc: { ...prev, view: doc.view },
      past: past.slice(0, -1),
      future: [doc, ...future],
      dirty: true,
      editingId: null,
      selected: get().selected.filter((id) => prev.boxes.some((b) => b.id === id)),
      selectedEdge: null,
    });
  },
  redo() {
    const { past, doc, future } = get();
    if (future.length === 0) return;
    const next = future[0];
    lastKey = undefined;
    set({
      doc: { ...next, view: doc.view },
      past: [...past, doc],
      future: future.slice(1),
      dirty: true,
      editingId: null,
      selected: get().selected.filter((id) => next.boxes.some((b) => b.id === id)),
      selectedEdge: null,
    });
  },
}));
