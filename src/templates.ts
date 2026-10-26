// 시작 화면의 템플릿. 각 템플릿은 새 Doc 을 만들어 돌려준다.

import { emptyDoc, makeBox, makeEdge, uid } from './boxes';
import { normalizeOrder } from './tree';
import type { Box, CheckItem, Doc } from './types';

const items = (...list: [string, boolean][]): CheckItem[] => list.map(([text, done]) => ({ id: uid(), text, done }));

const heading = (x: number, y: number, text: string, size = 28): Box =>
  makeBox('text', x, y, { text, fill: 'transparent', stroke: 'none', w: 520, h: size * 1.6, fontSize: size, bold: true });

const caption = (x: number, y: number, text: string): Box =>
  makeBox('text', x, y, { text, fill: 'transparent', stroke: 'none', w: 560, h: 28, fontSize: 13 });

const plain = { fill: 'transparent', stroke: 'none' } as const;

/** 제목과 본문 텍스트 박스를 품은 워크박스 */
function card(x: number, y: number, w: number, h: number, title: string, body: string, patch: Partial<Box> = {}): { shape: Box; boxes: Box[] } {
  const shape = makeBox('shape', x, y, { w, h, ...patch });
  const boxes = [shape, makeBox('text', x + 14, y + 12, { ...plain, w: w - 28, h: 28, text: title, bold: true, fontSize: 15, parentId: shape.id })];
  if (body) boxes.push(makeBox('text', x + 14, y + 42, { ...plain, w: w - 28, h: h - 52, text: body, fontSize: 13, parentId: shape.id }));
  return { shape, boxes };
}

/** 이름과 설명을 가운데에 둔 원형 워크박스 */
function person(x: number, y: number, name: string, desc: string, fill: string, stroke: string, parentId: string): { shape: Box; boxes: Box[] } {
  const d = 168;
  const shape = makeBox('shape', x, y, { w: d, h: d, shape: 'ellipse', fill, stroke, parentId });
  return {
    shape,
    boxes: [
      shape,
      makeBox('text', x + 20, y + 44, { ...plain, w: d - 40, h: 30, text: name, bold: true, fontSize: 17, align: 'center', parentId: shape.id }),
      makeBox('text', x + 20, y + 76, { ...plain, w: d - 40, h: 48, text: desc, fontSize: 13, align: 'center', parentId: shape.id }),
    ],
  };
}

function infoNote(): Doc {
  const flight = card(48, 120, 250, 136, '항공권', '가는 편 · 11/14(금) 09:20\n오는 편 · 11/17(월) 19:40\n수하물 15kg 포함');
  const hotel = card(48, 336, 250, 136, '숙소', '난바역 도보 5분\n체크인 15:00 · 체크아웃 11:00');
  const places = makeBox('checklist', 384, 204, {
    name: '가볼곳',
    shape: 'ellipse',
    w: 264,
    h: 264,
    items: items(['도톤보리', true], ['오사카성', true], ['구로몬 시장', false], ['우메다 전망대', false]),
  });
  const photo = makeBox('image', 384, 528, { w: 264, h: 180 });
  const memo = makeBox('text', 48, 528, {
    fill: '#FFF4C7',
    stroke: '#E8D88A',
    shape: 'rect',
    w: 250,
    h: 132,
    text: '메모\n교통패스는 공항에서 바로 구매.\n환전은 출발 전날까지.',
  });
  // 예산 관련 박스를 하나의 워크박스 안에 담는다
  const money = makeBox('shape', 672, 72, { w: 456, h: 408, fill: '#F3F1EC', stroke: '#D6D1C6' });
  const moneyTitle = makeBox('text', 696, 82, { ...plain, w: 200, h: 26, text: '예산 정리', bold: true, fontSize: 14, parentId: money.id });
  const budgetBox = makeBox('number', 696, 120, { name: '예산', value: 800000, format: 'currency', w: 192, h: 84, parentId: money.id });
  const spent = makeBox('number', 912, 120, { name: '지출', value: 612000, format: 'currency', w: 192, h: 84, parentId: money.id });
  const left = makeBox('formula', 768, 336, { name: '남은돈', formula: '= 예산 - 지출', format: 'currency', w: 264, h: 116, parentId: money.id });
  return {
    ...emptyDoc('오사카 여행 준비'),
    boxes: normalizeOrder([
      heading(48, 24, '오사카 여행 준비'),
      caption(48, 70, '정보 노트 · 11월 14일 – 17일'),
      ...flight.boxes,
      ...hotel.boxes,
      places,
      photo,
      memo,
      money,
      moneyTitle,
      budgetBox,
      spent,
      left,
    ]),
    edges: [
      makeEdge(flight.shape.id, hotel.shape.id, { label: '도착 후', curve: 'straight' }),
      makeEdge(hotel.shape.id, places.id, { label: '동선', style: 'dashed', arrow: 'none', color: '#8A857A' }),
      makeEdge(budgetBox.id, left.id),
      makeEdge(spent.id, left.id),
    ],
  };
}

function budget(): Doc {
  const n = (name: string, value: number, y: number) =>
    makeBox('number', 48, y, { name, value, format: 'currency', w: 200, h: 72 });
  const income = [n('월급', 2800000, 132), n('부수입', 150000, 216)];
  const spend = [n('식비', 420000, 360), n('교통비', 85000, 444), n('통신비', 55000, 528), n('월세', 650000, 612), n('구독', 27000, 696)];
  const fx = (name: string, formula: string, x: number, y: number, w = 240, h = 116) =>
    makeBox('formula', x, y, { name, formula, format: 'currency', w, h });
  const incomeSum = fx('수입합계', '= 월급 + 부수입', 312, 132);
  const spendSum = fx('지출합계', '= 식비 + 교통비 + 통신비 + 월세 + 구독', 312, 468, 264, 136);
  const balance = fx('잔액', '= 수입합계 - 지출합계', 648, 300, 252);
  const saving = fx('저축', '= 잔액 * 0.3', 648, 504, 252);
  const goal = makeBox('text', 960, 132, {
    fill: '#FFF4C7',
    stroke: '#E8D88A',
    shape: 'rect',
    w: 216,
    h: 108,
    text: '11월 목표\n식비 40만 원 이하\n구독 하나 해지하기',
  });
  return {
    ...emptyDoc('가계부'),
    boxes: [
      heading(48, 24, '10월 가계부'),
      caption(48, 68, '숫자 박스 값을 바꾸면 수식 박스가 자동으로 다시 계산돼요'),
      makeBox('text', 48, 100, { text: '수입', fill: 'transparent', stroke: 'none', w: 120, h: 28, fontSize: 13, bold: true }),
      ...income,
      makeBox('text', 48, 328, { text: '지출', fill: 'transparent', stroke: 'none', w: 120, h: 28, fontSize: 13, bold: true }),
      ...spend,
      incomeSum,
      spendSum,
      balance,
      saving,
      goal,
    ],
    edges: [
      ...income.map((b) => makeEdge(b.id, incomeSum.id, { color: '#8A857A', width: 1.4 })),
      ...spend.map((b) => makeEdge(b.id, spendSum.id, { color: '#8A857A', width: 1.4 })),
      makeEdge(incomeSum.id, balance.id, { color: '#8A857A', width: 1.4 }),
      makeEdge(spendSum.id, balance.id, { color: '#8A857A', width: 1.4 }),
      makeEdge(balance.id, saving.id, { label: '잔액의 30%', color: '#2F5BD3' }),
    ],
  };
}

function story(): Doc {
  // 인물들은 '인물 관계' 워크박스 안에 담는다
  const cast = makeBox('shape', 72, 96, { w: 624, h: 408, fill: '#FBFAF7', stroke: '#D6D1C6' });
  const castTitle = makeBox('text', 88, 104, { ...plain, w: 200, h: 26, text: '인물 관계', bold: true, fontSize: 14, parentId: cast.id });
  const harin = person(96, 132, '하린', '주인공 · 17세\n견습 지도 제작자', '#FCE5D6', '#D9A27E', cast.id);
  const doyun = person(504, 132, '도윤', '스승 · 50대\n비밀을 숨긴 노장', '#E3ECFF', '#93AEE6', cast.id);
  const sea = person(300, 312, '세아', '라이벌 · 18세\n탐사대 대장', '#ECE4FA', '#B7A0E3', cast.id);
  const act = (x: number, title: string, body: string, dashed = false) =>
    card(x, 588, 228, 140, title, body, { fill: dashed ? '#FBFAF7' : '#FFFFFF', stroke: dashed ? '#B9B3A6' : '#D6D1C6' });
  const a1 = act(48, '1막 · 시작', '변방 마을의 견습 지도 제작자 하린, 어떤 지도에도 없는 섬을 발견한다.');
  const a2 = act(336, '2막 · 갈등', '섬을 먼저 차지하려는 세아의 탐사대와 경쟁이 시작된다.');
  const a3 = act(624, '3막 · 위기', '도윤이 숨겨 온 옛 지도의 비밀이 드러나고, 셋의 관계가 흔들린다.');
  const a4 = act(912, '결말', '[결말 미정] 섬을 지도에 남길 것인가, 지울 것인가?', true);
  const rules = card(336, 780, 320, 120, '세계관 규칙', '1. 지도에 그린 땅은 실제로 생겨난다.\n2. 지우면 그 땅의 기억도 사라진다.');
  return {
    ...emptyDoc('스토리 보드'),
    boxes: normalizeOrder([
      heading(48, 24, '장편 구상 — 지도 제작자'),
      caption(48, 68, '인물 관계 · 사건 흐름 · 세계관'),
      cast,
      castTitle,
      ...harin.boxes,
      ...doyun.boxes,
      ...sea.boxes,
      makeBox('image', 780, 120, { w: 260, h: 200 }),
      makeBox('text', 48, 552, { ...plain, text: '사건 흐름', w: 160, h: 28, fontSize: 13, bold: true }),
      ...a1.boxes,
      ...a2.boxes,
      ...a3.boxes,
      ...a4.boxes,
      makeBox('text', 48, 780, {
        fill: '#FFF4C7',
        stroke: '#E8D88A',
        shape: 'rect',
        w: 260,
        h: 120,
        text: '떡밥 목록\n· 도윤의 왼손 화상 자국\n· 세아가 가진 찢어진 지도 반쪽',
      }),
      ...rules.boxes,
    ]),
    edges: [
      makeEdge(harin.shape.id, doyun.shape.id, { label: '스승', curve: 'straight' }),
      makeEdge(doyun.shape.id, sea.shape.id, { label: '옛 동료', curve: 'straight', style: 'dashed', arrow: 'none', color: '#8A857A' }),
      makeEdge(harin.shape.id, sea.shape.id, { label: '라이벌', curve: 'straight', arrow: 'both', color: '#7A52C7', width: 2.4 }),
      makeEdge(a1.shape.id, a2.shape.id, { label: '계기' }),
      makeEdge(a2.shape.id, a3.shape.id, { label: '폭로' }),
      makeEdge(a3.shape.id, a4.shape.id, { style: 'dashed', color: '#8A857A' }),
    ],
  };
}

function planner(): Doc {
  const days: [string, string, [string, boolean][]][] = [
    ['월요일', '10.26', [['기획안 초안', true], ['헬스', true], ['장보기', true]]],
    ['화요일', '10.27', [['팀 회의', true], ['영어 단어 30개', true], ['세탁', true]]],
    ['수요일', '10.28', [['기획안 수정', true], ['헬스', true], ['책 한 장 읽기', false]]],
    ['목요일', '10.29', [['병원 예약', true], ['친구 생일 선물', true]]],
    ['금요일', '10.30', [['주간 보고', true], ['헬스', false], ['저녁 약속 19:00', false]]],
    ['토요일', '10.31', [['대청소', false], ['가계부 정리', false]]],
    ['일요일', '11.1', [['다음 주 계획 세우기', false], ['산책', false]]],
  ];
  const dayBoxes = days.map(([name, , list], i) =>
    makeBox('checklist', 48 + (i % 4) * 264, 108 + Math.floor(i / 4) * 228, { name, w: 244, h: 204, items: items(...list) }),
  );
  const names = days.map(([n]) => n);
  const total = makeBox('formula', 48, 600, {
    name: '전체',
    formula: `= ${names.map((n) => `${n}.전체`).join(' + ')}`,
    w: 300,
    h: 132,
  });
  const done = makeBox('formula', 48, 756, {
    name: '완료',
    formula: `= ${names.map((n) => `${n}.완료`).join(' + ')}`,
    w: 300,
    h: 132,
  });
  const rate = makeBox('formula', 420, 672, { name: '완료율', formula: '= ROUND(완료 / 전체 * 100, 1)', format: 'percent', w: 264, h: 116 });
  return {
    ...emptyDoc('주간 플래너'),
    boxes: [
      heading(48, 24, '10월 넷째 주'),
      caption(48, 68, '10.26 (월) – 11.1 (일) · 체크하면 아래 통계가 바로 바뀌어요'),
      ...dayBoxes,
      makeBox('text', 840, 336, {
        fill: '#FFF4C7',
        stroke: '#E8D88A',
        shape: 'rect',
        w: 244,
        h: 204,
        text: '이번 주 목표\n헬스 3번\n기획안 완성\n책 한 권 끝내기',
      }),
      total,
      done,
      rate,
      makeBox('text', 744, 672, { name: '회고', w: 280, h: 116, text: '주 후반에 일정이 몰림.\n다음 주엔 헬스를 화·목·토로.' }),
    ],
    edges: [makeEdge(total.id, rate.id, { color: '#8A857A' }), makeEdge(done.id, rate.id, { color: '#8A857A' })],
  };
}

export interface Template {
  id: string;
  title: string;
  desc: string;
  make: () => Doc;
}

export const TEMPLATES: Template[] = [
  { id: 'blank', title: '빈 캔버스', desc: '점 모눈종이만', make: () => emptyDoc() },
  { id: 'budget', title: '가계부', desc: '숫자 박스 + 자동 계산', make: budget },
  { id: 'story', title: '스토리 보드', desc: '인물 관계 + 사건 흐름', make: story },
  { id: 'planner', title: '주간 플래너', desc: '요일별 체크 박스', make: planner },
  { id: 'info', title: '정보 노트', desc: '주제 하나, 박스 여러 개', make: infoNote },
];
