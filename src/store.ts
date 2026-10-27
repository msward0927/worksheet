// 앱 전체 상태. 문서(Doc)를 바꾸는 동작은 모두 여기를 거치고, 실행 취소 기록도 여기서 관리한다.

import { create } from 'zustand';
import { cloneBoxes, makeBox, makeEdge, uid } from './boxes';
import { intersects } from './geometry';
import { loadAutosave, loadPanel, loadSnap, loadTheme, loadWheel, saveAutosave, savePanel, saveSnap, saveTheme, saveWheel, type Theme, type WheelMode } from './theme';
import { adopt, normalizeOrder, reparent, topLevel, translate, withDescendants } from './tree';
import type { Box, Doc, Edge, Tool, View } from './types';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1200;

export type SettingsTab = 'display' | 'canvas' | 'mouse' | 'keys' | 'formula' | 'about';
export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

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
  /** 문서가 바뀔 때마다 1씩 오른다 (자동 저장이 어느 시점을 저장했는지 알기 위해) */
  rev: number;
  tool: Tool;
  selected: string[];
  selectedEdge: string | null;
  editingId: string | null;
  snap: boolean;
  theme: Theme;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  /** 오른쪽 속성 패널 */
  panelOpen: boolean;
  /** 찾기 · 목차 패널 */
  searchOpen: boolean;
  /** 박스를 끄는 중 (빠른 편집 막대를 숨긴다) */
  interacting: boolean;
  wheelMode: WheelMode;
  autosave: boolean;
  saveState: SaveState;
  savedAt: number | null;
  past: Doc[];
  future: Doc[];
  clipboard: Clipboard | null;
  toast: string | null;

  openDoc(doc: Doc, path: string | null): void;
  goHome(): void;
  /** 저장을 마쳤다. rev 를 주면 저장하는 동안 바뀐 게 없을 때만 '저장됨'으로 바꾼다 */
  markSaved(path: string, rev?: number): void;
  setTitle(title: string): void;
  setView(view: View): void;
  setTool(tool: Tool): void;
  setSnap(snap: boolean): void;
  setTheme(theme: Theme): void;
  openSettings(tab?: SettingsTab): void;
  setPanelOpen(open: boolean): void;
  setSearchOpen(open: boolean): void;
  setInteracting(on: boolean): void;
  setWheelMode(m: WheelMode): void;
  setAutosave(on: boolean): void;
  setSaveState(state: SaveState): void;
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
  updateEdges(ids: string[], patch: Partial<Edge>): void;
  copy(): void;
  paste(at?: { x: number; y: number }): void;
  duplicate(): void;
  bringToFront(): void;
  sendToBack(): void;
  align(mode: AlignMode): void;
  /** 고른 박스들의 간격을 가로(h) 또는 세로(v)로 똑같이 맞춘다 */
  distribute(dir: 'h' | 'v'): void;
  /** 고른 박스들을 새 워크박스로 감싼다 */
  groupSelected(): void;
  /** 고른 워크박스를 없애고 안의 박스는 남긴다 */
  ungroupSelected(): void;
  /** 오른쪽에 연결된 새 박스(right) 또는 아래에 같은 줄 새 박스(below)를 만들고 바로 편집한다 */
  addNext(id: string, dir: 'right' | 'below'): void;
  /** 찾기로 고른 박스를 잠깐 반짝이게 한다 */
  flashId: string | null;
  flash(id: string): void;
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
  rev: 0,
  tool: 'select',
  selected: [],
  selectedEdge: null,
  editingId: null,
  snap: loadSnap(),
  theme: loadTheme(),
  settingsOpen: false,
  settingsTab: 'display',
  panelOpen: loadPanel(),
  searchOpen: false,
  interacting: false,
  wheelMode: loadWheel(),
  autosave: loadAutosave(),
  saveState: 'saved',
  savedAt: null,
  past: [],
  future: [],
  clipboard: null,
  toast: null,
  flashId: null,

  openDoc(doc, path) {
    lastKey = undefined;
    set({
      screen: 'editor',
      doc,
      filePath: path,
      dirty: false,
      rev: 0,
      saveState: 'saved',
      savedAt: null,
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
  markSaved(path, rev) {
    const same = rev === undefined || rev === get().rev;
    set(same ? { filePath: path, dirty: false, saveState: 'saved', savedAt: Date.now() } : { filePath: path });
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
  setPanelOpen(open) {
    savePanel(open);
    set({ panelOpen: open });
  },
  setSearchOpen(open) {
    set({ searchOpen: open });
  },
  setInteracting(on) {
    if (get().interacting !== on) set({ interacting: on });
  },
  setWheelMode(m) {
    saveWheel(m);
    set({ wheelMode: m });
  },
  setAutosave(on) {
    saveAutosave(on);
    set({ autosave: on });
  },
  setSaveState(state) {
    set(state === 'saved' ? { saveState: state, savedAt: Date.now() } : { saveState: state });
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
      rev: s.rev + 1,
      past: merge ? s.past : [...s.past, s.doc].slice(-HISTORY_LIMIT),
      future: [],
    }));
  },
  changeSilently(recipe) {
    set((s) => ({ doc: recipe(s.doc), dirty: true, rev: s.rev + 1 }));
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
    const { past, doc } = get();
    const top = past[past.length - 1];
    if (top && !top.boxes.some((b) => b.id === id)) {
      // 방금 만든 박스라면 만들기 전 기록으로 되돌려서, 실행 취소가 헛돌지 않게 한다
      set((s) => ({ doc: { ...top, view: doc.view }, past: past.slice(0, -1), dirty: true, rev: s.rev + 1, selected: s.selected.filter((x) => x !== id) }));
      return;
    }
    set((s) => ({
      doc: { ...s.doc, boxes: s.doc.boxes.filter((b) => b.id !== id), edges: s.doc.edges.filter((e) => e.from !== id && e.to !== id) },
      dirty: true,
      rev: s.rev + 1,
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
  updateEdges(ids, patch) {
    const set_ = new Set(ids);
    get().change((d) => ({ ...d, edges: d.edges.map((e) => (set_.has(e.id) ? { ...e, ...patch } : e)) }));
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
  distribute(dir) {
    const all = get().doc.boxes;
    const ids = topLevel(all, get().selected);
    const boxes = all.filter((b) => ids.includes(b.id));
    if (boxes.length < 3) return;
    const pos = (b: Box) => (dir === 'h' ? b.x : b.y);
    const size = (b: Box) => (dir === 'h' ? b.w : b.h);
    const sorted = [...boxes].sort((a, b) => pos(a) - pos(b));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const total = sorted.reduce((n, b) => n + size(b), 0);
    const gap = (pos(last) + size(last) - pos(first) - total) / (sorted.length - 1);
    get().change((d) => {
      let next = d.boxes;
      let cursor = pos(first);
      for (const b of sorted) {
        const delta = cursor - pos(b);
        if (delta) next = translate(next, [b.id], dir === 'h' ? delta : 0, dir === 'v' ? delta : 0);
        cursor += size(b) + gap;
      }
      return { ...d, boxes: next };
    });
  },
  groupSelected() {
    const all = get().doc.boxes;
    const ids = topLevel(all, get().selected);
    const boxes = all.filter((b) => ids.includes(b.id));
    if (boxes.length === 0) return;
    const pad = 24;
    const x = Math.min(...boxes.map((b) => b.x)) - pad;
    const y = Math.min(...boxes.map((b) => b.y)) - pad;
    const r = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
    const btm = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
    // 모두 같은 워크박스 안에 있었다면 새 워크박스도 그 안에 둔다
    const parents = new Set(boxes.map((b) => b.parentId));
    const parentId = parents.size === 1 ? [...parents][0] : null;
    const group = makeBox('shape', x, y, { w: r - x, h: btm - y, fill: '#FBFAF7', stroke: '#E3DFD6', shape: 'rounded', align: 'left', valign: 'top', fontSize: 13, bold: true, parentId });
    get().change((d) => ({
      ...d,
      boxes: normalizeOrder([...d.boxes, group].map((b) => (ids.includes(b.id) ? { ...b, parentId: group.id } : b))),
    }));
    set({ selected: [group.id], selectedEdge: null });
  },
  ungroupSelected() {
    const all = get().doc.boxes;
    const groups = all.filter((b) => get().selected.includes(b.id) && b.kind === 'shape' && all.some((c) => c.parentId === b.id));
    if (groups.length === 0) return;
    const gone = new Set(groups.map((g) => g.id));
    const kids = all.filter((b) => b.parentId && gone.has(b.parentId)).map((b) => b.id);
    get().change((d) => ({
      ...d,
      boxes: normalizeOrder(
        d.boxes
          .filter((b) => !gone.has(b.id))
          .map((b) => (b.parentId && gone.has(b.parentId) ? { ...b, parentId: groups.find((g) => g.id === b.parentId)!.parentId } : b)),
      ),
      edges: d.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to)),
    }));
    set({ selected: kids, selectedEdge: null });
  },
  addNext(id, dir) {
    const { doc } = get();
    const src = doc.boxes.find((b) => b.id === id);
    if (!src) return;
    // 같은 모양으로 만든다 (숫자/수식/이미지 박스 다음에는 워크박스)
    const kind = src.kind === 'text' || src.kind === 'shape' || src.kind === 'checklist' ? src.kind : 'shape';
    const style: Partial<Box> = {
      fill: src.fill,
      stroke: src.stroke,
      shape: src.shape,
      fontSize: src.fontSize,
      bold: src.bold,
      align: src.align,
      valign: src.valign,
      textColor: src.textColor,
      fontFamily: src.fontFamily,
      lineHeight: src.lineHeight,
      padding: src.padding,
      titleLine: src.titleLine,
      w: src.w,
      h: kind === src.kind ? src.h : 64,
      items: kind === 'checklist' ? [{ id: uid(), text: '', done: false }] : [],
    };
    const outgoing = doc.edges.filter((e) => e.from === src.id);
    const incoming = doc.edges.find((e) => e.to === src.id);
    let x: number;
    let y: number;
    if (dir === 'right') {
      // 이미 오른쪽에 이어진 박스가 있으면 그 아래에 쌓는다
      const kids = doc.boxes.filter((b) => outgoing.some((e) => e.to === b.id));
      x = kids.length ? Math.min(...kids.map((b) => b.x)) : src.x + src.w + 72;
      y = kids.length ? Math.max(...kids.map((b) => b.y + b.h)) + 20 : src.y;
    } else {
      x = src.x;
      y = src.y + src.h + 20;
    }
    // 다른 박스와 겹치면 아래로 비킨다 (자기를 품은 워크박스는 빼고)
    const w = style.w!;
    const h = style.h!;
    const obstacles = doc.boxes.filter((b) => !(b.kind === 'shape' && (b.w > w || b.h > h) && b.x <= x && b.y <= y && b.x + b.w >= x + w && b.y + b.h >= y + h));
    for (let n = 0; n < 200 && obstacles.some((b) => intersects(b, { x, y, w, h })); n++) y += 24;
    const box = makeBox(kind, x, y, style);
    // 연결선 모양은 옆 선을 따라간다 (라벨은 비운다)
    const look = (e: Edge): Partial<Edge> => ({ arrow: e.arrow, curve: e.curve, style: e.style, color: e.color, width: e.width, fromSide: e.fromSide, toSide: e.toSide });
    const edge =
      dir === 'right'
        ? makeEdge(src.id, box.id, outgoing[0] ? look(outgoing[0]) : { fromSide: 'right', toSide: 'left' })
        : incoming
          ? makeEdge(incoming.from, box.id, look(incoming))
          : null;
    get().change((d) => ({ ...d, boxes: reparent([...d.boxes, box], [box.id]), edges: edge ? [...d.edges, edge] : d.edges }));
    set({ selected: [box.id], selectedEdge: null, editingId: kind === 'checklist' || kind === 'text' || kind === 'shape' ? box.id : null });
  },
  flash(id) {
    set({ flashId: id });
    window.setTimeout(() => {
      if (get().flashId === id) set({ flashId: null });
    }, 1200);
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
      rev: get().rev + 1,
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
      rev: get().rev + 1,
      editingId: null,
      selected: get().selected.filter((id) => next.boxes.some((b) => b.id === id)),
      selectedEdge: null,
    });
  },
}));
