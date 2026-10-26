// 수식 계산기.
//
// 문법
//   = 식비 + 교통비 * 2
//   = (월급 - 지출합계) / 2
//   = SUM(식비, 교통비, 통신비)
//   = [띄어 쓴 이름] + 1        대괄호로 공백이 있는 이름도 부를 수 있다
//   = 월요일.완료 / 월요일.전체  체크 박스의 완료 개수 / 전체 개수
//
// 지원: + - * / ( ) , 단항 -, × ÷ − 기호, 함수 SUM AVG MIN MAX ROUND ABS

import type { Box } from './types';

export class FormulaError extends Error {}

type Token =
  | { t: 'num'; v: number }
  | { t: 'name'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '(' | ')' | ',' };

const OP_ALIASES: Record<string, Token['v']> = {
  '+': '+',
  '-': '-',
  '−': '-',
  '*': '*',
  '×': '*',
  '/': '/',
  '÷': '/',
  '(': '(',
  ')': ')',
  ',': ',',
};

const NAME_START = /[\p{L}_]/u;
const NAME_PART = /[\p{L}\p{N}_.]/u;

export function tokenize(src: string): Token[] {
  let s = src.trim();
  if (s.startsWith('=')) s = s.slice(1);
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      // 쉼표는 함수 인자 구분에 쓰므로 숫자 안의 천 단위 쉼표는 받지 않는다
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const raw = s.slice(i, j);
      const v = Number(raw);
      if (raw === '' || raw === '.' || Number.isNaN(v)) throw new FormulaError(`숫자를 읽을 수 없어요: ${s.slice(i, j)}`);
      out.push({ t: 'num', v });
      i = j;
      continue;
    }
    if (c === '[') {
      const j = s.indexOf(']', i + 1);
      if (j < 0) throw new FormulaError('대괄호 ] 가 닫히지 않았어요');
      out.push({ t: 'name', v: s.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }
    if (NAME_START.test(c)) {
      let j = i;
      while (j < s.length && NAME_PART.test(s[j])) j++;
      out.push({ t: 'name', v: s.slice(i, j) });
      i = j;
      continue;
    }
    const op = OP_ALIASES[c];
    if (op) {
      out.push({ t: 'op', v: op } as Token);
      i++;
      continue;
    }
    throw new FormulaError(`알 수 없는 기호: ${c}`);
  }
  return out;
}

export type Node =
  | { k: 'num'; v: number }
  | { k: 'ref'; name: string }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] };

export function parse(src: string): Node {
  const toks = tokenize(src);
  if (toks.length === 0) throw new FormulaError('수식이 비어 있어요');
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => {
    const t = toks[p];
    return t !== undefined && t.t === 'op' && t.v === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) throw new FormulaError(`'${v}' 가 필요해요`);
    p++;
  };

  function expr(): Node {
    let a = term();
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as { v: '+' | '-' }).v;
      a = { k: 'bin', op, a, b: term() };
    }
    return a;
  }
  function term(): Node {
    let a = unary();
    while (isOp('*') || isOp('/')) {
      const op = (toks[p++] as { v: '*' | '/' }).v;
      a = { k: 'bin', op, a, b: unary() };
    }
    return a;
  }
  function unary(): Node {
    if (isOp('-')) {
      p++;
      return { k: 'neg', a: unary() };
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return primary();
  }
  function primary(): Node {
    const t = peek();
    if (!t) throw new FormulaError('수식이 중간에 끝났어요');
    if (t.t === 'num') {
      p++;
      return { k: 'num', v: t.v };
    }
    if (t.t === 'name') {
      p++;
      if (isOp('(')) {
        p++;
        const args: Node[] = [];
        if (!isOp(')')) {
          args.push(expr());
          while (isOp(',')) {
            p++;
            args.push(expr());
          }
        }
        expect(')');
        return { k: 'call', fn: t.v.toUpperCase(), args };
      }
      return { k: 'ref', name: t.v };
    }
    if (t.v === '(') {
      p++;
      const e = expr();
      expect(')');
      return e;
    }
    throw new FormulaError(`여기에 '${t.v}' 가 올 수 없어요`);
  }

  const node = expr();
  if (p < toks.length) {
    const t = toks[p];
    throw new FormulaError(`'${t.t === 'num' ? t.v : t.v}' 앞에 계산 기호가 빠졌어요`);
  }
  return node;
}

const FUNCS: Record<string, (xs: number[]) => number> = {
  SUM: (xs) => xs.reduce((a, b) => a + b, 0),
  AVG: (xs) => {
    if (xs.length === 0) throw new FormulaError('AVG 에 값이 없어요');
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  },
  MIN: (xs) => {
    if (xs.length === 0) throw new FormulaError('MIN 에 값이 없어요');
    return Math.min(...xs);
  },
  MAX: (xs) => {
    if (xs.length === 0) throw new FormulaError('MAX 에 값이 없어요');
    return Math.max(...xs);
  },
  ROUND: (xs) => {
    const [x, d = 0] = xs;
    if (x === undefined) throw new FormulaError('ROUND 에 값이 없어요');
    const f = 10 ** Math.round(d);
    return Math.round(x * f) / f;
  },
  ABS: (xs) => {
    if (xs.length !== 1) throw new FormulaError('ABS 는 값 하나만 받아요');
    return Math.abs(xs[0]);
  },
};
FUNCS.AVERAGE = FUNCS.AVG;
FUNCS['합계'] = FUNCS.SUM;
FUNCS['평균'] = FUNCS.AVG;

export const FUNCTION_NAMES = ['SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'ABS'];

export function evaluate(node: Node, resolve: (name: string) => number): number {
  switch (node.k) {
    case 'num':
      return node.v;
    case 'ref':
      return resolve(node.name);
    case 'neg':
      return -evaluate(node.a, resolve);
    case 'bin': {
      const a = evaluate(node.a, resolve);
      const b = evaluate(node.b, resolve);
      switch (node.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          if (b === 0) throw new FormulaError('0으로 나눌 수 없어요');
          return a / b;
      }
    }
    case 'call': {
      const fn = FUNCS[node.fn];
      if (!fn) throw new FormulaError(`모르는 함수: ${node.fn}`);
      return fn(node.args.map((a) => evaluate(a, resolve)));
    }
  }
}

/** 수식이 참조하는 이름 목록 (함수 이름 제외) */
export function references(src: string): string[] {
  try {
    const out = new Set<string>();
    const walk = (n: Node) => {
      if (n.k === 'ref') out.add(n.name);
      else if (n.k === 'neg') walk(n.a);
      else if (n.k === 'bin') {
        walk(n.a);
        walk(n.b);
      } else if (n.k === 'call') n.args.forEach(walk);
    };
    walk(parse(src));
    return [...out];
  } catch {
    return [];
  }
}

export interface BoxResult {
  value?: number;
  error?: string;
}

const DONE_SUFFIXES = ['완료', 'done'];
const TOTAL_SUFFIXES = ['전체', 'total'];
const LEFT_SUFFIXES = ['남음', 'left'];

/** 숫자/수식/체크 박스 전체의 값을 계산한다. 결과는 박스 id → 값 또는 오류 */
export function evaluateAll(boxes: Box[]): Map<string, BoxResult> {
  const byName = new Map<string, Box[]>();
  for (const b of boxes) {
    const n = b.name.trim();
    if (!n) continue;
    const list = byName.get(n) ?? [];
    list.push(b);
    byName.set(n, list);
  }

  const results = new Map<string, BoxResult>();
  const visiting = new Set<string>();

  function valueOf(box: Box): number {
    const cached = results.get(box.id);
    if (cached) {
      if (cached.error !== undefined) throw new FormulaError(`'${box.name}' 에 오류가 있어요`);
      return cached.value as number;
    }
    if (visiting.has(box.id)) throw new FormulaError(`순환 참조: '${box.name}' 가 자기 자신을 다시 불러요`);
    visiting.add(box.id);
    try {
      let v: number;
      if (box.kind === 'number') {
        if (box.value === null) throw new FormulaError(`'${box.name}' 에 숫자가 없어요`);
        v = box.value;
      } else if (box.kind === 'formula') {
        v = evaluate(parse(box.formula), resolve);
        if (!Number.isFinite(v)) throw new FormulaError('계산 결과가 숫자가 아니에요');
      } else if (box.kind === 'checklist') {
        v = box.items.filter((i) => i.done).length;
      } else {
        throw new FormulaError(`'${box.name}' 는 숫자 박스가 아니에요`);
      }
      results.set(box.id, { value: v });
      return v;
    } catch (e) {
      const msg = e instanceof FormulaError ? e.message : '계산할 수 없어요';
      results.set(box.id, { error: msg });
      throw e instanceof FormulaError ? e : new FormulaError(msg);
    } finally {
      visiting.delete(box.id);
    }
  }

  function lookup(name: string): Box {
    const list = byName.get(name);
    if (!list || list.length === 0) throw new FormulaError(`'${name}' 라는 박스가 없어요`);
    if (list.length > 1) throw new FormulaError(`'${name}' 라는 이름이 ${list.length}개 있어요`);
    return list[0];
  }

  function resolve(name: string): number {
    if (byName.has(name)) return valueOf(lookup(name));
    // 이름.완료 / 이름.전체 / 이름.남음
    const dot = name.lastIndexOf('.');
    if (dot > 0) {
      const base = name.slice(0, dot);
      const prop = name.slice(dot + 1).toLowerCase();
      const box = lookup(base);
      if (box.kind !== 'checklist') throw new FormulaError(`'.${prop}' 는 체크 박스에만 쓸 수 있어요`);
      const done = box.items.filter((i) => i.done).length;
      if (DONE_SUFFIXES.includes(prop)) return done;
      if (TOTAL_SUFFIXES.includes(prop)) return box.items.length;
      if (LEFT_SUFFIXES.includes(prop)) return box.items.length - done;
      throw new FormulaError(`'.${prop}' 는 모르는 속성이에요 (완료 / 전체 / 남음)`);
    }
    return valueOf(lookup(name));
  }

  for (const b of boxes) {
    if (b.kind !== 'number' && b.kind !== 'formula' && b.kind !== 'checklist') continue;
    if (results.has(b.id)) continue;
    try {
      valueOf(b);
    } catch {
      // 오류는 results 에 기록되어 있다
    }
  }
  return results;
}

const plainFmt = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 });
const moneyFmt = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });

export function formatNumber(v: number, format: Box['format']): string {
  if (format === 'currency') return (v < 0 ? '-₩' : '₩') + moneyFmt.format(Math.abs(v));
  if (format === 'percent') return pctFmt.format(v) + '%';
  return plainFmt.format(v);
}

/** 사용자가 입력한 숫자 문자열 ("₩1,200", "3.5%", " 12 ") 을 읽는다 */
export function parseNumberInput(s: string): number | null {
  const cleaned = s.replace(/[₩,\s%원]/g, '');
  if (cleaned === '') return null;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}
