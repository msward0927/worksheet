import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDoc, makeBox } from './boxes';
import { useStore } from './store';

const s = () => useStore.getState();

beforeEach(() => {
  s().openDoc(emptyDoc('테스트'), null);
});

describe('store', () => {
  it('addNext: 오른쪽에 연결된 새 박스를 만들고 바로 편집한다', () => {
    const a = makeBox('shape', 0, 0, { w: 160, h: 80, text: '생각' });
    s().addBox(a);
    s().addNext(a.id, 'right');
    const { doc, editingId } = s();
    expect(doc.boxes).toHaveLength(2);
    const b = doc.boxes.find((x) => x.id !== a.id)!;
    expect(b.x).toBeGreaterThan(a.x + a.w);
    expect(editingId).toBe(b.id);
    expect(doc.edges).toEqual([expect.objectContaining({ from: a.id, to: b.id })]);
  });

  it('addNext 아래: 같은 모양의 박스를 아래에 만들고 겹치지 않는다', () => {
    const a = makeBox('shape', 0, 0, { w: 160, h: 80, fill: '#FFF4C7' });
    s().addBox(a);
    s().addNext(a.id, 'below');
    s().addNext(a.id, 'below');
    const others = s().doc.boxes.filter((x) => x.id !== a.id);
    expect(others).toHaveLength(2);
    for (const b of others) {
      expect(b.fill).toBe('#FFF4C7');
      expect(b.y).toBeGreaterThanOrEqual(a.y + a.h);
    }
    expect(others[0].y).not.toBe(others[1].y);
  });

  it('groupSelected / ungroupSelected', () => {
    const a = makeBox('text', 0, 0, { text: 'a' });
    const b = makeBox('text', 300, 0, { text: 'b' });
    s().addBox(a);
    s().addBox(b);
    s().select([a.id, b.id]);
    s().groupSelected();
    const group = s().doc.boxes.find((x) => x.kind === 'shape')!;
    expect(s().doc.boxes.filter((x) => x.parentId === group.id)).toHaveLength(2);
    expect(group.x).toBeLessThan(0);
    s().select([group.id]);
    s().ungroupSelected();
    expect(s().doc.boxes.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
    expect(s().doc.boxes.every((x) => x.parentId === null)).toBe(true);
  });

  it('distribute: 가운데 박스를 같은 간격이 되게 옮긴다', () => {
    const boxes = [0, 100, 600].map((x) => makeBox('text', x, 0, { w: 50, h: 20, text: String(x) }));
    boxes.forEach((b) => s().addBox(b));
    s().select(boxes.map((b) => b.id));
    s().distribute('h');
    const mid = s().doc.boxes.find((b) => b.id === boxes[1].id)!;
    expect(mid.x).toBeCloseTo(300);
  });

  it('빈 텍스트 박스를 만들었다 지우면 실행 취소가 헛돌지 않는다', () => {
    const keep = makeBox('text', 0, 0, { text: '남김' });
    s().addBox(keep);
    const empty = makeBox('text', 100, 0, { fill: 'transparent', stroke: 'none' });
    s().addBox(empty);
    s().discardIfEmpty(empty.id);
    expect(s().doc.boxes).toHaveLength(1);
    s().undo();
    // 한 번의 실행 취소로 '남김' 박스를 만들기 전으로 돌아간다
    expect(s().doc.boxes).toHaveLength(0);
  });
});
