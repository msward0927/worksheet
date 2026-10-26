// 점 모눈종이 무한 캔버스. 화면 이동/확대, 박스 만들기/옮기기/크기 조절, 연결선 긋기를 처리한다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { boxForTool, makeBox } from '../boxes';
import { openContent } from '../fileOps';
import { intersects, type Pt, type Rect } from '../geometry';
import { platform, readImageFile } from '../platform';
import { useStore } from '../store';
import type { Box, Tool } from '../types';
import { useResults } from '../useResults';
import { registerViewport, snap, viewCenter, zoomAt } from '../viewport';
import { BoxView } from './BoxView';
import { EdgeLabels, EdgeLines } from './EdgeLayer';

type Corner = 'nw' | 'ne' | 'sw' | 'se';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean; clearOnClick: boolean }
  | { kind: 'move'; start: Pt; origins: Map<string, Pt>; primary: string; moved: boolean; clickedId: string; shift: boolean }
  | { kind: 'resize'; id: string; corner: Corner; start: Pt; orig: Rect; moved: boolean }
  | { kind: 'create'; tool: Tool; start: Pt; cur: Pt }
  | { kind: 'connect'; from: string; cur: Pt }
  | { kind: 'marquee'; start: Pt; cur: Pt; base: string[] };

type Overlay = { kind: 'rect'; r: Rect; marquee: boolean } | { kind: 'line'; from: Pt; to: Pt };

const CREATE_TOOLS: Tool[] = ['rect', 'ellipse', 'text', 'sticky', 'number', 'formula', 'checklist', 'image'];
const MIN_W = 40;
const MIN_H = 28;
export const CLIP_MARKER = 'worksheet-boxes:';

const rectFrom = (a: Pt, b: Pt): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

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

  const { view } = doc;

  const toWorld = useCallback((clientX: number, clientY: number): Pt => {
    const r = vpRef.current!.getBoundingClientRect();
    const v = useStore.getState().doc.view;
    return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
  }, []);

  // 휠: 확대/축소 (Shift+휠: 가로 이동)
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
      const v = useStore.getState().doc.view;
      if (e.shiftKey) {
        useStore.getState().setView({ ...v, x: v.x - (e.deltaY || e.deltaX) });
        return;
      }
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
      if (e.code === 'Space' && !isTyping(e.target)) {
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
        const box = await imageBox(await readImageFile(file), snap(c.x - 120), snap(c.y - 90));
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
        s.addBox(makeBox('text', snap(c.x - 120), snap(c.y - 40), { text, w: 280, h: 120 }));
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

  const finishCreate = async (t: Tool, start: Pt, cur: Pt) => {
    const s = useStore.getState();
    const names = new Set(s.doc.boxes.map((b) => b.name));
    const r = rectFrom(start, cur);
    const dragged = r.w > 8 || r.h > 8;
    const x = s.snap ? snap(r.x) : r.x;
    const y = s.snap ? snap(r.y) : r.y;
    let box: Box | null;
    if (t === 'image') {
      const data = await platform.openImage();
      if (!data) return;
      box = await imageBox(data, x, y);
    } else {
      box = boxForTool(t, x, y, names);
    }
    if (!box) return;
    if (dragged && t !== 'image') {
      box.w = Math.max(MIN_W, s.snap ? snap(r.w) : r.w);
      box.h = Math.max(MIN_H, s.snap ? snap(r.h) : r.h);
    }
    s.addBox(box);
    s.setTool('select');
    if (box.kind !== 'image') s.setEditing(box.id);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const s = useStore.getState();
    const target = e.target as HTMLElement;
    const p = toWorld(e.clientX, e.clientY);

    if (e.button === 1 || (e.button === 0 && (s.tool === 'hand' || spaceDown))) {
      e.preventDefault();
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: s.doc.view.x, vy: s.doc.view.y, moved: false, clearOnClick: false };
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
      drag.current = { kind: 'create', tool: s.tool, start: p, cur: p };
    } else if (s.tool === 'connect') {
      if (!boxId) return;
      drag.current = { kind: 'connect', from: boxId, cur: p };
    } else if (boxId) {
      if (s.editingId === boxId) return;
      let sel = s.selected;
      if (e.shiftKey) {
        sel = sel.includes(boxId) ? sel.filter((id) => id !== boxId) : [...sel, boxId];
        s.select(sel);
        if (!sel.includes(boxId)) return;
      } else if (!sel.includes(boxId)) {
        sel = [boxId];
        s.select(sel);
      } else if (s.selectedEdge) {
        s.select(sel);
      }
      const origins = new Map<string, Pt>();
      for (const b of s.doc.boxes) if (sel.includes(b.id)) origins.set(b.id, { x: b.x, y: b.y });
      drag.current = { kind: 'move', start: p, origins, primary: boxId, moved: false, clickedId: boxId, shift: e.shiftKey };
    } else if (edgeEl) {
      s.select([], (edgeEl as HTMLElement | SVGElement).dataset.edgeId ?? null);
      return;
    } else if (e.shiftKey) {
      drag.current = { kind: 'marquee', start: p, cur: p, base: s.selected };
    } else {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: s.doc.view.x, vy: s.doc.view.y, moved: false, clearOnClick: true };
    }
    vpRef.current!.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const s = useStore.getState();
    const p = toWorld(e.clientX, e.clientY);
    const useSnap = s.snap && !e.altKey;
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
        if (!d.moved) s.checkpoint();
        d.moved = true;
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
        if (e.shiftKey) {
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
      case 'create':
        d.cur = p;
        setOverlay({ kind: 'rect', r: rectFrom(d.start, p), marquee: false });
        return;
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
    if (!d) return;
    const s = useStore.getState();
    switch (d.kind) {
      case 'pan':
        if (!d.moved && d.clearOnClick) s.select([]);
        return;
      case 'move':
        if (!d.moved && !d.shift && s.selected.length > 1) s.select([d.clickedId]);
        return;
      case 'create':
        void finishCreate(d.tool, d.start, d.cur);
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
    if (boxId) {
      const box = s.doc.boxes.find((b) => b.id === boxId)!;
      if (box.kind === 'image') {
        const data = await platform.openImage();
        if (data) s.updateBox(box.id, { image: data });
      } else {
        s.select([boxId]);
        s.setEditing(boxId);
      }
      return;
    }
    if (target.closest('[data-edge-id]') || s.tool !== 'select') return;
    // 빈 곳을 더블클릭하면 글상자를 만든다
    const p = toWorld(e.clientX, e.clientY);
    const box = boxForTool('text', s.snap ? snap(p.x) : p.x, s.snap ? snap(p.y - 24) : p.y - 24, new Set());
    if (box) {
      s.addBox(box);
      s.setEditing(box.id);
    }
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
      const box = await imageBox(await readImageFile(f), snap(p.x + offset), snap(p.y + offset));
      s.addBox(box);
      offset += 32;
    }
  };

  // 줌에 맞춰 점 간격을 2배씩 바꿔서 항상 적당한 밀도로 보이게 한다
  let step = 24 * view.zoom;
  while (step < 14) step *= 2;
  while (step >= 56) step /= 2;

  const cursor = panning ? 'grabbing' : tool === 'hand' || spaceDown ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  const single = selected.length === 1;
  const selectedSet = new Set(selected);

  return (
    <div
      ref={vpRef}
      className="viewport"
      style={{
        cursor,
        backgroundSize: `${step}px ${step}px`,
        backgroundPosition: `${view.x - step / 2}px ${view.y - step / 2}px`,
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
        <EdgeLines edges={doc.edges} boxes={doc.boxes} selectedEdge={selectedEdge} zoom={view.zoom} />
        {doc.boxes.map((b) => (
          <BoxView
            key={b.id}
            box={b}
            selected={selectedSet.has(b.id)}
            single={single}
            editing={editingId === b.id}
            result={results.get(b.id)}
            zoom={view.zoom}
          />
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
                fill={overlay.marquee ? 'rgba(47,91,211,0.08)' : 'rgba(255,255,255,0.6)'}
                stroke="#2F5BD3"
                strokeWidth={1.5 / view.zoom}
                strokeDasharray={overlay.marquee ? `${4 / view.zoom} ${3 / view.zoom}` : undefined}
              />
            ) : (
              <line
                x1={overlay.from.x}
                y1={overlay.from.y}
                x2={overlay.to.x}
                y2={overlay.to.y}
                stroke="#2F5BD3"
                strokeWidth={2 / view.zoom}
                strokeDasharray={`${6 / view.zoom} ${4 / view.zoom}`}
              />
            )}
          </svg>
        )}
      </div>
      {doc.boxes.length === 0 && (
        <div className="empty-hint">
          왼쪽 도구로 워크박스를 만들거나, 빈 곳을 더블클릭해 글을 써 보세요.
          <br />
          휠: 확대/축소 · 빈 곳 끌기: 화면 이동 · Shift+끌기: 여러 개 선택
        </div>
      )}
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
