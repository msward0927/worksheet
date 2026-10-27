// 캔버스 화면(뷰포트)과 관련된 계산. Canvas 컴포넌트가 마운트되면 element 를 등록한다.

import { boundsOf } from './geometry';
import { useStore } from './store';
import type { View } from './types';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;
export const BASE_DOT = 24;

let element: HTMLElement | null = null;

export function registerViewport(el: HTMLElement | null) {
  element = el;
}

export function viewportSize() {
  const r = element?.getBoundingClientRect();
  return { w: r?.width ?? 1200, h: r?.height ?? 800, left: r?.left ?? 0, top: r?.top ?? 0 };
}

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

// 최소/최대 배율의 4배 안쪽으로 들어오면 확대/축소가 점점 느려진다
const EASE_RANGE = Math.log(4);
const MIN_SPEED = 0.12;

/** 한계 배율에 가까울수록 배율 변화를 줄인 factor */
export function easedFactor(zoom: number, factor: number): number {
  const dist = factor < 1 ? Math.log(zoom / MIN_ZOOM) : Math.log(MAX_ZOOM / zoom);
  const speed = Math.min(1, Math.max(MIN_SPEED, dist / EASE_RANGE));
  return Math.pow(factor, speed);
}

/** 화면 좌표(뷰포트 기준) sx, sy 를 고정점으로 확대/축소 */
export function zoomAt(sx: number, sy: number, factor: number, ease = true) {
  const { view } = useStore.getState().doc;
  const zoom = clampZoom(view.zoom * (ease ? easedFactor(view.zoom, factor) : factor));
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
  const { w, h } = viewportSize();
  zoomAt(w / 2, h / 2, zoom / view.zoom, false);
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

/** 점 사이 간격(월드 좌표). 종이에 인쇄된 점처럼 고정이고, 화면에서는 배율만큼 커지고 작아진다 */
export const dotSpacing = () => BASE_DOT;

export const snapTo = (v: number, g: number) => Math.round(v / g) * g;

/** 가장 가까운 점 위치로 맞춘다 */
export const snap = (v: number) => snapTo(v, BASE_DOT);

/** 배율에 맞춘 점 무늬 배경. 점이 너무 빽빽해지면 흐리게 해서 얼룩지지 않게 한다 */
export function dotBackground(view: View) {
  const step = BASE_DOT * view.zoom;
  const r = 1.15 * view.zoom;
  const alpha = Math.min(1, Math.max(0, (step - 3) / 6));
  if (alpha === 0) return { backgroundImage: 'none' };
  const color = alpha === 1 ? 'var(--dot)' : `color-mix(in srgb, var(--dot) ${Math.round(alpha * 100)}%, transparent)`;
  return {
    backgroundImage: `radial-gradient(circle, ${color} ${r}px, transparent ${r + 0.5}px)`,
    backgroundSize: `${step}px ${step}px`,
    backgroundPosition: `${view.x - step / 2}px ${view.y - step / 2}px`,
  };
}

let anim = 0;

/** 화면을 target 으로 부드럽게 옮긴다 */
export function animateView(target: View, ms = 240) {
  cancelAnimationFrame(anim);
  const from = { ...useStore.getState().doc.view };
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const e = 1 - Math.pow(1 - t, 3);
    // 배율은 곱셈으로 섞어야 자연스럽다
    const zoom = from.zoom * Math.pow(target.zoom / from.zoom, e);
    useStore.getState().setView({ zoom, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e });
    if (t < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

/** 박스가 화면 가운데에 오도록 옮긴다. 화면에 들어오지 않으면 배율도 맞춘다 */
export function focusBox(id: string) {
  const { doc } = useStore.getState();
  const b = doc.boxes.find((x) => x.id === id);
  if (!b) return;
  const { w, h } = viewportSize();
  const pad = 140;
  const fit = Math.min((w - pad * 2) / Math.max(b.w, 1), (h - pad * 2) / Math.max(b.h, 1));
  const cur = doc.view.zoom;
  const zoom = clampZoom(cur <= fit && cur >= 0.5 ? cur : Math.min(fit, 1.2));
  animateView({ zoom, x: w / 2 - (b.x + b.w / 2) * zoom, y: h / 2 - (b.y + b.h / 2) * zoom });
  useStore.getState().flash(id);
}
