import { describe, expect, it } from 'vitest';
import { cloneBoxes, makeBox, makeEdge, uniqueName } from './boxes';

describe('cloneBoxes', () => {
  it('새 id 로 복제하고 그 사이의 연결선도 복제한다', () => {
    const a = makeBox('number', 0, 0, { name: '식비', value: 1 });
    const b = makeBox('text', 100, 0, { name: '메모' });
    const c = makeBox('text', 200, 0);
    const e1 = makeEdge(a.id, b.id);
    const e2 = makeEdge(b.id, c.id);
    const r = cloneBoxes([a, b], [e1, e2], [a, b, c]);
    expect(r.boxes.map((x) => x.id)).not.toContain(a.id);
    expect(r.boxes[0]).toMatchObject({ x: 0, y: 0, value: 1 });
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0].from).toBe(r.idMap.get(a.id));
    expect(r.edges[0].to).toBe(r.idMap.get(b.id));
  });

  it('숫자/수식/체크 박스는 이름이 겹치지 않게, 글상자 제목은 그대로', () => {
    const a = makeBox('number', 0, 0, { name: '식비' });
    const b = makeBox('text', 0, 0, { name: '메모' });
    const r = cloneBoxes([a, b], [], [a, b, makeBox('number', 0, 0, { name: '식비2' })]);
    expect(r.boxes[0].name).toBe('식비3');
    expect(r.boxes[1].name).toBe('메모');
  });

  it('uniqueName', () => {
    expect(uniqueName('숫자1', new Set(['숫자1']))).toBe('숫자2');
    expect(uniqueName('a', new Set())).toBe('a');
  });
});
