// 오른쪽 속성 패널: 선택한 박스/연결선의 형식, 이름, 수식, 모양, 색을 바꾼다

import { useEffect, useState } from 'react';
import { EDGE_COLORS, FILLS, KIND_LABEL, STROKES, TEXT_COLORS, uid } from '../boxes';
import { FONTS } from '../textStyle';
import { FUNCTION_NAMES, formatNumber, parseNumberInput, references, type BoxResult } from '../formula';
import { platform } from '../platform';
import { useStore, type AlignMode } from '../store';
import { themed } from '../theme';
import type { Box, BoxKind, Edge, NumberFormat, Shape, TextAlign, VAlign } from '../types';
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

const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

function Swatches({ colors, value, onChange, label }: { colors: string[]; value: string; onChange: (c: string) => void; label: (c: string) => string }) {
  const theme = useStore((s) => s.theme);
  const custom = !colors.some((c) => c.toLowerCase() === value.toLowerCase());
  return (
    <div className="swatches">
      {colors.map((c) =>
        c === '' ? (
          <button key="auto" className={`swatch auto${value === '' ? ' on' : ''}`} onClick={() => onChange('')} aria-label="기본 색" title="기본 색 (테마에 맞춤)">
            A
          </button>
        ) : (
          <button
            key={c}
            className={`swatch${c.toLowerCase() === value.toLowerCase() ? ' on' : ''}${c === 'transparent' || c === 'none' ? ' empty' : ''}`}
            style={{ background: c === 'none' || c === 'transparent' ? undefined : themed(c, theme) }}
            onClick={() => onChange(c)}
            aria-label={label(c)}
            title={label(c)}
          />
        ),
      )}
      {/* 팔레트에 없는 색은 직접 고른다 */}
      <label className={`swatch picker${custom ? ' on' : ''}`} title="색 직접 고르기" style={custom && isHex(value) ? { background: value } : undefined}>
        <input type="color" value={isHex(value) ? value : '#888888'} onChange={(e) => onChange(e.target.value)} aria-label="색 직접 고르기" />
      </label>
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
        <div className="panel-name">
          {box.name || (box.kind === 'text' ? box.text.split('\n')[0].slice(0, 24) || '텍스트 박스' : box.kind === 'shape' ? '워크박스' : '이름 없음')}
        </div>
      </div>

      <Section title="형식">
        <Seg<BoxKind>
          cols={3}
          value={box.kind}
          onChange={(k) => k !== box.kind && update(convertKind(box, k, result))}
          options={[
            { v: 'shape', label: '워크박스' },
            { v: 'text', label: 'Aa 텍스트' },
            { v: 'number', label: '123 숫자' },
            { v: 'formula', label: 'fx 수식' },
            { v: 'checklist', label: '☐ 체크' },
            { v: 'image', label: '이미지' },
          ]}
        />
      </Section>

      {(box.kind === 'number' || box.kind === 'formula' || box.kind === 'checklist' || box.name.trim() !== '') && (
        <label className="field">
          <span className="section-title">
            이름{box.kind !== 'text' && box.kind !== 'image' && <span className="hint"> · 수식에서 부를 때 사용</span>}
          </span>
          <input
            className={box.kind === 'text' ? '' : 'mono'}
            value={box.name}
            placeholder="예: 식비"
            onChange={(e) => update({ name: e.target.value }, `${box.id}:name`)}
          />
          {duplicateName && <span className="warn">같은 이름의 박스가 또 있어요. 수식에서 부를 수 없어요.</span>}
        </label>
      )}

      {box.kind === 'shape' && (
        <div className="muted small">
          워크박스에는 글을 직접 쓰지 않아요. 더블클릭하면 안에 텍스트 박스가 생기고, 다른 박스를 끌어다 넣을 수도 있어요. 안에 박스가 있으면 점 모눈이 보여요.
        </div>
      )}

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
                  if (!Number.isFinite(v)) return;
                  // 위치를 바꾸면 안에 든 박스도 함께 옮긴다
                  if (k === 'x') useStore.getState().moveBy([box.id], v - box.x, 0, `${box.id}:x`);
                  else if (k === 'y') useStore.getState().moveBy([box.id], 0, v - box.y, `${box.id}:y`);
                  else update({ [k]: Math.max(1, v) }, `${box.id}:${k}`);
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

const AlignIcon = ({ kind }: { kind: string }) => {
  const lines: Record<string, string> = {
    left: 'M4 6h16M4 10h10M4 14h16M4 18h10',
    center: 'M4 6h16M7 10h10M4 14h16M7 18h10',
    right: 'M4 6h16M10 10h10M4 14h16M10 18h10',
    top: 'M4 4h16M8 8h8M8 12h8',
    middle: 'M8 8h8M4 12h16M8 16h8',
    bottom: 'M8 12h8M8 16h8M4 20h16',
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <path d={lines[kind]} />
    </svg>
  );
};

function Slider({ label, value, min, max, step, unit, onChange, onReset, display }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; onReset?: () => void; display?: string }) {
  return (
    <label className="slider">
      <span className="slider-head">
        <span>{label}</span>
        <span className="hint">
          {display ?? `${value}${unit}`}
          {onReset && (
            <button
              type="button"
              className="link-btn"
              onClick={(e) => {
                e.preventDefault();
                onReset();
              }}
            >
              자동
            </button>
          )}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function TextFields({ box, update }: { box: Box; update: Upd }) {
  const autoPad = box.fill === 'transparent' && box.stroke === 'none' ? 2 : 12;
  const setSize = (n: number) => update({ fontSize: Math.min(200, Math.max(6, Math.round(n))) }, `${box.id}:fontSize`);
  return (
    <>
      <label className="field">
        <span className="section-title">내용</span>
        <textarea rows={4} value={box.text} onChange={(e) => update({ text: e.target.value }, `${box.id}:text`)} />
      </label>

      <Section title="글꼴">
        <select value={box.fontFamily} onChange={(e) => update({ fontFamily: e.target.value as Box['fontFamily'] })} aria-label="글꼴">
          {FONTS.map((f) => (
            <option key={f.v} value={f.v}>
              {f.label}
            </option>
          ))}
        </select>
        <div className="row">
          <button className="icon-btn bordered" onClick={() => setSize(box.fontSize - 1)} aria-label="글자 작게" title="글자 작게">
            A−
          </button>
          <label className="size-input">
            <input type="number" min={6} max={200} value={box.fontSize} onChange={(e) => Number.isFinite(Number(e.target.value)) && setSize(Number(e.target.value))} aria-label="글자 크기" />
            <span className="muted">px</span>
          </label>
          <button className="icon-btn bordered" onClick={() => setSize(box.fontSize + 1)} aria-label="글자 크게" title="글자 크게">
            A+
          </button>
          <select value="" onChange={(e) => e.target.value && setSize(Number(e.target.value))} aria-label="자주 쓰는 크기" className="size-preset">
            <option value="">크기</option>
            {[10, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80, 96].map((n) => (
              <option key={n} value={n}>
                {n}px
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="꾸밈">
        <div className="seg" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <button className={box.bold ? 'on' : ''} onClick={() => update({ bold: !box.bold })} aria-pressed={box.bold} title="굵게 (Ctrl+B)">
            <b>B</b>
          </button>
          <button className={box.italic ? 'on' : ''} onClick={() => update({ italic: !box.italic })} aria-pressed={box.italic} title="기울임 (Ctrl+I)">
            <i style={{ fontFamily: 'serif' }}>I</i>
          </button>
          <button className={box.underline ? 'on' : ''} onClick={() => update({ underline: !box.underline })} aria-pressed={box.underline} title="밑줄 (Ctrl+U)">
            <u>U</u>
          </button>
          <button className={box.strike ? 'on' : ''} onClick={() => update({ strike: !box.strike })} aria-pressed={box.strike} title="취소선">
            <s>S</s>
          </button>
        </div>
      </Section>

      <Section title="가로 정렬">
        <Seg<TextAlign>
          value={box.align}
          onChange={(align) => update({ align })}
          options={[
            { v: 'left', label: <AlignIcon kind="left" />, title: '왼쪽' },
            { v: 'center', label: <AlignIcon kind="center" />, title: '가운데' },
            { v: 'right', label: <AlignIcon kind="right" />, title: '오른쪽' },
          ]}
        />
      </Section>
      <Section title="세로 정렬">
        <Seg<VAlign>
          value={box.valign}
          onChange={(valign) => update({ valign })}
          options={[
            { v: 'top', label: <AlignIcon kind="top" />, title: '위' },
            { v: 'middle', label: <AlignIcon kind="middle" />, title: '가운데' },
            { v: 'bottom', label: <AlignIcon kind="bottom" />, title: '아래' },
          ]}
        />
      </Section>

      <Section title="글자 색">
        <Swatches colors={TEXT_COLORS} value={box.textColor} onChange={(textColor) => update({ textColor }, `${box.id}:textColor`)} label={(c) => c} />
      </Section>

      <Section title="간격">
        <Slider label="줄 간격" value={box.lineHeight} min={0.8} max={3} step={0.05} unit="" display={`${box.lineHeight.toFixed(2)}배`} onChange={(lineHeight) => update({ lineHeight }, `${box.id}:lineHeight`)} />
        <Slider label="자간" value={box.letterSpacing} min={-3} max={20} step={0.5} unit="px" onChange={(letterSpacing) => update({ letterSpacing }, `${box.id}:letterSpacing`)} />
        <Slider
          label="안쪽 여백"
          value={box.padding ?? autoPad}
          min={0}
          max={64}
          step={1}
          unit="px"
          display={box.padding === null ? `자동 (${autoPad}px)` : `${box.padding}px`}
          onChange={(padding) => update({ padding }, `${box.id}:padding`)}
          onReset={box.padding === null ? undefined : () => update({ padding: null })}
        />
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
