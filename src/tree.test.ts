import { describe, expect, it } from 'vitest';
import { makeBox } from './boxes';
import { adopt, findContainer, normalizeOrder, reparent, topLevel, translate, withDescendants } from './tree';

describe('워크박스 안의 워크박스', () => {
  const outer = makeBox('shape', 0, 0, { w: 400, h: 400 });
  const inner = makeBox('shape', 50, 50, { w: 200, h: 200, parentId: outer.id });
  const text = makeBox('text', 60, 60, { w: 50, h: 20, parentId: inner.id });
  const free = makeBox('text', 600, 0, { w: 50, h: 20 });
  const boxes = [outer, inner, text, free];

  it('자식까지 모은다', () => {
    expect(withDescendants(boxes, [outer.id])).toEqual(new Set([outer.id, inner.id, text.id]));
    expect(topLevel(boxes, [outer.id, text.id, free.id]).sort()).toEqual([outer.id, free.id].sort());
  });

  it('가운데를 품은 가장 작은 워크박스가 부모가 된다', () => {
    const t = makeBox('text', 100, 100, { w: 20, h: 20 });
    expect(findContainer([...boxes, t], t)?.id).toBe(inner.id);
    // 자기 자식 안으로는 들어가지 않는다
    expect(findContainer(boxes, outer)).toBeNull();
    // 텍스트 박스나 숫자 박스는 부모가 될 수 없다
    const n = makeBox('number', 0, 0, { w: 500, h: 500 });
    const t2 = makeBox('text', 450, 450, { w: 10, h: 10 });
    expect(findContainer([n, t2], t2)).toBeNull();
  });

  it('밖으로 옮기면 부모에서 빠지고, 순서는 부모가 먼저', () => {
    const moved = translate(boxes, [text.id], 1000, 0);
    const r = reparent(moved, [text.id]);
    expect(r.find((b) => b.id === text.id)?.parentId).toBeNull();
    const back = reparent(translate(r, [text.id], -1000, 0), [text.id]);
    expect(back.find((b) => b.id === text.id)?.parentId).toBe(inner.id);
    const order = back.map((b) => b.id);
    expect(order.indexOf(inner.id)).toBeLessThan(order.indexOf(text.id));
  });

  it('부모를 옮기면 자식도 함께', () => {
    const r = translate(boxes, [outer.id], 10, 20);
    expect(r.find((b) => b.id === text.id)).toMatchObject({ x: 70, y: 80 });
    expect(r.find((b) => b.id === free.id)).toMatchObject({ x: 600, y: 0 });
  });

  it('둘러싸게 그린 워크박스는 형제 박스를 품는다', () => {
    const a = makeBox('text', 700, 700, { w: 20, h: 20 });
    const frame = makeBox('shape', 650, 650, { w: 200, h: 200 });
    const r = adopt([...boxes, a, frame], frame.id);
    expect(r.find((b) => b.id === a.id)?.parentId).toBe(frame.id);
    expect(r.find((b) => b.id === free.id)?.parentId).toBeNull();
  });

  it('normalizeOrder 는 자식을 부모 뒤로', () => {
    const r = normalizeOrder([text, inner, free, outer]);
    const ids = r.map((b) => b.id);
    expect(ids.indexOf(outer.id)).toBeLessThan(ids.indexOf(inner.id));
    expect(ids.indexOf(inner.id)).toBeLessThan(ids.indexOf(text.id));
  });
});
