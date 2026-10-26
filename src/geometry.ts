// 연결선 모양 계산

import type { Box, EdgeCurve } from './types';

export interface Pt {
  x: number;
  y: number;
}

export const center = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** 박스 중심에서 toward 방향으로 나아갈 때 도형 테두리와 만나는 점 */
export function borderPoint(b: Box, toward: Pt): Pt {
  const c = center(b);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = b.w / 2;
  const hh = b.h / 2;
  let t: number;
  if (b.shape === 'ellipse') t = 1 / Math.hypot(dx / hw, dy / hh);
  else if (b.shape === 'diamond') t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else t = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

type Side = 'left' | 'right' | 'top' | 'bottom';
const NORMAL: Record<Side, Pt> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };

function sidePoint(b: Box, side: Side): Pt {
  switch (side) {
    case 'left':
      return { x: b.x, y: b.y + b.h / 2 };
    case 'right':
      return { x: b.x + b.w, y: b.y + b.h / 2 };
    case 'top':
      return { x: b.x + b.w / 2, y: b.y };
    case 'bottom':
      return { x: b.x + b.w / 2, y: b.y + b.h };
  }
}

function norm(p: Pt): Pt {
  const l = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / l, y: p.y / l };
}

export interface EdgeGeometry {
  d: string;
  start: Pt;
  end: Pt;
  /** 끝점에서 선이 들어오는 방향 (단위 벡터, 끝점을 향함) */
  endDir: Pt;
  startDir: Pt;
  mid: Pt;
}

function pickSides(a: Box, b: Box): [Side, Side] {
  const ca = center(a);
  const cb = center(b);
  // 한쪽 방향으로만 떨어져 있으면 그쪽으로, 아니면 중심 사이 거리가 더 먼 방향으로 잇는다
  const horizontalGap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const verticalGap = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  const horizontal =
    horizontalGap > 0 && verticalGap <= 0
      ? true
      : verticalGap > 0 && horizontalGap <= 0
        ? false
        : Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y);
  if (horizontal) {
    return cb.x >= ca.x ? ['right', 'left'] : ['left', 'right'];
  }
  return cb.y >= ca.y ? ['bottom', 'top'] : ['top', 'bottom'];
}

export function edgeGeometry(a: Box, b: Box, curve: EdgeCurve): EdgeGeometry {
  if (curve === 'straight') {
    const start = borderPoint(a, center(b));
    const end = borderPoint(b, center(a));
    const dir = norm({ x: end.x - start.x, y: end.y - start.y });
    return {
      d: `M${start.x} ${start.y} L${end.x} ${end.y}`,
      start,
      end,
      endDir: dir,
      startDir: { x: -dir.x, y: -dir.y },
      mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    };
  }

  const [sa, sb] = pickSides(a, b);
  const start = sidePoint(a, sa);
  const end = sidePoint(b, sb);
  const na = NORMAL[sa];
  const nb = NORMAL[sb];
  const horizontal = sa === 'left' || sa === 'right';

  if (curve === 'elbow') {
    if (horizontal) {
      const mx = (start.x + end.x) / 2;
      return {
        d: `M${start.x} ${start.y} H${mx} V${end.y} H${end.x}`,
        start,
        end,
        endDir: { x: -nb.x, y: 0 },
        startDir: { x: -na.x, y: 0 },
        mid: { x: mx, y: (start.y + end.y) / 2 },
      };
    }
    const my = (start.y + end.y) / 2;
    return {
      d: `M${start.x} ${start.y} V${my} H${end.x} V${end.y}`,
      start,
      end,
      endDir: { x: 0, y: -nb.y },
      startDir: { x: 0, y: -na.y },
      mid: { x: (start.x + end.x) / 2, y: my },
    };
  }

  const dist = horizontal ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y);
  const k = Math.max(40, dist / 2);
  const c1 = { x: start.x + na.x * k, y: start.y + na.y * k };
  const c2 = { x: end.x + nb.x * k, y: end.y + nb.y * k };
  return {
    d: `M${start.x} ${start.y} C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
    start,
    end,
    endDir: { x: -nb.x, y: -nb.y },
    startDir: { x: -na.x, y: -na.y },
    mid: { x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8, y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8 },
  };
}

/** tip 에 끝이 오는 화살촉 삼각형의 points 문자열 */
export function arrowHead(tip: Pt, dir: Pt, size: number): string {
  const px = -dir.y;
  const py = dir.x;
  const bx = tip.x - dir.x * size;
  const by = tip.y - dir.y * size;
  const w = size * 0.55;
  return `${tip.x},${tip.y} ${bx + px * w},${by + py * w} ${bx - px * w},${by - py * w}`;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boundsOf(boxes: Box[]): Rect | null {
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const btm = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: btm - y };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
