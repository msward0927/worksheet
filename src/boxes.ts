// 새 박스/연결선을 만들 때의 기본값과 색 팔레트

import { normalizeOrder } from './tree';
import type { Box, BoxKind, Doc, Edge, Tool } from './types';

let counter = 0;
export function uid(): string {
  counter = (counter + 1) % 1679616;
  return Date.now().toString(36) + counter.toString(36).padStart(4, '0') + Math.random().toString(36).slice(2, 6);
}

export const FILLS = ['#FFFFFF', '#FFF4C7', '#E3ECFF', '#DDF3E6', '#FCE5D6', '#ECE4FA', '#FDE2E7', '#F3F1EC', 'transparent'];
export const STROKES = ['#E3DFD6', '#9C978C', '#3D4148', '#2F5BD3', '#2F7A4B', '#A6531A', '#7A52C7', '#B23B3B', 'none'];
export const TEXT_COLORS = ['', '#1F2328', '#6B6760', '#2F5BD3', '#A6531A', '#2F7A4B', '#7A52C7', '#B23B3B'];
export const EDGE_COLORS = ['#3D4148', '#8A857A', '#2F5BD3', '#7A52C7', '#C2561B', '#2F7A4B', '#B23B3B'];

export const KIND_LABEL: Record<BoxKind, string> = {
  shape: '워크박스',
  text: 'Aa 텍스트',
  number: '123 숫자',
  formula: 'fx 수식',
  checklist: '☐ 체크',
  image: '이미지',
};

const DEFAULT_SIZE: Record<BoxKind, [number, number]> = {
  shape: [240, 168],
  text: [200, 36],
  number: [200, 84],
  formula: [240, 112],
  checklist: [240, 168],
  image: [260, 200],
};

export function makeBox(kind: BoxKind, x: number, y: number, patch: Partial<Box> = {}): Box {
  const [w, h] = DEFAULT_SIZE[kind];
  return {
    id: uid(),
    kind,
    x,
    y,
    w,
    h,
    shape: 'rounded',
    fill: '#FFFFFF',
    stroke: kind === 'formula' ? '#E2B48C' : kind === 'number' ? '#C9DAF8' : '#E3DFD6',
    name: '',
    text: '',
    value: null,
    formula: '',
    items: [],
    image: null,
    format: 'plain',
    fontSize: 14,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    titleLine: false,
    align: 'left',
    valign: 'top',
    textColor: '',
    fontFamily: 'sans',
    lineHeight: 1.6,
    letterSpacing: 0,
    padding: null,
    parentId: null,
    ...patch,
  };
}

/** 도구로 박스를 만들 때 쓰는 기본값 */
export function boxForTool(tool: Tool, x: number, y: number, existingNames: Set<string>): Box | null {
  const nextName = (base: string) => {
    for (let i = 1; ; i++) {
      const n = `${base}${i}`;
      if (!existingNames.has(n)) return n;
    }
  };
  switch (tool) {
    case 'rect':
      return makeBox('shape', x, y, { shape: 'rounded', align: 'center', valign: 'middle', fontSize: 16 });
    case 'ellipse':
      return makeBox('shape', x, y, { shape: 'ellipse', w: 180, h: 180, align: 'center', valign: 'middle', fontSize: 16 });
    case 'text':
      return makeBox('text', x, y, { fill: 'transparent', stroke: 'none', fontSize: 16 });
    case 'sticky':
      return makeBox('text', x, y, { fill: '#FFF4C7', stroke: '#E8D88A', shape: 'rect', w: 220, h: 160 });
    case 'number':
      return makeBox('number', x, y, { name: nextName('숫자'), value: 0 });
    case 'formula':
      return makeBox('formula', x, y, { name: nextName('계산'), formula: '= ' });
    case 'checklist':
      return makeBox('checklist', x, y, {
        name: nextName('할일'),
        items: [{ id: uid(), text: '', done: false }],
      });
    case 'image':
      return makeBox('image', x, y, { fill: '#FFFFFF' });
    default:
      return null;
  }
}

/** 이름을 부르는 박스(숫자/수식/체크)는 복사본 이름이 겹치지 않게 뒤에 숫자를 붙인다 */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const base = name.replace(/\d+$/, '');
  for (let i = 2; ; i++) {
    const n = `${base}${i}`;
    if (!taken.has(n)) return n;
  }
}

/** 박스들과 그 사이의 연결선을 새 id 로 복제한다. 위치는 그대로 둔다 */
export function cloneBoxes(boxes: Box[], edges: Edge[], allBoxes: Box[]): { boxes: Box[]; edges: Edge[]; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  const taken = new Set(allBoxes.map((b) => b.name.trim()).filter(Boolean));
  const clones = boxes.map((b) => {
    const id = uid();
    idMap.set(b.id, id);
    let name = b.name;
    if (name.trim() && (b.kind === 'number' || b.kind === 'formula' || b.kind === 'checklist')) {
      name = uniqueName(name.trim(), taken);
      taken.add(name);
    }
    return { ...b, id, name, items: b.items.map((i) => ({ ...i, id: uid() })) };
  });
  // 함께 복제한 부모를 가리키도록 바꾼다 (부모가 복제되지 않았으면 원래 부모 그대로)
  for (const c of clones) if (c.parentId && idMap.has(c.parentId)) c.parentId = idMap.get(c.parentId)!;
  const clonedEdges = edges
    .filter((e) => idMap.has(e.from) && idMap.has(e.to))
    .map((e) => ({ ...e, id: uid(), from: idMap.get(e.from)!, to: idMap.get(e.to)! }));
  return { boxes: clones, edges: clonedEdges, idMap };
}

export function makeEdge(from: string, to: string, patch: Partial<Edge> = {}): Edge {
  return {
    id: uid(),
    from,
    to,
    label: '',
    arrow: 'end',
    curve: 'curved',
    style: 'solid',
    color: '#3D4148',
    width: 1.6,
    fromSide: 'auto',
    toSide: 'auto',
    ...patch,
  };
}

export function emptyDoc(title = '제목 없음'): Doc {
  return { app: 'worksheet', version: 1, title, boxes: [], edges: [], view: { x: 0, y: 0, zoom: 1 } };
}

/** 파일에서 읽은 JSON 을 검사하고 빠진 값을 채운다 */
export function normalizeDoc(raw: unknown): Doc {
  if (!raw || typeof raw !== 'object') throw new Error('워크시트 파일이 아니에요');
  const r = raw as Partial<Doc>;
  if (r.app !== 'worksheet' || !Array.isArray(r.boxes) || !Array.isArray(r.edges)) {
    throw new Error('워크시트 파일이 아니에요');
  }
  const boxes = r.boxes.map((b) => makeBox(b.kind ?? 'text', b.x ?? 0, b.y ?? 0, { ...b, items: Array.isArray(b.items) ? b.items : [] }));
  const ids = new Set(boxes.map((b) => b.id));
  // 없는 부모나 순환하는 부모 관계는 끊는다
  const byId = new Map(boxes.map((b) => [b.id, b]));
  for (const b of boxes) {
    if (b.parentId && !ids.has(b.parentId)) b.parentId = null;
    const seen = new Set([b.id]);
    for (let p = b.parentId; p; p = byId.get(p)?.parentId ?? null) {
      if (seen.has(p)) {
        b.parentId = null;
        break;
      }
      seen.add(p);
    }
  }
  const edges = r.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => makeEdge(e.from, e.to, e));
  const v = r.view;
  const view = v && Number.isFinite(v.x) && Number.isFinite(v.y) && v.zoom > 0 ? v : { x: 0, y: 0, zoom: 1 };
  return { app: 'worksheet', version: 1, title: typeof r.title === 'string' ? r.title : '제목 없음', boxes: normalizeOrder(boxes), edges, view };
}
