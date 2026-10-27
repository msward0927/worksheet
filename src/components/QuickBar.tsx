// 빠른 편집 막대: 고른 박스(또는 연결선) 바로 위에 떠서 자주 쓰는 것만 바로 바꾼다

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EDGE_COLORS, FILLS, STROKES, TEXT_COLORS, uid } from '../boxes';
import { edgeGeometry } from '../geometry';
import { platform, shrinkImage } from '../platform';
import { useStore, type AlignMode } from '../store';
import { themed } from '../theme';
import type { Box, Edge, EdgeCurve, NumberFormat, TextAlign } from '../types';
import { SHAPES, Swatches, fillLabel, strokeLabel } from './controls';
import { Icon } from './icons';

type Pop = 'fill' | 'shape' | 'color' | 'align' | 'edgeColor' | null;

const ALIGN_NEXT: Record<TextAlign, TextAlign> = { left: 'center', center: 'right', right: 'left' };
const ALIGN_ICON: Record<TextAlign, () => JSX.Element> = { left: Icon.alignLeft, center: Icon.alignCenter, right: Icon.alignRight };
const ALIGN_LABEL: Record<TextAlign, string> = { left: '왼쪽 정렬', center: '가운데 정렬', right: '오른쪽 정렬' };
const FORMAT_NEXT: Record<NumberFormat, NumberFormat> = { plain: 'currency', currency: 'percent', percent: 'plain' };
const FORMAT_LABEL: Record<NumberFormat, string> = { plain: '1,000', currency: '₩', percent: '%' };
const CURVE_NEXT: Record<EdgeCurve, EdgeCurve> = { curved: 'straight', straight: 'elbow', elbow: 'curved' };
const CURVE_LABEL: Record<EdgeCurve, string> = { curved: '곡선', straight: '직선', elbow: '꺾은선' };

function Btn({ children, onClick, tip, on, danger }: { children: ReactNode; onClick: () => void; tip: string; on?: boolean; danger?: boolean }) {
  return (
    <button className={`qb-btn${on ? ' on' : ''}${danger ? ' danger' : ''}`} onClick={onClick} aria-label={tip} data-tip={tip} aria-pressed={on}>
      {children}
    </button>
  );
}

export function QuickBar() {
  const doc = useStore((s) => s.doc);
  const selected = useStore((s) => s.selected);
  const selectedEdge = useStore((s) => s.selectedEdge);
  const interacting = useStore((s) => s.interacting);
  const theme = useStore((s) => s.theme);
  const [pop, setPop] = useState<Pop>(null);
  const ref = useRef<HTMLDivElement>(null);

  // 선택이 바뀌면 열린 팝업을 닫는다
  useEffect(() => setPop(null), [selected, selectedEdge]);
  useEffect(() => {
    if (!pop) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setPop(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [pop]);

  if (interacting) return null;
  const boxes = doc.boxes.filter((b) => selected.includes(b.id));
  const edge = selectedEdge ? doc.edges.find((e) => e.id === selectedEdge) : undefined;
  if (boxes.length === 0 && !edge) return null;

  const { view } = doc;
  let left: number;
  let top: number;
  let bottom: number;
  if (edge) {
    const a = doc.boxes.find((b) => b.id === edge.from);
    const b = doc.boxes.find((x) => x.id === edge.to);
    if (!a || !b) return null;
    const g = edgeGeometry(a, b, edge.curve, edge.fromSide, edge.toSide);
    left = g.mid.x * view.zoom + view.x;
    top = g.mid.y * view.zoom + view.y - 18;
    bottom = g.mid.y * view.zoom + view.y + 18;
  } else {
    const x1 = Math.min(...boxes.map((b) => b.x));
    const x2 = Math.max(...boxes.map((b) => b.x + b.w));
    const y1 = Math.min(...boxes.map((b) => b.y));
    const y2 = Math.max(...boxes.map((b) => b.y + b.h));
    left = ((x1 + x2) / 2) * view.zoom + view.x;
    top = y1 * view.zoom + view.y - 14;
    bottom = y2 * view.zoom + view.y + 14;
  }
  // 위쪽에 자리가 없으면 아래에 띄운다
  const below = top < 56;
  const style = { left: Math.max(180, left), top: below ? bottom : top, transform: below ? 'translate(-50%, 0)' : undefined };
  const toggle = (p: Pop) => setPop(pop === p ? null : p);

  return (
    <div className="quickbar" ref={ref} style={style} onPointerDown={(e) => e.stopPropagation()}>
      {edge ? <EdgeTools edge={edge} pop={pop} toggle={toggle} /> : <BoxTools boxes={boxes} pop={pop} toggle={toggle} theme={theme} />}
      <span className="qb-sep" />
      {!edge && (
        <Btn tip="복제  Ctrl+D" onClick={() => useStore.getState().duplicate()}>
          <Icon.copy />
        </Btn>
      )}
      <Btn tip="삭제  Delete" danger onClick={() => useStore.getState().deleteSelected()}>
        <Icon.trash />
      </Btn>
      <Btn tip="자세히 (속성 패널)  Ctrl+." onClick={() => useStore.getState().setPanelOpen(true)}>
        <Icon.more />
      </Btn>
    </div>
  );
}

function BoxTools({ boxes, pop, toggle, theme }: { boxes: Box[]; pop: Pop; toggle: (p: Pop) => void; theme: 'light' | 'dark' }) {
  const s = useStore.getState();
  const ids = boxes.map((b) => b.id);
  const first = boxes[0];
  const update = (patch: Partial<Box>) => s.updateBoxes(ids, patch);
  const kinds = new Set(boxes.map((b) => b.kind));
  const textual = [...kinds].every((k) => k === 'shape' || k === 'text');
  const numeric = [...kinds].every((k) => k === 'number' || k === 'formula');
  const many = boxes.length > 1;
  const hasGroups = boxes.some((b) => b.kind === 'shape' && s.doc.boxes.some((c) => c.parentId === b.id));
  const AlignIcon = ALIGN_ICON[first.align] ?? Icon.alignLeft;

  return (
    <>
      <div className="qb-wrap">
        <Btn tip="채우기 · 테두리" on={pop === 'fill'} onClick={() => toggle('fill')}>
          <span className={`qb-dot${first.fill === 'transparent' ? ' empty' : ''}`} style={first.fill === 'transparent' ? undefined : { background: themed(first.fill, theme) }} />
        </Btn>
        {pop === 'fill' && (
          <div className="qb-pop">
            <span className="qb-pop-title">채우기</span>
            <Swatches colors={FILLS} value={first.fill} onChange={(fill) => update({ fill })} label={fillLabel} />
            <span className="qb-pop-title">테두리</span>
            <Swatches colors={STROKES} value={first.stroke} onChange={(stroke) => update({ stroke })} label={strokeLabel} />
          </div>
        )}
      </div>
      {textual && (
        <div className="qb-wrap">
          <Btn tip="모양" on={pop === 'shape'} onClick={() => toggle('shape')}>
            {SHAPES.find((x) => x.v === first.shape)?.label}
          </Btn>
          {pop === 'shape' && (
            <div className="qb-pop" style={{ minWidth: 0, flexDirection: 'row' }}>
              {SHAPES.map((sh) => (
                <Btn key={sh.v} tip={sh.title} on={first.shape === sh.v} onClick={() => update({ shape: sh.v })}>
                  {sh.label}
                </Btn>
              ))}
            </div>
          )}
        </div>
      )}
      {textual && (
        <>
          <span className="qb-sep" />
          <Btn tip="글자 작게" onClick={() => update({ fontSize: Math.max(6, first.fontSize - 2) })}>
            A−
          </Btn>
          <span className="qb-size" title="글자 크기">
            {first.fontSize}
          </span>
          <Btn tip="글자 크게" onClick={() => update({ fontSize: Math.min(200, first.fontSize + 2) })}>
            A+
          </Btn>
          <Btn tip="굵게  Ctrl+B" on={first.bold} onClick={() => update({ bold: !first.bold })}>
            <b>B</b>
          </Btn>
          <Btn tip="첫 줄을 제목으로" on={first.titleLine} onClick={() => update({ titleLine: !first.titleLine })}>
            <b style={{ fontSize: 12 }}>T₁</b>
          </Btn>
          <Btn tip={ALIGN_LABEL[first.align] ?? '정렬'} onClick={() => update({ align: ALIGN_NEXT[first.align] ?? 'left' })}>
            <AlignIcon />
          </Btn>
          <div className="qb-wrap">
            <Btn tip="글자 색" on={pop === 'color'} onClick={() => toggle('color')}>
              <span style={{ fontWeight: 800, color: first.textColor ? themed(first.textColor, theme) : undefined, borderBottom: '3px solid currentColor', lineHeight: 1 }}>A</span>
            </Btn>
            {pop === 'color' && (
              <div className="qb-pop">
                <span className="qb-pop-title">글자 색</span>
                <Swatches colors={TEXT_COLORS} value={first.textColor} onChange={(textColor) => update({ textColor })} label={(c) => c || '기본'} />
              </div>
            )}
          </div>
        </>
      )}
      {numeric && (
        <>
          <span className="qb-sep" />
          <Btn tip="표시 형식" onClick={() => update({ format: FORMAT_NEXT[first.format] })}>
            <span className="mono">{FORMAT_LABEL[first.format]}</span>
          </Btn>
        </>
      )}
      {!many && first.kind === 'checklist' && (
        <>
          <span className="qb-sep" />
          <Btn
            tip="항목 추가"
            onClick={() => {
              s.updateBox(first.id, { items: [...first.items, { id: uid(), text: '', done: false }] });
              s.setEditing(first.id);
            }}
          >
            <Icon.plus /> 항목
          </Btn>
        </>
      )}
      {!many && first.kind === 'image' && (
        <>
          <span className="qb-sep" />
          <Btn
            tip="이미지 바꾸기"
            onClick={async () => {
              const data = await platform.openImage();
              if (data) s.updateBox(first.id, { image: await shrinkImage(data) });
            }}
          >
            <Icon.image /> 바꾸기
          </Btn>
        </>
      )}
      {many && (
        <>
          <span className="qb-sep" />
          <div className="qb-wrap">
            <Btn tip="맞춤 · 간격" on={pop === 'align'} onClick={() => toggle('align')}>
              <Icon.layout />
            </Btn>
            {pop === 'align' && <AlignPop />}
          </div>
        </>
      )}
      <Btn tip="워크박스로 묶기  Ctrl+G" onClick={() => s.groupSelected()}>
        <Icon.group />
      </Btn>
      {hasGroups && (
        <Btn tip="묶음 풀기  Ctrl+Shift+G" onClick={() => s.ungroupSelected()}>
          풀기
        </Btn>
      )}
    </>
  );
}

function AlignPop() {
  const s = useStore.getState();
  const aligns: { v: AlignMode; label: string }[] = [
    { v: 'left', label: '왼쪽' },
    { v: 'hcenter', label: '가운데' },
    { v: 'right', label: '오른쪽' },
    { v: 'top', label: '위' },
    { v: 'vcenter', label: '중간' },
    { v: 'bottom', label: '아래' },
  ];
  return (
    <div className="qb-pop">
      <span className="qb-pop-title">맞춤</span>
      <div className="seg" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {aligns.map((a) => (
          <button key={a.v} onClick={() => s.align(a.v)}>
            {a.label}
          </button>
        ))}
      </div>
      <span className="qb-pop-title">간격 똑같이 (3개 이상)</span>
      <div className="seg" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <button onClick={() => s.distribute('h')}>가로</button>
        <button onClick={() => s.distribute('v')}>세로</button>
      </div>
    </div>
  );
}

function EdgeTools({ edge, pop, toggle }: { edge: Edge; pop: Pop; toggle: (p: Pop) => void }) {
  const s = useStore.getState();
  const update = (patch: Partial<Edge>) => s.updateEdge(edge.id, patch);
  const theme = useStore((st) => st.theme);
  return (
    <>
      <Btn tip="선 모양" onClick={() => update({ curve: CURVE_NEXT[edge.curve] })}>
        {CURVE_LABEL[edge.curve]}
      </Btn>
      <Btn tip="화살표" onClick={() => update({ arrow: edge.arrow === 'end' ? 'both' : edge.arrow === 'both' ? 'none' : 'end' })}>
        {edge.arrow === 'end' ? '→' : edge.arrow === 'both' ? '↔' : '—'}
      </Btn>
      <Btn tip="점선" on={edge.style === 'dashed'} onClick={() => update({ style: edge.style === 'dashed' ? 'solid' : 'dashed' })}>
        ┄
      </Btn>
      <div className="qb-wrap">
        <Btn tip="색" on={pop === 'edgeColor'} onClick={() => toggle('edgeColor')}>
          <span className="qb-dot" style={{ background: themed(edge.color, theme) }} />
        </Btn>
        {pop === 'edgeColor' && (
          <div className="qb-pop">
            <span className="qb-pop-title">선 색</span>
            <Swatches colors={EDGE_COLORS} value={edge.color} onChange={(color) => update({ color })} label={(c) => c} />
          </div>
        )}
      </div>
    </>
  );
}
