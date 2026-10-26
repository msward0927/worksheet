// 점 모눈종이 무한 캔버스. 화면 이동/확대, 박스 만들기/옮기기/크기 조절, 연결선 긋기를 처리한다.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { boxForTool, cloneBoxes, makeBox } from '../boxes';
import { openContent } from '../fileOps';
import { intersects, type Pt, type Rect } from '../geometry';
import { edgeLayer, findContainer, parentIds, reparent, topLevel, withDescendants } from '../tree';
import { platform, readImageFile } from '../platform';
import { useStore } from '../store';
import type { Box, Edge, Tool } from '../types';
import { useResults } from '../useResults';
import { dotBackground, dotSpacing, registerViewport, snap, snapTo, viewCenter, zoomAt } from '../viewport';
import { BoxView } from './BoxView';
import { EdgeLabels, EdgeLines } from './EdgeLayer';

type Corner = 'nw' | 'ne' | 'sw' | 'se';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { kind: 'move'; start: Pt; origins: Map<string, Pt>; primary: string; moved: boolean; clickedId: string; toggle: boolean }
  | { kind: 'resize'; id: string; corner: Corner; start: Pt; orig: Rect; moved: boolean }
  | { kind: 'create'; tool: Tool; start: Pt; cur: Pt; snapKey: boolean }
  | { kind: 'connect'; from: string; cur: Pt }
  | { kind: 'marquee'; start: Pt; cur: Pt; base: string[] };

type Overlay = { kind: 'rect'; r: Rect; marquee: boolean } | { kind: 'line'; from: Pt; to: Pt };

const CREATE_TOOLS: Tool[] = ['rect', 'ellipse', 'text', 'sticky', 'number', 'formula', 'checklist', 'image'];
// 크기 제한은 사실상 없다 (손잡이로 잡을 수 있을 만큼만 남긴다)
const MIN_W = 4;
const MIN_H = 4;
export const CLIP_MARKER = 'worksheet-boxes:';
const NO_EDGES: Edge[] = [];

const rectFrom = (a: Pt, b: Pt): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

/** 만들 박스의 영역. 점에 맞추면 네 꼭짓점이 모두 점 위에 오도록 한다 */
function createRect(start: Pt, cur: Pt, snapOn: boolean): Rect & { dragged: boolean } {
  const r = rectFrom(start, cur);
  const dragged = r.w > 8 || r.h > 8;
  if (!snapOn) return { ...r, dragged };
  const g = dotSpacing();
  const x = snapTo(r.x, g);
  const y = snapTo(r.y, g);
  if (!dragged) return { x, y, w: 0, h: 0, dragged };
  return { x, y, w: Math.max(g, snapTo(r.x + r.w, g) - x), h: Math.max(g, snapTo(r.y + r.h, g) - y), dragged };
}

/** 최소 크기 이상이면서 점 간격의 배수인 크기 */
const snapSize = (v: number, min: number, g: number) => Math.max(Math.ceil(min / g) * g, snapTo(v, g));

function isTyping(el: EventTarget | null) {
  return el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

/** 이미지 data URL 로 크기가 맞춰진 이미지 박스를 만든다 */
export function imageBox(data: string, x: number, y: number): Promise<Box> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (w: number, h: number) => {
      const scale = Math.min(1, 360 / Math.max(w, 1), 360 / Math.max(h, 1));
      resolve(makeBox('image', x, y, { image: data, w: Math.max(80, Math.round(w * scale) + 16), h: Math.max(60, Math.round(h * scale) + 16) }));
    };
    img.onload = () => done(img.naturalWidth, img.naturalHeight);
    img.onerror = () => done(260, 200);
    img.src = data;
  });
}

export function Canvas() {
  const doc = useStore((s) => s.doc);
  const selected = useStore((s) => s.selected);
  const selectedEdge = useStore((s) => s.selectedEdge);
  const editingId = useStore((s) => s.editingId);
  const tool = useStore((s) => s.tool);
  const results = useResults();

  const vpRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [panning, setPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const { view } = doc;

  const toWorld = useCallback((clientX: number, clientY: number): Pt => {
    const r = vpRef.current!.getBoundingClientRect();
    const v = useStore.getState().doc.view;
    return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
  }, []);

  // 휠: 확대/축소
  useEffect(() => {
    const el = vpRef.current!;
    registerViewport(el);
    const onWheel = (e: WheelEvent) => {
      if (isTyping(e.target) && !(e.ctrlKey || e.metaKey)) {
        const ta = e.target as HTMLElement;
        if (ta.scrollHeight > ta.clientHeight) return;
      }
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      registerViewport(null);
    };
  }, []);

  // 스페이스를 누르고 있으면 끌어서 화면 이동
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target) && !useStore.getState().settingsOpen) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    const blur = () => setSpaceDown(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // 복사 / 잘라내기 / 붙여넣기 (이미지와 텍스트도 붙여넣을 수 있다)
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (isTyping(e.target) || isTyping(document.activeElement)) return;
      const s = useStore.getState();
      if (s.selected.length === 0) return;
      s.copy();
      e.clipboardData?.setData('text/plain', CLIP_MARKER + JSON.stringify(useStore.getState().clipboard));
      e.preventDefault();
    };
    const onCut = (e: ClipboardEvent) => {
      if (isTyping(e.target) || isTyping(document.activeElement)) return;
      onCopy(e);
      useStore.getState().deleteSelected();
    };
    const onPaste = async (e: ClipboardEvent) => {
      if (isTyping(e.target) || isTyping(document.activeElement)) return;
      pasteHandled = true;
      const s = useStore.getState();
      if (s.screen !== 'editor') return;
      const data = e.clipboardData;
      const file = data && [...data.files].find((f) => f.type.startsWith('image/'));
      const c = viewCenter();
      if (file) {
        e.preventDefault();
        const box = await imageBox(await readImageFile(file), Math.round(c.x - 120), Math.round(c.y - 90));
        s.addBox(box);
        return;
      }
      const text = data?.getData('text/plain') ?? '';
      if (text.startsWith(CLIP_MARKER)) {
        e.preventDefault();
        try {
          useStore.setState({ clipboard: JSON.parse(text.slice(CLIP_MARKER.length)) });
          s.paste();
        } catch {
          s.showToast('붙여넣을 수 없어요');
        }
        return;
      }
      if (text.trim()) {
        e.preventDefault();
        s.addBox(makeBox('text', Math.round(c.x - 120), Math.round(c.y - 40), { text, w: 280, h: 120 }));
        return;
      }
      s.paste();
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, []);

  const finishCreate = async (t: Tool, start: Pt, cur: Pt, snapOn: boolean) => {
    const s = useStore.getState();
    const names = new Set(s.doc.boxes.map((b) => b.name));
    const r = createRect(start, cur, snapOn);
    let box: Box | null;
    if (t === 'image') {
      const data = await platform.openImage();
      if (!data) return;
      box = await imageBox(data, r.x, r.y);
    } else {
      box = boxForTool(t, r.x, r.y, names);
    }
    if (!box) return;
    if (r.dragged && t !== 'image') {
      box.w = Math.max(MIN_W, r.w);
      box.h = Math.max(MIN_H, r.h);
    }
    if (snapOn) {
      const g = dotSpacing();
      box.w = snapSize(box.w, MIN_W, g);
      box.h = snapSize(box.h, MIN_H, g);
    }
    s.addBox(box);
    s.setTool('select');
    if (box.kind !== 'image' && box.kind !== 'shape') s.setEditing(box.id);
  };

  /** Alt 를 누르고 끌기 시작하면 선택한 박스를 복제하고, 복제본을 끌고 간다 */
  const startCopyDrag = (d: Extract<Drag, { kind: 'move' }>) => {
    const s = useStore.getState();
    const source = s.doc.boxes.filter((b) => d.origins.has(b.id));
    const { boxes, edges, idMap } = cloneBoxes(source, s.doc.edges, s.doc.boxes);
    s.changeSilently((doc) => ({ ...doc, boxes: [...doc.boxes, ...boxes], edges: [...doc.edges, ...edges] }));
    d.origins = new Map(boxes.map((b) => [b.id, { x: b.x, y: b.y }]));
    d.primary = idMap.get(d.primary) ?? d.primary;
    d.clickedId = d.primary;
    s.select(topLevel(s.doc.boxes, s.selected).map((id) => idMap.get(id)!).filter(Boolean));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const s = useStore.getState();
    const target = e.target as HTMLElement;
    const p = toWorld(e.clientX, e.clientY);

    if (e.button === 1 || (e.button === 0 && (s.tool === 'hand' || spaceDown))) {
      e.preventDefault();
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: s.doc.view.x, vy: s.doc.view.y, moved: false };
      setPanning(true);
      vpRef.current!.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    if (target.closest('input, textarea, select, button, [data-no-drag]')) return;

    const handleEl = target.closest<HTMLElement>('[data-handle]');
    const connectEl = target.closest<HTMLElement>('[data-connect-handle]');
    const boxEl = target.closest<HTMLElement>('[data-box-id]');
    const edgeEl = target.closest<Element>('[data-edge-id]');
    const boxId = boxEl?.dataset.boxId;

    if (s.editingId && s.editingId !== boxId) s.setEditing(null);

    if (handleEl && boxId) {
      const b = s.doc.boxes.find((x) => x.id === boxId)!;
      drag.current = { kind: 'resize', id: boxId, corner: handleEl.dataset.handle as Corner, start: p, orig: { x: b.x, y: b.y, w: b.w, h: b.h }, moved: false };
    } else if (connectEl && boxId) {
      drag.current = { kind: 'connect', from: boxId, cur: p };
    } else if (CREATE_TOOLS.includes(s.tool)) {
      drag.current = { kind: 'create', tool: s.tool, start: p, cur: p, snapKey: e.shiftKey };
    } else if (s.tool === 'connect') {
      if (!boxId) return;
      drag.current = { kind: 'connect', from: boxId, cur: p };
    } else if (boxId) {
      if (s.editingId === boxId) return;
      let sel = s.selected;
      const toggle = e.ctrlKey || e.metaKey;
      if (toggle) {
        sel = sel.includes(boxId) ? sel.filter((id) => id !== boxId) : [...sel, boxId];
        s.select(sel);
        if (!sel.includes(boxId)) return;
      } else if (!sel.includes(boxId)) {
        sel = [boxId];
        s.select(sel);
      } else if (s.selectedEdge) {
        s.select(sel);
      }
      // 워크박스를 옮기면 안에 든 박스도 함께 옮긴다
      const moving = withDescendants(s.doc.boxes, topLevel(s.doc.boxes, sel));
      const origins = new Map<string, Pt>();
      for (const b of s.doc.boxes) if (moving.has(b.id)) origins.set(b.id, { x: b.x, y: b.y });
      drag.current = { kind: 'move', start: p, origins, primary: boxId, moved: false, clickedId: boxId, toggle };
    } else if (edgeEl) {
      s.select([], (edgeEl as HTMLElement | SVGElement).dataset.edgeId ?? null);
      return;
    } else {
      // 빈 곳 끌기는 영역 선택 (Ctrl 을 누르면 기존 선택에 더한다). 화면 이동은 Space+끌기
      drag.current = { kind: 'marquee', start: p, cur: p, base: e.ctrlKey || e.metaKey ? s.selected : [] };
    }
    vpRef.current!.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const s = useStore.getState();
    const p = toWorld(e.clientX, e.clientY);
    // Shift 를 누르고 있거나 '항상 점에 맞추기'가 켜져 있으면 점에 맞춘다
    const useSnap = s.snap || e.shiftKey;
    switch (d.kind) {
      case 'pan': {
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        if (!d.moved && Math.hypot(dx, dy) < 3) return;
        if (!d.moved) setPanning(true);
        d.moved = true;
        s.setView({ ...s.doc.view, x: d.vx + dx, y: d.vy + dy });
        return;
      }
      case 'move': {
        let dx = p.x - d.start.x;
        let dy = p.y - d.start.y;
        if (!d.moved && Math.hypot(dx, dy) * s.doc.view.zoom < 3) return;
        if (!d.moved) {
          s.checkpoint();
          if (e.altKey) startCopyDrag(d);
        }
        d.moved = true;
        // 끄는 박스의 왼쪽 위 꼭짓점을 점에 맞추고, 함께 선택된 박스는 같은 만큼 옮긴다
        const o = d.origins.get(d.primary)!;
        if (useSnap) {
          dx = snap(o.x + dx) - o.x;
          dy = snap(o.y + dy) - o.y;
        }
        s.changeSilently((doc) => ({
          ...doc,
          boxes: doc.boxes.map((b) => {
            const org = d.origins.get(b.id);
            return org ? { ...b, x: org.x + dx, y: org.y + dy } : b;
          }),
        }));
        // 놓으면 들어갈 워크박스를 표시한다
        const moved = useStore.getState().doc.boxes;
        const primary = moved.find((b) => b.id === d.primary);
        setDropTarget(primary ? (findContainer(moved, primary)?.id ?? null) : null);
        return;
      }
      case 'resize': {
        if (!d.moved) s.checkpoint();
        d.moved = true;
        const { orig, corner } = d;
        let left = orig.x;
        let top = orig.y;
        let right = orig.x + orig.w;
        let bottom = orig.y + orig.h;
        const sx = useSnap ? snap(p.x) : p.x;
        const sy = useSnap ? snap(p.y) : p.y;
        if (corner.includes('w')) left = Math.min(sx, right - MIN_W);
        if (corner.includes('e')) right = Math.max(sx, left + MIN_W);
        if (corner.includes('n')) top = Math.min(sy, bottom - MIN_H);
        if (corner.includes('s')) bottom = Math.max(sy, top + MIN_H);
        if (e.altKey) {
          // 비율 유지
          const ratio = orig.w / orig.h;
          const w = right - left;
          const h = Math.max(MIN_H, w / ratio);
          if (corner.includes('n')) top = bottom - h;
          else bottom = top + h;
        }
        s.changeSilently((doc) => ({
          ...doc,
          boxes: doc.boxes.map((b) => (b.id === d.id ? { ...b, x: left, y: top, w: right - left, h: bottom - top } : b)),
        }));
        return;
      }
      case 'create': {
        d.cur = p;
        d.snapKey = e.shiftKey;
        const r = createRect(d.start, p, s.snap || d.snapKey);
        setOverlay({ kind: 'rect', r, marquee: false });
        return;
      }
      case 'connect': {
        d.cur = p;
        const from = s.doc.boxes.find((b) => b.id === d.from);
        if (from) setOverlay({ kind: 'line', from: { x: from.x + from.w / 2, y: from.y + from.h / 2 }, to: p });
        return;
      }
      case 'marquee':
        d.cur = p;
        setOverlay({ kind: 'rect', r: rectFrom(d.start, p), marquee: true });
        return;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setOverlay(null);
    setPanning(false);
    setDropTarget(null);
    if (!d) return;
    const s = useStore.getState();
    switch (d.kind) {
      case 'pan':
        return;
      case 'move':
        if (!d.moved) {
          if (!d.toggle && s.selected.length > 1) s.select([d.clickedId]);
          return;
        }
        // 놓은 자리에 맞게 워크박스 안으로 넣거나 밖으로 뺀다 (옮기기와 같은 실행 취소 단계)
        s.changeSilently((doc) => ({ ...doc, boxes: reparent(doc.boxes, topLevel(doc.boxes, s.selected)) }));
        return;
      case 'create':
        void finishCreate(d.tool, d.start, d.cur, s.snap || d.snapKey || e.shiftKey);
        return;
      case 'connect': {
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-box-id]');
        const to = el?.dataset.boxId;
        if (to && to !== d.from) s.addEdge(d.from, to);
        return;
      }
      case 'marquee': {
        const r = rectFrom(d.start, d.cur);
        const hit = s.doc.boxes.filter((b) => intersects(r, b)).map((b) => b.id);
        s.select([...new Set([...d.base, ...hit])]);
        return;
      }
    }
  };

  const onDoubleClick = async (e: React.MouseEvent) => {
    const s = useStore.getState();
    // 포인터 캡처 때문에 e.target 은 뷰포트가 되므로, 실제로 누른 요소를 좌표로 찾는다
    const target = (document.elementFromPoint(e.clientX, e.clientY) ?? e.target) as HTMLElement;
    if (target.closest('input, textarea, [data-no-drag]')) return;
    const boxId = target.closest<HTMLElement>('[data-box-id]')?.dataset.boxId;
    const p = toWorld(e.clientX, e.clientY);
    const snapOn = s.snap || e.shiftKey;
    const newText = () => {
      const box = boxForTool('text', snapOn ? snap(p.x) : p.x, snapOn ? snap(p.y - 18) : p.y - 18, new Set());
      if (box) {
        s.addBox(box);
        s.setEditing(box.id);
      }
    };
    if (boxId) {
      const box = s.doc.boxes.find((b) => b.id === boxId)!;
      if (box.kind === 'shape') {
        // 워크박스에는 글을 직접 쓰지 않고, 안에 텍스트 박스를 만든다
        newText();
      } else if (box.kind === 'image') {
        const data = await platform.openImage();
        if (data) s.updateBox(box.id, { image: data });
      } else {
        s.select([boxId]);
        s.setEditing(boxId);
      }
      return;
    }
    if (target.closest('[data-edge-id]') || s.tool !== 'select') return;
    // 빈 곳을 더블클릭하면 텍스트 박스를 만든다
    newText();
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const s = useStore.getState();
    const p = toWorld(e.clientX, e.clientY);
    const files = [...e.dataTransfer.files];
    const sheet = files.find((f) => /\.(wsht|json)$/i.test(f.name));
    if (sheet) {
      const path = (sheet as File & { path?: string }).path ?? null;
      openContent(await sheet.text(), path);
      return;
    }
    let offset = 0;
    for (const f of files.filter((f) => f.type.startsWith('image/'))) {
      const x = p.x + offset;
      const y = p.y + offset;
      const box = await imageBox(await readImageFile(f), s.snap ? snap(x) : x, s.snap ? snap(y) : y);
      s.addBox(box);
      offset += 32;
    }
  };

  const cursor = panning ? 'grabbing' : tool === 'hand' || spaceDown ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  const single = selected.length === 1;
  const selectedSet = new Set(selected);
  const parents = parentIds(doc.boxes);
  // 연결선은 양 끝을 품은 워크박스 바로 위(그 안의 박스들보다는 아래)에 그린다
  const edgeGroups = useMemo(() => {
    const byId = new Map(doc.boxes.map((b) => [b.id, b]));
    const groups = new Map<string | null, Edge[]>();
    for (const e of doc.edges) {
      const key = edgeLayer(byId, e.from, e.to);
      const list = groups.get(key) ?? [];
      list.push(e);
      groups.set(key, list);
    }
    return groups;
  }, [doc.boxes, doc.edges]);

  return (
    <div
      ref={vpRef}
      className="viewport"
      style={{
        cursor,
        ...dotBackground(view),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <EdgeLines edges={edgeGroups.get(null) ?? NO_EDGES} boxes={doc.boxes} selectedEdge={selectedEdge} zoom={view.zoom} />
        {doc.boxes.map((b) => (
          <Fragment key={b.id}>
            <BoxView
              box={b}
              selected={selectedSet.has(b.id)}
              single={single}
              editing={editingId === b.id}
              result={results.get(b.id)}
              zoom={view.zoom}
              hasChildren={parents.has(b.id)}
              dropTarget={dropTarget === b.id}
            />
            {edgeGroups.has(b.id) && <EdgeLines edges={edgeGroups.get(b.id)!} boxes={doc.boxes} selectedEdge={selectedEdge} zoom={view.zoom} />}
          </Fragment>
        ))}
        <EdgeLabels edges={doc.edges} boxes={doc.boxes} selectedEdge={selectedEdge} zoom={view.zoom} />
        {overlay && (
          <svg className="overlay-layer" aria-hidden="true">
            {overlay.kind === 'rect' ? (
              <rect
                x={overlay.r.x}
                y={overlay.r.y}
                width={overlay.r.w}
                height={overlay.r.h}
                className={overlay.marquee ? 'overlay-marquee' : 'overlay-create'}
                strokeWidth={1.5 / view.zoom}
                strokeDasharray={overlay.marquee ? `${4 / view.zoom} ${3 / view.zoom}` : undefined}
              />
            ) : (
              <line
                x1={overlay.from.x}
                y1={overlay.from.y}
                x2={overlay.to.x}
                y2={overlay.to.y}
                className="overlay-line"
                strokeWidth={2 / view.zoom}
                strokeDasharray={`${6 / view.zoom} ${4 / view.zoom}`}
              />
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

/** 키보드 Ctrl+V 를 눌렀는데 paste 이벤트가 오지 않는 환경을 위한 대비 */
let pasteHandled = false;
export function pasteFallback() {
  pasteHandled = false;
  window.setTimeout(() => {
    if (!pasteHandled) useStore.getState().paste();
  }, 60);
}
