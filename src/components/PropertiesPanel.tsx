// 오른쪽 속성 패널: 선택한 박스/연결선의 형식, 이름, 수식, 모양, 색을 바꾼다

import { useEffect, useState } from 'react';
import { EDGE_COLORS, FILLS, KIND_LABEL, STROKES, uid } from '../boxes';
import { FUNCTION_NAMES, formatNumber, parseNumberInput, references, type BoxResult } from '../formula';
import { platform } from '../platform';
import { useStore, type AlignMode } from '../store';
import { themed } from '../theme';
import type { Box, BoxKind, Edge, NumberFormat, Shape } from '../types';
import { useResults } from '../useResults';
import { Icon } from './icons';

export function PropertiesPanel() {
  const doc = useStore((s) => s.doc);
  const selected = useStore((s) => s.selected);
  const selectedEdge = useStore((s) => s.selectedEdge);
  const boxes = doc.boxes.filter((b) => selected.includes(b.id));
  const edge = selectedEdge ? doc.edges.find((e) => e.id === selectedEdge) : undefined;

  return (
    <aside className="panel" aria-label="속성">
      {edge ? (
        <EdgePanel edge={edge} boxes={doc.boxes} />
      ) : boxes.length === 1 ? (
        <BoxPanel key={boxes[0].id} box={boxes[0]} />
      ) : boxes.length > 1 ? (
        <MultiPanel boxes={boxes} />
      ) : (
        <DocPanel />
      )}
    </aside>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">
        {title}
        {hint && <span className="hint"> · {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange, cols }: { value: T; options: { v: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void; cols?: number }) {
  return (
    <div className="seg" style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.v} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)} title={o.title} aria-pressed={o.v === value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Swatches({ colors, value, onChange, label }: { colors: string[]; value: string; onChange: (c: string) => void; label: (c: string) => string }) {
  const theme = useStore((s) => s.theme);
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          key={c}
          className={`swatch${c === value ? ' on' : ''}${c === 'transparent' || c === 'none' ? ' empty' : ''}`}
          style={{ background: c === 'none' || c === 'transparent' ? undefined : themed(c, theme) }}
          onClick={() => onChange(c)}
          aria-label={label(c)}
          title={label(c)}
        />
      ))}
    </div>
  );
}

const fillLabel = (c: string) => (c === 'transparent' ? '배경 없음' : c);
const strokeLabel = (c: string) => (c === 'none' ? '테두리 없음' : c);

const SHAPES: { v: Shape; label: React.ReactNode; title: string }[] = [
  { v: 'rect', label: <Icon.shapeRect />, title: '사각형' },
  { v: 'rounded', label: <Icon.shapeRounded />, title: '둥근 사각형' },
  { v: 'ellipse', label: <Icon.shapeEllipse />, title: '원' },
  { v: 'diamond', label: <Icon.shapeDiamond />, title: '마름모' },
];

const FORMATS: { v: NumberFormat; label: string }[] = [
  { v: 'plain', label: '1,000' },
  { v: 'currency', label: '₩ 통화' },
  { v: 'percent', label: '%' },
];

function DocPanel() {
  const title = useStore((s) => s.doc.title);
  const count = useStore((s) => s.doc.boxes.length);
  const edges = useStore((s) => s.doc.edges.length);
  const open = useStore((s) => s.openSettings);
  return (
    <>
      <div className="panel-head">
        <div className="eyebrow">워크시트</div>
        <input className="title-input" value={title} onChange={(e) => useStore.getState().setTitle(e.target.value)} aria-label="워크시트 제목" />
        <div className="muted small">
          박스 {count}개 · 연결 {edges}개
        </div>
      </div>
      <div className="muted small">박스나 연결선을 고르면 여기에서 형식, 이름, 수식, 모양, 색을 바꿀 수 있어요.</div>
      <div className="help-links">
        <button className="btn" onClick={() => open('mouse')}>
          마우스 조작
        </button>
        <button className="btn" onClick={() => open('keys')}>
          단축키
        </button>
        <button className="btn" onClick={() => open('formula')}>
          수식 쓰는 법
        </button>
      </div>
    </>
  );
}

function convertKind(box: Box, kind: BoxKind, result: BoxResult | undefined): Partial<Box> {
  const patch: Partial<Box> = { kind };
  if (kind === 'number' && box.kind === 'formula' && result?.value !== undefined) patch.value = result.value;
  if (kind === 'formula' && box.kind === 'number' && !box.formula.trim()) patch.formula = box.value === null ? '= ' : `= ${box.value}`;
  if (kind === 'checklist' && box.items.length === 0) {
    const lines = box.text.split('\n').map((l) => l.trim()).filter(Boolean);
    patch.items = (lines.length ? lines : ['']).map((text) => ({ id: uid(), text, done: false }));
  }
  if (kind === 'text' && box.kind === 'checklist' && !box.text.trim()) patch.text = box.items.map((i) => i.text).join('\n');
  if ((kind === 'number' || kind === 'formula' || kind === 'checklist') && !box.name.trim()) {
    patch.name = { number: '숫자', formula: '계산', checklist: '할일' }[kind] + Math.floor(Math.random() * 90 + 10);
  }
  return patch;
}

function BoxPanel({ box }: { box: Box }) {
  const results = useResults();
  const boxes = useStore((s) => s.doc.boxes);
  const result = results.get(box.id);
  const update = (patch: Partial<Box>, key?: string) => useStore.getState().updateBox(box.id, patch, key);
  const duplicateName = box.name.trim() !== '' && boxes.some((b) => b.id !== box.id && b.name.trim() === box.name.trim());

  return (
    <>
      <div className="panel-head">
        <div className="eyebrow">{KIND_LABEL[box.kind]} 박스</div>
        <div className="panel-name">{box.name || (box.kind === 'text' ? box.text.split('\n')[0].slice(0, 24) || '글상자' : '이름 없음')}</div>
      </div>

      <Section title="형식">
        <Seg<BoxKind>
          cols={3}
          value={box.kind}
          onChange={(k) => k !== box.kind && update(convertKind(box, k, result))}
          options={[
            { v: 'text', label: 'Aa 텍스트' },
            { v: 'number', label: '123 숫자' },
            { v: 'formula', label: 'fx 수식' },
            { v: 'checklist', label: '☐ 체크' },
            { v: 'image', label: '이미지' },
          ]}
        />
      </Section>

      <label className="field">
        <span className="section-title">
          이름{box.kind !== 'text' && box.kind !== 'image' && <span className="hint"> · 수식에서 부를 때 사용</span>}
        </span>
        <input
          className={box.kind === 'text' ? '' : 'mono'}
          value={box.name}
          placeholder={box.kind === 'text' ? '제목 (선택)' : '예: 식비'}
          onChange={(e) => update({ name: e.target.value }, `${box.id}:name`)}
        />
        {duplicateName && <span className="warn">같은 이름의 박스가 또 있어요. 수식에서 부를 수 없어요.</span>}
      </label>

      {box.kind === 'text' && <TextFields box={box} update={update} />}
      {box.kind === 'number' && <NumberFields box={box} update={update} />}
      {box.kind === 'formula' && <FormulaFields box={box} update={update} result={result} />}
      {box.kind === 'checklist' && <ChecklistFields box={box} update={update} />}
      {box.kind === 'image' && <ImageFields box={box} update={update} />}

      <Section title="도형">
        <Seg<Shape> value={box.shape} options={SHAPES} onChange={(shape) => update({ shape })} />
      </Section>
      <Section title="채우기">
        <Swatches colors={FILLS} value={box.fill} onChange={(fill) => update({ fill })} label={fillLabel} />
      </Section>
      <Section title="테두리">
        <Swatches colors={STROKES} value={box.stroke} onChange={(stroke) => update({ stroke })} label={strokeLabel} />
      </Section>
      <Section title="위치와 크기">
        <div className="xywh">
          {(['x', 'y', 'w', 'h'] as const).map((k) => (
            <label key={k}>
              <span>{k.toUpperCase()}</span>
              <input
                type="number"
                value={Math.round(box[k])}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) update({ [k]: k === 'w' || k === 'h' ? Math.max(28, v) : v }, `${box.id}:${k}`);
                }}
              />
            </label>
          ))}
        </div>
      </Section>
      <ArrangeButtons />
    </>
  );
}

type Upd = (patch: Partial<Box>, key?: string) => void;

function TextFields({ box, update }: { box: Box; update: Upd }) {
  return (
    <>
      <label className="field">
        <span className="section-title">내용</span>
        <textarea rows={4} value={box.text} onChange={(e) => update({ text: e.target.value }, `${box.id}:text`)} />
      </label>
      <Section title="글자">
        <div className="row">
          <select value={box.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} aria-label="글자 크기">
            {[11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64].map((n) => (
              <option key={n} value={n}>
                {n}px
              </option>
            ))}
          </select>
          <button className={`chip${box.bold ? ' on' : ''}`} onClick={() => update({ bold: !box.bold })} aria-pressed={box.bold}>
            <b>굵게</b>
          </button>
        </div>
      </Section>
    </>
  );
}

function NumberFields({ box, update }: { box: Box; update: Upd }) {
  const [draft, setDraft] = useState(box.value === null ? '' : String(box.value));
  useEffect(() => {
    const parsed = parseNumberInput(draft);
    if (parsed !== box.value) setDraft(box.value === null ? '' : String(box.value));
    // 박스 값이 다른 곳(캔버스)에서 바뀌었을 때만 맞춘다
  }, [box.value]);
  return (
    <>
      <label className="field">
        <span className="section-title">값</span>
        <input
          inputMode="decimal"
          value={draft}
          placeholder="숫자"
          onChange={(e) => {
            setDraft(e.target.value);
            const v = parseNumberInput(e.target.value);
            if (v !== null || e.target.value.trim() === '') update({ value: v }, `${box.id}:value`);
          }}
        />
      </label>
      <Section title="표시 형식">
        <Seg<NumberFormat> value={box.format} options={FORMATS} onChange={(format) => update({ format })} />
      </Section>
    </>
  );
}

function FormulaFields({ box, update, result }: { box: Box; update: Upd; result: BoxResult | undefined }) {
  const results = useResults();
  const boxes = useStore((s) => s.doc.boxes);
  const used = new Set(references(box.formula));
  const insert = (token: string) => {
    const f = box.formula.trimEnd();
    const base = f === '' ? '=' : f;
    update({ formula: `${base} ${token}` });
  };
  const candidates = boxes.filter((b) => b.id !== box.id && b.name.trim() && (b.kind === 'number' || b.kind === 'formula' || b.kind === 'checklist'));
  const nameToken = (n: string) => (/^[\p{L}_][\p{L}\p{N}_.]*$/u.test(n) ? n : `[${n}]`);

  return (
    <>
      <label className="field">
        <span className="section-title">수식</span>
        <input className="mono formula-field" value={box.formula} placeholder="= 식비 + 교통비" onChange={(e) => update({ formula: e.target.value }, `${box.id}:formula`)} />
        {result?.error !== undefined ? (
          <span className="warn">{result.error}</span>
        ) : (
          <span className="result-line">
            결과 <b>{result?.value !== undefined ? formatNumber(result.value, box.format) : '—'}</b>
          </span>
        )}
      </label>
      <Section title="계산 기호">
        <div className="ops">
          {[
            ['+', '더하기'],
            ['-', '빼기'],
            ['*', '곱하기'],
            ['/', '나누기'],
            ['(', '여는 괄호'],
            [')', '닫는 괄호'],
          ].map(([op, label]) => (
            <button key={op} className="mono" onClick={() => insert(op)} aria-label={label} title={label}>
              {op}
            </button>
          ))}
        </div>
        <div className="chips">
          {FUNCTION_NAMES.map((fn) => (
            <button key={fn} className="chip mono" onClick={() => insert(`${fn}(`)}>
              {fn}()
            </button>
          ))}
        </div>
      </Section>
      <Section title="쓸 수 있는 박스" hint="눌러서 넣기">
        {candidates.length === 0 ? (
          <div className="muted small">이름이 있는 숫자 / 수식 / 체크 박스가 아직 없어요.</div>
        ) : (
          <div className="name-list">
            {candidates.map((b) => {
              const r = results.get(b.id);
              return (
                <button key={b.id} className={used.has(b.name.trim()) ? 'on' : ''} onClick={() => insert(nameToken(b.name.trim()))}>
                  <span className="mono">{b.name}</span>
                  <span className="muted">{r?.error !== undefined ? '오류' : r?.value !== undefined ? formatNumber(r.value, b.kind === 'checklist' ? 'plain' : b.format) : ''}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="muted small">
          체크 박스는 <span className="mono">이름.완료</span> <span className="mono">이름.전체</span> <span className="mono">이름.남음</span> 으로 개수를 불러요.
        </div>
      </Section>
      <Section title="표시 형식">
        <Seg<NumberFormat> value={box.format} options={FORMATS} onChange={(format) => update({ format })} />
      </Section>
    </>
  );
}

function ChecklistFields({ box, update }: { box: Box; update: Upd }) {
  const setItems = (items: Box['items'], key?: string) => update({ items }, key);
  return (
    <Section title="항목">
      <div className="item-list">
        {box.items.map((item) => (
          <div key={item.id} className="item-row">
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => setItems(box.items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))}
              aria-label="완료"
            />
            <input
              value={item.text}
              placeholder="할 일"
              onChange={(e) => setItems(box.items.map((i) => (i.id === item.id ? { ...i, text: e.target.value } : i)), `${box.id}:item-text`)}
            />
            <button className="icon-btn" aria-label="항목 지우기" onClick={() => setItems(box.items.filter((i) => i.id !== item.id))}>
              <Icon.close />
            </button>
          </div>
        ))}
        <button className="dashed" onClick={() => setItems([...box.items, { id: uid(), text: '', done: false }])}>
          + 항목 추가
        </button>
      </div>
      <div className="muted small">
        수식에서 <span className="mono">{box.name || '이름'}.완료</span> / <span className="mono">{box.name || '이름'}.전체</span> 로 개수를 쓸 수 있어요.
      </div>
    </Section>
  );
}

function ImageFields({ box, update }: { box: Box; update: Upd }) {
  return (
    <Section title="이미지">
      <div className="row">
        <button
          className="btn"
          onClick={async () => {
            const data = await platform.openImage();
            if (data) update({ image: data });
          }}
        >
          {box.image ? '이미지 바꾸기' : '이미지 고르기'}
        </button>
        {box.image && (
          <button className="btn" onClick={() => update({ image: null })}>
            지우기
          </button>
        )}
      </div>
      <div className="muted small">이미지 파일을 캔버스에 끌어다 놓거나 붙여넣어도 돼요.</div>
    </Section>
  );
}

function ArrangeButtons() {
  const s = useStore.getState();
  return (
    <Section title="정리">
      <div className="row wrap">
        <button className="btn" onClick={() => s.bringToFront()}>
          맨 앞으로
        </button>
        <button className="btn" onClick={() => s.sendToBack()}>
          맨 뒤로
        </button>
        <button className="btn" onClick={() => s.duplicate()}>
          복제
        </button>
        <button className="btn danger" onClick={() => s.deleteSelected()}>
          <Icon.trash /> 삭제
        </button>
      </div>
    </Section>
  );
}

function MultiPanel({ boxes }: { boxes: Box[] }) {
  const s = useStore.getState();
  const ids = boxes.map((b) => b.id);
  const aligns: { v: AlignMode; label: string }[] = [
    { v: 'left', label: '왼쪽' },
    { v: 'hcenter', label: '가운데' },
    { v: 'right', label: '오른쪽' },
    { v: 'top', label: '위' },
    { v: 'vcenter', label: '중간' },
    { v: 'bottom', label: '아래' },
  ];
  return (
    <>
      <div className="panel-head">
        <div className="eyebrow">여러 개 선택</div>
        <div className="panel-name">박스 {boxes.length}개</div>
      </div>
      <Section title="맞춤">
        <div className="seg" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {aligns.map((a) => (
            <button key={a.v} onClick={() => s.align(a.v)}>
              {a.label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="도형">
        <Seg<Shape> value={boxes[0].shape} options={SHAPES} onChange={(shape) => s.updateBoxes(ids, { shape })} />
      </Section>
      <Section title="채우기">
        <Swatches colors={FILLS} value={boxes[0].fill} onChange={(fill) => s.updateBoxes(ids, { fill })} label={fillLabel} />
      </Section>
      <Section title="테두리">
        <Swatches colors={STROKES} value={boxes[0].stroke} onChange={(stroke) => s.updateBoxes(ids, { stroke })} label={strokeLabel} />
      </Section>
      <ArrangeButtons />
    </>
  );
}

function EdgePanel({ edge, boxes }: { edge: Edge; boxes: Box[] }) {
  const s = useStore.getState();
  const update = (patch: Partial<Edge>, key?: string) => s.updateEdge(edge.id, patch, key);
  const name = (id: string) => {
    const b = boxes.find((x) => x.id === id);
    return b ? b.name || b.text.split('\n')[0].slice(0, 16) || KIND_LABEL[b.kind] : '?';
  };
  return (
    <>
      <div className="panel-head">
        <div className="eyebrow">연결선</div>
        <div className="panel-name">
          {name(edge.from)} {edge.arrow === 'both' ? '↔' : edge.arrow === 'end' ? '→' : '—'} {name(edge.to)}
        </div>
      </div>
      <label className="field">
        <span className="section-title">라벨</span>
        <input value={edge.label} placeholder="예: 라이벌, 원인 → 결과" onChange={(e) => update({ label: e.target.value }, `${edge.id}:label`)} />
      </label>
      <Section title="선 모양">
        <Seg
          value={edge.curve}
          onChange={(curve) => update({ curve })}
          options={[
            { v: 'straight', label: '직선' },
            { v: 'curved', label: '곡선' },
            { v: 'elbow', label: '꺾은선' },
          ]}
        />
      </Section>
      <Section title="화살표">
        <Seg
          value={edge.arrow}
          onChange={(arrow) => update({ arrow })}
          options={[
            { v: 'none', label: '없음' },
            { v: 'end', label: '한쪽 →' },
            { v: 'both', label: '양쪽 ↔' },
          ]}
        />
      </Section>
      <Section title="선 스타일">
        <Seg
          value={edge.style}
          onChange={(style) => update({ style })}
          options={[
            { v: 'solid', label: '실선' },
            { v: 'dashed', label: '점선' },
          ]}
        />
      </Section>
      <Section title="색">
        <Swatches colors={EDGE_COLORS} value={edge.color} onChange={(color) => update({ color })} label={(c) => c} />
      </Section>
      <label className="field">
        <span className="section-title">
          두께 <span className="hint">· {edge.width.toFixed(1)}px</span>
        </span>
        <input type="range" min={1} max={6} step={0.2} value={edge.width} onChange={(e) => update({ width: Number(e.target.value) }, `${edge.id}:width`)} />
      </label>
      <Section title="정리">
        <div className="row wrap">
          <button className="btn" onClick={() => update({ from: edge.to, to: edge.from })}>
            <Icon.swap /> 방향 바꾸기
          </button>
          <button className="btn danger" onClick={() => s.deleteSelected()}>
            <Icon.trash /> 삭제
          </button>
        </div>
      </Section>
    </>
  );
}
