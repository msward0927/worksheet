// 워크박스 안의 워크박스(부모/자식) 관계를 다루는 도우미

import type { Box } from './types';

const area = (b: Box) => b.w * b.h;

/** ids 와 그 아래 모든 자식 박스의 id */
export function withDescendants(boxes: Box[], ids: Iterable<string>): Set<string> {
  const children = new Map<string, string[]>();
  for (const b of boxes) {
    if (!b.parentId) continue;
    const list = children.get(b.parentId) ?? [];
    list.push(b.id);
    children.set(b.parentId, list);
  }
  const out = new Set<string>();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

/** 자식이 있는 박스의 id */
export function parentIds(boxes: Box[]): Set<string> {
  return new Set(boxes.map((b) => b.parentId).filter((p): p is string => !!p));
}

/** 선택 중에서 조상이 함께 선택되지 않은 박스만 (함께 움직일 때 기준이 되는 박스) */
export function topLevel(boxes: Box[], ids: Iterable<string>): string[] {
  const set = new Set(ids);
  const byId = new Map(boxes.map((b) => [b.id, b]));
  return [...set].filter((id) => {
    for (let p = byId.get(id)?.parentId ?? null; p; p = byId.get(p)?.parentId ?? null) if (set.has(p)) return false;
    return true;
  });
}

/** 부모가 항상 자식보다 먼저(아래에) 그려지도록 순서를 맞춘다. 형제끼리의 순서는 유지한다 */
export function normalizeOrder(boxes: Box[]): Box[] {
  const ids = new Set(boxes.map((b) => b.id));
  const children = new Map<string | null, Box[]>();
  for (const b of boxes) {
    const key = b.parentId && ids.has(b.parentId) ? b.parentId : null;
    const list = children.get(key) ?? [];
    list.push(b);
    children.set(key, list);
  }
  const out: Box[] = [];
  const visit = (parent: string | null) => {
    for (const b of children.get(parent) ?? []) {
      out.push(b);
      visit(b.id);
    }
  };
  visit(null);
  return out.length === boxes.length ? out : boxes;
}

/** box 의 가운데를 품은 워크박스 중 가장 작은 것 (자기 자신과 자기 자식은 빼고) */
export function findContainer(boxes: Box[], box: Box): Box | null {
  const own = withDescendants(boxes, [box.id]);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  let best: Box | null = null;
  for (const b of boxes) {
    if (b.kind !== 'shape' || own.has(b.id)) continue;
    if (cx < b.x || cx > b.x + b.w || cy < b.y || cy > b.y + b.h) continue;
    if (area(b) <= area(box)) continue;
    if (!best || area(b) < area(best)) best = b;
  }
  return best;
}

/** 옮기거나 새로 만든 박스의 부모를 위치에 맞게 다시 정한다 */
export function reparent(boxes: Box[], ids: Iterable<string>): Box[] {
  let next = boxes;
  for (const id of ids) {
    const box = next.find((b) => b.id === id);
    if (!box) continue;
    const parentId = findContainer(next, box)?.id ?? null;
    if (parentId !== box.parentId) next = next.map((b) => (b.id === id ? { ...b, parentId } : b));
  }
  return next === boxes ? boxes : normalizeOrder(next);
}

/** 새로 그린 워크박스가 완전히 둘러싼 형제 박스들을 안으로 넣는다 */
export function adopt(boxes: Box[], shapeId: string): Box[] {
  const shape = boxes.find((b) => b.id === shapeId);
  if (!shape || shape.kind !== 'shape') return boxes;
  const inside = (b: Box) => b.x >= shape.x && b.y >= shape.y && b.x + b.w <= shape.x + shape.w && b.y + b.h <= shape.y + shape.h;
  let changed = false;
  const next = boxes.map((b) => {
    if (b.id === shapeId || b.parentId !== shape.parentId || !inside(b) || area(b) >= area(shape)) return b;
    changed = true;
    return { ...b, parentId: shapeId };
  });
  return changed ? normalizeOrder(next) : boxes;
}

/** ids 와 그 자식들을 dx, dy 만큼 옮긴다 */
export function translate(boxes: Box[], ids: Iterable<string>, dx: number, dy: number): Box[] {
  const all = withDescendants(boxes, ids);
  return boxes.map((b) => (all.has(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b));
}

/** 연결선이 그려질 층: 양 끝 박스를 모두 품은 가장 안쪽 워크박스 (없으면 null = 캔버스) */
export function edgeLayer(byId: Map<string, Box>, from: string, to: string): string | null {
  const chain = (id: string) => {
    const out: string[] = [];
    for (let p = byId.get(id)?.parentId ?? null; p; p = byId.get(p)?.parentId ?? null) out.push(p);
    return out;
  };
  const a = chain(from);
  const b = new Set(chain(to));
  return a.find((p) => b.has(p)) ?? null;
}
