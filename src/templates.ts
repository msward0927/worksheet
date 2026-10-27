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

/** 글을 바로 쓴 워크박스. 첫 줄이 제목으로 굵게 보인다 */
const card = (x: number, y: number, w: number, h: number, text: string, patch: Partial<Box> = {}): Box =>
  makeBox('shape', x, y, { w, h, text, titleLine: true, fontSize: 14, lineHeight: 1.65, padding: 16, ...patch });

/** 다른 박스를 담는 워크박스. 박스 자신의 글이 왼쪽 위 제목이 된다 */
const group = (x: number, y: number, w: number, h: number, title: string, patch: Partial<Box> = {}): Box =>
  makeBox('shape', x, y, { w, h, text: title, bold: true, fontSize: 14, padding: 14, fill: '#FBFAF7', stroke: '#E3DFD6', ...patch });

const sticky = (x: number, y: number, w: number, h: number, text: string, parentId: string | null = null): Box =>
  card(x, y, w, h, text, { shape: 'rect', fill: '#FFF4C7', stroke: '#E8D88A', parentId });

/** 이름과 설명을 가운데에 쓴 원형 워크박스 */
const person = (x: number, y: number, text: string, fill: string, stroke: string, parentId: string): Box =>
  card(x, y, 168, 168, text, { shape: 'ellipse', fill, stroke, align: 'center', valign: 'middle', fontSize: 13, lineHeight: 1.55, padding: null, parentId });

function infoNote(): Doc {
  const flight = card(48, 120, 250, 150, '항공권\n가는 편 · 11/14(금) 09:20\n오는 편 · 11/17(월) 19:40\n수하물 15kg 포함');
  const hotel = card(48, 336, 250, 132, '숙소\n난바역 도보 5분\n체크인 15:00 · 체크아웃 11:00');
  const places = makeBox('checklist', 384, 204, {
    name: '가볼곳',
    shape: 'ellipse',
    w: 264,
    h: 264,
    items: items(['도톤보리', true], ['오사카성', true], ['구로몬 시장', false], ['우메다 전망대', false]),
  });
  const photo = makeBox('image', 384, 528, { w: 264, h: 180 });
  const memo = sticky(48, 528, 250, 132, '메모\n교통패스는 공항에서 바로 구매.\n환전은 출발 전날까지.\nhttps://www.japan.travel/ko/');
  // 예산 관련 박스를 하나의 워크박스 안에 담는다
  const money = group(696, 72, 456, 408, '예산 정리', { fill: '#F3F1EC', stroke: '#D6D1C6' });
  const budgetBox = makeBox('number', 720, 120, { name: '예산', value: 800000, format: 'currency', w: 192, h: 84, parentId: money.id });
  const spent = makeBox('number', 936, 120, { name: '지출', value: 612000, format: 'currency', w: 192, h: 84, parentId: money.id });
  const left = makeBox('formula', 792, 336, { name: '남은돈', formula: '= 예산 - 지출', format: 'currency', w: 264, h: 116, parentId: money.id });
  return {
    ...emptyDoc('여행 준비'),
    boxes: normalizeOrder([heading(48, 24, '오사카 여행 준비'), caption(48, 70, '정보 노트 · 11월 14일 – 17일'), flight, hotel, places, photo, memo, money, budgetBox, spent, left]),
    edges: [
      makeEdge(flight.id, hotel.id, { label: '도착 후', curve: 'straight' }),
      makeEdge(hotel.id, places.id, { label: '동선', style: 'dashed', arrow: 'none', color: '#8A857A' }),
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
  const cast = group(72, 96, 624, 408, '인물 관계');
  const harin = person(96, 132, '하린\n주인공 · 17세\n견습 지도 제작자', '#FCE5D6', '#D9A27E', cast.id);
  const doyun = person(504, 132, '도윤\n스승 · 50대\n비밀을 숨긴 노장', '#E3ECFF', '#93AEE6', cast.id);
  const sea = person(300, 312, '세아\n라이벌 · 18세\n탐사대 대장', '#ECE4FA', '#B7A0E3', cast.id);
  const act = (x: number, text: string, dashed = false) =>
    card(x, 588, 228, 148, text, { fill: dashed ? '#FBFAF7' : '#FFFFFF', stroke: dashed ? '#B9B3A6' : '#E3DFD6' });
  const a1 = act(48, '1막 · 시작\n변방 마을의 견습 지도 제작자 하린, 어떤 지도에도 없는 섬을 발견한다.');
  const a2 = act(336, '2막 · 갈등\n섬을 먼저 차지하려는 세아의 탐사대와 경쟁이 시작된다.');
  const a3 = act(624, '3막 · 위기\n도윤이 숨겨 온 옛 지도의 비밀이 드러나고, 셋의 관계가 흔들린다.');
  const a4 = act(912, '결말\n[결말 미정] 섬을 지도에 남길 것인가, 지울 것인가?', true);
  return {
    ...emptyDoc('스토리 보드'),
    boxes: normalizeOrder([
      heading(48, 24, '장편 구상 — 지도 제작자'),
      caption(48, 68, '인물 관계 · 사건 흐름 · 세계관 · Tab 을 누르면 다음 장면 박스가 생겨요'),
      cast,
      harin,
      doyun,
      sea,
      makeBox('image', 780, 120, { w: 260, h: 200 }),
      makeBox('text', 48, 552, { ...plain, text: '사건 흐름', w: 160, h: 28, fontSize: 13, bold: true }),
      a1,
      a2,
      a3,
      a4,
      sticky(48, 784, 260, 124, '떡밥 목록\n· 도윤의 왼손 화상 자국\n· 세아가 가진 찢어진 지도 반쪽'),
      card(336, 784, 320, 124, '세계관 규칙\n1. 지도에 그린 땅은 실제로 생겨난다.\n2. 지우면 그 땅의 기억도 사라진다.'),
    ]),
    edges: [
      makeEdge(harin.id, doyun.id, { label: '스승', curve: 'straight' }),
      makeEdge(doyun.id, sea.id, { label: '옛 동료', curve: 'straight', style: 'dashed', arrow: 'none', color: '#8A857A' }),
      makeEdge(harin.id, sea.id, { label: '라이벌', curve: 'straight', arrow: 'both', color: '#7A52C7', width: 2.4 }),
      makeEdge(a1.id, a2.id, { label: '계기' }),
      makeEdge(a2.id, a3.id, { label: '폭로' }),
      makeEdge(a3.id, a4.id, { style: 'dashed', color: '#8A857A' }),
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
      sticky(840, 336, 244, 204, '이번 주 목표\n헬스 3번\n기획안 완성\n책 한 권 끝내기'),
      total,
      done,
      rate,
      card(744, 672, 300, 116, '회고\n주 후반에 일정이 몰림.\n다음 주엔 헬스를 화·목·토로.'),
    ],
    edges: [makeEdge(total.id, rate.id, { color: '#8A857A' }), makeEdge(done.id, rate.id, { color: '#8A857A' })],
  };
}

/** 계정 장부: 이메일마다 가입한 곳을 분류별로 정리 (예시 데이터) */
function accounts(): Doc {
  type Cat = '업무 · 개발' | '구독' | '쇼핑' | '게임' | '금융';
  const CAT: Record<Cat, { chip: string; ink: string }> = {
    '업무 · 개발': { chip: '#E3ECFF', ink: '#2F5BD3' },
    구독: { chip: '#DDF3E6', ink: '#2F7A4B' },
    쇼핑: { chip: '#FFF4C7', ink: '#A6531A' },
    게임: { chip: '#FCE5D6', ink: '#A6531A' },
    금융: { chip: '#ECE4FA', ink: '#7A52C7' },
  };
  const list: { email: string; fill: string; stroke: string; ink: string; services: [Cat, string[]][] }[] = [
    {
      email: 'me.personal@example.com',
      fill: '#E3ECFF',
      stroke: '#2F5BD3',
      ink: '#2F5BD3',
      services: [
        ['구독', ['음악 스트리밍', '클라우드 저장소', '영상 OTT']],
        ['쇼핑', ['오픈마켓', '중고 거래']],
        ['금융', ['은행 앱', '간편 결제']],
      ],
    },
    {
      email: 'me.work@example.com',
      fill: '#DDF3E6',
      stroke: '#2F7A4B',
      ink: '#2F7A4B',
      services: [
        ['업무 · 개발', ['코드 저장소', '메신저', '디자인 툴', '클라우드 콘솔']],
        ['구독', ['클라우드 저장소']],
      ],
    },
    {
      email: 'me.game@example.com',
      fill: '#FCE5D6',
      stroke: '#A6531A',
      ink: '#A6531A',
      services: [['게임', ['게임 런처', '커뮤니티']], ['쇼핑', ['오픈마켓']]],
    },
  ];
  const boxes: Box[] = [
    heading(40, 24, '계정 장부', 32),
    makeBox('text', 40, 78, { ...plain, w: 900, h: 28, fontSize: 14, textColor: '#6B6760', text: '이메일마다 어디에 가입했는지 정리 · 비밀번호는 여기에 적지 않아요' }),
  ];
  const COL_W = 400;
  const TOP = 132;
  const CHIP_W = 158;
  const CHIP_H = 38;
  const shape = (x: number, y: number, w: number, h: number, text: string, patch: Partial<Box>) => makeBox('shape', x, y, { w, h, text, ...patch });
  list.forEach((acc, i) => {
    const x = 40 + i * (COL_W + 40);
    const col = shape(x, TOP, COL_W, 100, '', { fill: '#FBFAF7', stroke: '#E3DFD6' });
    const count = acc.services.reduce((n, [, l]) => n + l.length, 0);
    boxes.push(col);
    boxes.push(
      shape(x + 16, TOP + 16, COL_W - 32, 76, `${acc.email}\n가입 ${count}곳`, {
        fill: acc.fill,
        stroke: acc.stroke,
        textColor: acc.ink,
        fontSize: 17,
        bold: true,
        lineHeight: 1.45,
        align: 'center',
        valign: 'middle',
        parentId: col.id,
      }),
    );
    let y = TOP + 108;
    for (const [cat, names] of acc.services) {
      const rows = Math.ceil(names.length / 2);
      const h = 44 + rows * (CHIP_H + 10) + 6;
      const g = shape(x + 16, y, COL_W - 32, h, cat, { fontSize: 13, bold: true, textColor: CAT[cat].ink, padding: 12, parentId: col.id });
      boxes.push(g);
      names.forEach((svc, k) => {
        boxes.push(
          shape(x + 30 + (k % 2) * (CHIP_W + 12), y + 44 + Math.floor(k / 2) * (CHIP_H + 10), CHIP_W, CHIP_H, svc, {
            fill: CAT[cat].chip,
            stroke: 'none',
            fontSize: 14,
            align: 'center',
            valign: 'middle',
            padding: 4,
            parentId: g.id,
          }),
        );
      });
      y += h + 12;
    }
    col.h = y - TOP + 4;
  });
  boxes.push(
    sticky(40 + 3 * (COL_W + 40), TOP, 300, 190, '보안 메모\n· 이메일마다 다른 비밀번호 쓰기\n· 비밀번호는 비밀번호 관리자에 따로\n· 중요한 곳은 2단계 인증 켜기\n· 안 쓰는 서비스는 탈퇴하기'),
  );
  return { ...emptyDoc('계정 장부'), boxes: normalizeOrder(boxes) };
}

/** 할 일 보드: 할 일 → 하는 중 → 끝. 카드를 다른 칸으로 끌어다 놓으면 그 칸에 들어간다 */
function kanban(): Doc {
  const cols: [string, string, string[]][] = [
    ['할 일', '#F3F1EC', ['이사 견적 3곳 받기\n이번 주 금요일까지', '건강검진 예약', '여름옷 정리']],
    ['하는 중', '#E3ECFF', ['포트폴리오 정리\n프로젝트 2개 남음', '토익 공부\nLC 파트 3']],
    ['끝', '#DDF3E6', ['자동차 보험 갱신', '부모님 선물 주문']],
  ];
  const boxes: Box[] = [heading(48, 24, '할 일 보드'), caption(48, 68, '카드를 끌어서 다른 칸에 놓으면 옮겨져요 · 카드를 고르고 Ctrl+Enter 로 아래에 새 카드')];
  const W = 300;
  cols.forEach(([title, fill, cards], i) => {
    const x = 48 + i * (W + 32);
    const col = group(x, 112, W, 120 + 4 * 112, title, { fill, stroke: 'none', fontSize: 15 });
    boxes.push(col);
    cards.forEach((t, k) => {
      boxes.push(card(x + 16, 160 + k * 104, W - 32, 88, t, { fontSize: 13.5, lineHeight: 1.55, padding: 14, parentId: col.id, strike: i === 2 }));
    });
  });
  return { ...emptyDoc('할 일 보드'), boxes: normalizeOrder(boxes) };
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
  { id: 'kanban', title: '할 일 보드', desc: '할 일 · 하는 중 · 끝', make: kanban },
  { id: 'info', title: '정보 노트', desc: '여행 · 공부 · 자료 모으기', make: infoNote },
  { id: 'accounts', title: '계정 장부', desc: '이메일별 가입한 곳 정리', make: accounts },
];
