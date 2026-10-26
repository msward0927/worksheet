// 앱 전체 상태. 문서(Doc)를 바꾸는 동작은 모두 여기를 거치고, 실행 취소 기록도 여기서 관리한다.

import { create } from 'zustand';
import { makeEdge, uid } from './boxes';
import type { Box, Doc, Edge, Tool, View } from './types';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1200;

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
  snap: true,
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
    set({ snap });
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
    get().change((d) => ({ ...d, boxes: [...d.boxes, box] }));
    set({ selected: [box.id], selectedEdge: null });
  },
  updateBox(id, patch, key) {
    get().change((d) => replaceBox(d, id, patch), key ?? `${id}:${Object.keys(patch).join(',')}`);
  },
  updateBoxes(ids, patch) {
    const set_ = new Set(ids);
    get().change((d) => ({ ...d, boxes: d.boxes.map((b) => (set_.has(b.id) ? { ...b, ...patch } : b)) }));
  },
  deleteSelected() {
    const { selected, selectedEdge } = get();
    if (selected.length === 0 && !selectedEdge) return;
    const ids = new Set(selected);
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
    const ids = new Set(selected);
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
    const idMap = new Map<string, string>();
    const boxes = clip.boxes.map((b) => {
      const id = uid();
      idMap.set(b.id, id);
      return { ...b, id, x: b.x + dx, y: b.y + dy, items: b.items.map((i) => ({ ...i, id: uid() })) };
    });
    const edges = clip.edges.map((e) => ({ ...e, id: uid(), from: idMap.get(e.from)!, to: idMap.get(e.to)! }));
    get().change((d) => ({ ...d, boxes: [...d.boxes, ...boxes], edges: [...d.edges, ...edges] }));
    // 다음 붙여넣기가 같은 자리에 겹치지 않도록 클립보드도 옮겨 둔다
    set({ selected: boxes.map((b) => b.id), selectedEdge: null, clipboard: at ? clip : { boxes, edges } });
  },
  duplicate() {
    const prev = get().clipboard;
    get().copy();
    get().paste();
    set({ clipboard: prev });
  },
  bringToFront() {
    const ids = new Set(get().selected);
    get().change((d) => ({ ...d, boxes: [...d.boxes.filter((b) => !ids.has(b.id)), ...d.boxes.filter((b) => ids.has(b.id))] }));
  },
  sendToBack() {
    const ids = new Set(get().selected);
    get().change((d) => ({ ...d, boxes: [...d.boxes.filter((b) => ids.has(b.id)), ...d.boxes.filter((b) => !ids.has(b.id))] }));
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
    get().change((d) => ({ ...d, boxes: d.boxes.map((b) => (ids.has(b.id) ? { ...b, ...pos(b) } : b)) }));
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
