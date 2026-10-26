// 캔버스 화면(뷰포트)과 관련된 계산. Canvas 컴포넌트가 마운트되면 element 를 등록한다.

import { boundsOf } from './geometry';
import { useStore } from './store';
import type { View } from './types';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;
export const SNAP = 12;

let element: HTMLElement | null = null;

export function registerViewport(el: HTMLElement | null) {
  element = el;
}

export function viewportSize() {
  const r = element?.getBoundingClientRect();
  return { w: r?.width ?? 1200, h: r?.height ?? 800, left: r?.left ?? 0, top: r?.top ?? 0 };
}

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** 화면 좌표(뷰포트 기준) sx, sy 를 고정점으로 확대/축소 */
export function zoomAt(sx: number, sy: number, factor: number) {
  const { view } = useStore.getState().doc;
  const zoom = clampZoom(view.zoom * factor);
  const wx = (sx - view.x) / view.zoom;
  const wy = (sy - view.y) / view.zoom;
  useStore.getState().setView({ zoom, x: sx - wx * zoom, y: sy - wy * zoom });
}

export function zoomBy(factor: number) {
  const { w, h } = viewportSize();
  zoomAt(w / 2, h / 2, factor);
}

export function setZoom(zoom: number) {
  const { view } = useStore.getState().doc;
  zoomBy(zoom / view.zoom);
}

/** 화면 가운데의 월드 좌표 */
export function viewCenter() {
  const { view } = useStore.getState().doc;
  const { w, h } = viewportSize();
  return { x: (w / 2 - view.x) / view.zoom, y: (h / 2 - view.y) / view.zoom };
}

/** 모든 박스가 보이도록 화면을 맞춘다 */
export function fitView(maxZoom = 1) {
  const { doc } = useStore.getState();
  const b = boundsOf(doc.boxes);
  const { w, h } = viewportSize();
  if (!b) {
    useStore.getState().setView({ x: w / 2 - 300, y: h / 2 - 200, zoom: 1 });
    return;
  }
  const pad = 64;
  const zoom = clampZoom(Math.min((w - pad * 2) / Math.max(b.w, 1), (h - pad * 2) / Math.max(b.h, 1), maxZoom));
  const view: View = { zoom, x: w / 2 - (b.x + b.w / 2) * zoom, y: h / 2 - (b.y + b.h / 2) * zoom };
  useStore.getState().setView(view);
}

export const snap = (v: number) => Math.round(v / SNAP) * SNAP;
