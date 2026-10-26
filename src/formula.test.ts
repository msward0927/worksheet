import { describe, expect, it } from 'vitest';
import { evaluateAll, formatNumber, parseNumberInput, references } from './formula';
import { makeBox } from './boxes';
import type { Box } from './types';

const num = (name: string, value: number | null): Box => makeBox('number', 0, 0, { name, value });
const fx = (name: string, formula: string): Box => makeBox('formula', 0, 0, { name, formula });

function run(boxes: Box[]) {
  const r = evaluateAll(boxes);
  return (b: Box) => r.get(b.id);
}

describe('evaluateAll', () => {
  it('사칙연산과 우선순위, 괄호', () => {
    const a = num('식비', 420000);
    const b = num('교통비', 85000);
    const s = fx('합계', '= 식비 + 교통비 * 2');
    const t = fx('괄호', '=(식비 + 교통비) / 5');
    const u = fx('음수', '= -식비 + 20000');
    const get = run([a, b, s, t, u]);
    expect(get(s)?.value).toBe(590000);
    expect(get(t)?.value).toBe(101000);
    expect(get(u)?.value).toBe(-400000);
  });

  it('수식이 다른 수식을 부른다 (가계부)', () => {
    const boxes = [
      num('월급', 2800000),
      num('부수입', 150000),
      fx('수입합계', '= 월급 + 부수입'),
      num('식비', 420000),
      num('월세', 650000),
      fx('지출합계', '= SUM(식비, 월세)'),
      fx('잔액', '= 수입합계 - 지출합계'),
      fx('저축', '= 잔액 × 0.3'),
    ];
    const get = run(boxes);
    expect(get(boxes[6])?.value).toBe(1880000);
    expect(get(boxes[7])?.value).toBeCloseTo(564000);
  });

  it('함수', () => {
    const boxes = [num('a', 1), num('b', 4), fx('avg', 'AVG(a, b)'), fx('mx', 'max(a,b,10)'), fx('r', 'ROUND(10 / 3, 2)')];
    const get = run(boxes);
    expect(get(boxes[2])?.value).toBe(2.5);
    expect(get(boxes[3])?.value).toBe(10);
    expect(get(boxes[4])?.value).toBe(3.33);
  });

  it('체크 박스의 완료/전체 개수', () => {
    const c = makeBox('checklist', 0, 0, {
      name: '월요일',
      items: [
        { id: '1', text: 'a', done: true },
        { id: '2', text: 'b', done: false },
        { id: '3', text: 'c', done: true },
      ],
    });
    const f = fx('율', '= 월요일.완료 / 월요일.전체 * 100');
    const g = fx('남은', '= 월요일.남음 + 월요일');
    const get = run([c, f, g]);
    expect(get(f)?.value).toBeCloseTo(66.666, 2);
    expect(get(g)?.value).toBe(3);
  });

  it('대괄호로 공백이 있는 이름', () => {
    const a = num('11월 식비', 300);
    const f = fx('x', '= [11월 식비] / 3');
    expect(run([a, f])(f)?.value).toBe(100);
  });

  it('오류: 없는 이름, 0 나누기, 순환 참조, 문법', () => {
    const a = fx('a', '= b + 1');
    const b = fx('b', '= a + 1');
    const z = fx('z', '= 1 / 0');
    const n = fx('n', '= 없는이름 + 1');
    const s = fx('s', '= 1 +');
    const d = fx('d', '= 1 2');
    const get = run([a, b, z, n, s, d]);
    expect(get(a)?.error).toMatch(/순환/);
    expect(get(b)?.error).toMatch(/순환/);
    expect(get(z)?.error).toMatch(/0으로/);
    expect(get(n)?.error).toMatch(/없어요/);
    expect(get(s)?.error).toBeDefined();
    expect(get(d)?.error).toBeDefined();
  });

  it('같은 이름이 두 개면 오류', () => {
    const boxes = [num('a', 1), num('a', 2), fx('f', '= a')];
    expect(run(boxes)(boxes[2])?.error).toMatch(/2개/);
  });

  it('빈 숫자 박스를 부르면 오류', () => {
    const boxes = [num('a', null), fx('f', '= a + 1')];
    expect(run(boxes)(boxes[1])?.error).toBeDefined();
  });
});

describe('도우미', () => {
  it('references', () => {
    expect(references('= SUM(식비, 교통비) + 월세').sort()).toEqual(['교통비', '식비', '월세'].sort());
    expect(references('= (')).toEqual([]);
  });

  it('formatNumber', () => {
    expect(formatNumber(1713000, 'currency')).toBe('₩1,713,000');
    expect(formatNumber(-500, 'currency')).toBe('-₩500');
    expect(formatNumber(61.111, 'percent')).toBe('61.1%');
    expect(formatNumber(1234.5, 'plain')).toBe('1,234.5');
  });

  it('parseNumberInput', () => {
    expect(parseNumberInput('₩1,200')).toBe(1200);
    expect(parseNumberInput(' 3.5 ')).toBe(3.5);
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('abc')).toBeNull();
  });
});
