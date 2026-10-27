import { describe, expect, it } from 'vitest';
import { normalizeDoc } from './boxes';
import { evaluateAll } from './formula';
import { TEMPLATES } from './templates';

describe('templates', () => {
  for (const t of TEMPLATES) {
    it(`${t.title}: 파일로 저장했다 다시 열어도 그대로이고 계산 오류가 없다`, () => {
      const doc = t.make();
      const again = normalizeDoc(JSON.parse(JSON.stringify(doc)));
      expect(again.boxes.length).toBe(doc.boxes.length);
      expect(again.edges.length).toBe(doc.edges.length);
      for (const r of evaluateAll(doc.boxes).values()) expect(r.error ?? null).toBeNull();
      // 부모는 항상 자식보다 먼저(아래에) 그려진다
      const order = new Map(doc.boxes.map((b, i) => [b.id, i]));
      for (const b of doc.boxes) if (b.parentId) expect(order.get(b.parentId)!).toBeLessThan(order.get(b.id)!);
    });
  }

  it('계정 장부 예시에는 실제 이메일이 들어가지 않는다', () => {
    const doc = TEMPLATES.find((t) => t.id === 'accounts')!.make();
    const emails = doc.boxes.flatMap((b) => b.text.match(/[\w.+-]+@[\w.-]+/g) ?? []);
    expect(emails.length).toBeGreaterThan(0);
    for (const e of emails) expect(e.endsWith('@example.com')).toBe(true);
  });
});
