// 캔버스 위의 워크박스 하나

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { KIND_LABEL, uid } from '../boxes';
import { formatNumber, parseNumberInput, type BoxResult } from '../formula';
import { useStore } from '../store';
import { themed } from '../theme';
import type { Box, CheckItem } from '../types';

interface Props {
  box: Box;
  selected: boolean;
  single: boolean;
  editing: boolean;
  result: BoxResult | undefined;
  zoom: number;
  /** 안에 다른 박스가 들어 있으면 점 모눈을 그린다 */
  hasChildren: boolean;
  /** 지금 끌고 있는 박스가 이 워크박스 안으로 들어갈 예정 */
  dropTarget: boolean;
}

const RADIUS: Record<Box['shape'], string> = { rect: '3px', rounded: '12px', ellipse: '50%', diamond: '0' };

function BoxViewImpl({ box, selected, single, editing, result, zoom, hasChildren, dropTarget }: Props) {
  const innerRef = useRef<HTMLDivElement>(null);
  const theme = useStore((s) => s.theme);
  const fill = themed(box.fill, theme);
  const stroke = themed(box.stroke, theme);
  const isDiamond = box.shape === 'diamond';
  const isEllipse = box.shape === 'ellipse';
  const hasStroke = box.stroke !== 'none';

  // 글을 입력하는 동안에만 내용이 넘치면 높이를 늘린다 (그 밖에는 크기를 마음대로 줄일 수 있다).
  // box-inner 는 min-height: 100% 라서, 내용이 넘칠 때만 박스보다 커진다.
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el || !editing || box.kind === 'image' || box.kind === 'shape') return;
    const border = box.stroke !== 'none' && box.shape !== 'diamond' ? 3 : 0;
    const needed = el.offsetHeight + border;
    if (needed > box.h + 1) {
      useStore.getState().changeSilently((d) => ({
        ...d,
        boxes: d.boxes.map((b) => (b.id === box.id ? { ...b, h: Math.ceil(needed) } : b)),
      }));
    }
  });

  const bare = box.kind === 'text' && box.fill === 'transparent' && !hasStroke;
  const pad = isEllipse
    ? `${Math.round(box.h * 0.16)}px ${Math.round(box.w * 0.16)}px`
    : isDiamond
      ? `${Math.round(box.h * 0.22)}px ${Math.round(box.w * 0.24)}px`
      : box.kind === 'image'
        ? '8px'
        : bare
          ? '4px 2px'
          : '12px 14px';

  const showHeader = box.kind !== 'image' && box.kind !== 'shape' && (box.name.trim() !== '' || box.kind !== 'text');
  const centered = isEllipse || isDiamond || box.align === 'center';
  const handle = 9 / zoom;
  // 점 모눈은 캔버스의 점과 같은 자리(24px 격자)에 오도록 맞춘다
  const dots =
    box.kind === 'shape' && hasChildren
      ? {
          backgroundImage: `radial-gradient(circle, var(--dot) 1.15px, transparent 1.65px)`,
          backgroundSize: '24px 24px',
          backgroundPosition: `${-box.x - 12}px ${-box.y - 12}px`,
          backgroundOrigin: 'border-box' as const,
        }
      : null;

  return (
    <div
      data-box-id={box.id}
      className={`box kind-${box.kind}${selected ? ' selected' : ''}${editing ? ' editing' : ''}${dropTarget ? ' drop-target' : ''}`}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        backgroundColor: isDiamond ? 'transparent' : fill,
        ...(isDiamond ? null : dots),
        border: isDiamond || !hasStroke ? 'none' : `1.5px solid ${stroke}`,
        borderRadius: RADIUS[box.shape],
        boxShadow: box.fill === 'transparent' || isDiamond ? 'none' : undefined,
        outlineWidth: selected || dropTarget ? 2 / zoom : 0,
        outlineOffset: (hasStroke ? 1 : 3) / zoom,
        overflow: isDiamond ? 'visible' : 'hidden',
      }}
    >
      {isDiamond && (
        <svg className="diamond-bg" viewBox={`0 0 ${box.w} ${box.h}`} preserveAspectRatio="none" aria-hidden="true">
          <polygon
            points={`${box.w / 2},1 ${box.w - 1},${box.h / 2} ${box.w / 2},${box.h - 1} 1,${box.h / 2}`}
            fill={fill}
            stroke={hasStroke ? stroke : 'none'}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      {isDiamond && dots && <div className="diamond-dots" style={dots} aria-hidden="true" />}
      {box.kind !== 'shape' && (
        <div ref={innerRef} className={`box-inner${centered ? ' centered' : ''}`} style={{ padding: pad }}>
          {showHeader && <Header box={box} centered={centered} />}
          <Content box={box} editing={editing} result={result} />
        </div>
      )}

      {selected && single && !editing && (
        <>
          {(['nw', 'ne', 'sw', 'se'] as const).map((c) => (
            <span
              key={c}
              data-handle={c}
              className={`handle handle-${c}`}
              style={{ width: handle, height: handle, borderWidth: 1.5 / zoom, margin: -handle / 2 - 0.5 / zoom }}
            />
          ))}
          <span
            data-connect-handle="right"
            className="connect-handle"
            title="끌어서 다른 박스와 연결"
            style={{ width: 14 / zoom, height: 14 / zoom, right: -24 / zoom, marginTop: -7 / zoom, borderWidth: 2 / zoom }}
          />
        </>
      )}
    </div>
  );
}

export const BoxView = memo(BoxViewImpl);

function Header({ box, centered }: { box: Box; centered: boolean }) {
  const mono = box.kind !== 'text';
  let right: React.ReactNode = null;
  if (box.kind === 'checklist') {
    const done = box.items.filter((i) => i.done).length;
    right = (
      <span className={`progress${done === box.items.length && done > 0 ? ' complete' : ''}`}>
        {done}/{box.items.length}
      </span>
    );
  } else if (box.kind !== 'text') {
    right = <span className={`badge badge-${box.kind}`}>{KIND_LABEL[box.kind]}</span>;
  }
  return (
    <div className={`box-header${centered ? ' centered' : ''}`}>
      <span className={mono ? 'box-name mono' : 'box-title'} title={mono ? '수식에서 이 이름으로 불러요' : undefined}>
        {box.name || (box.kind === 'number' || box.kind === 'formula' ? '(이름 없음)' : '')}
      </span>
      {right}
    </div>
  );
}

function Content({ box, editing, result }: { box: Box; editing: boolean; result: BoxResult | undefined }) {
  switch (box.kind) {
    case 'text':
      return <TextContent box={box} editing={editing} />;
    case 'number':
      return <NumberContent box={box} editing={editing} />;
    case 'formula':
      return <FormulaContent box={box} editing={editing} result={result} />;
    case 'checklist':
      return <ChecklistContent box={box} editing={editing} />;
    case 'image':
      return box.image ? (
        <img className="box-image" src={box.image} alt={box.name || '이미지'} draggable={false} />
      ) : (
        <div className="image-placeholder" title="더블클릭해서 이미지 고르기 · 파일을 끌어다 놓기">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="10" r="1.5" />
            <path d="M21 16l-5-5-8 8" />
          </svg>
        </div>
      );
    case 'shape':
      return null;
  }
}

const stopEditing = () => {
  const s = useStore.getState();
  const id = s.editingId;
  s.setEditing(null);
  // 아무것도 쓰지 않은 텍스트 박스는 남기지 않는다
  if (id) s.discardIfEmpty(id);
};

function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return <textarea ref={ref} rows={1} {...props} />;
}

function TextContent({ box, editing }: { box: Box; editing: boolean }) {
  const style = { fontSize: box.fontSize, fontWeight: box.bold ? 700 : 400, textAlign: box.align };
  if (editing) {
    return (
      <AutoTextarea
        className="box-textarea"
        style={style}
        value={box.text}
        onChange={(e) => useStore.getState().updateBox(box.id, { text: e.target.value }, `${box.id}:text`)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            stopEditing();
          }
        }}
        onBlur={stopEditing}
      />
    );
  }
  return (
    <div className="box-text" style={style}>
      {box.text}
    </div>
  );
}

function NumberContent({ box, editing }: { box: Box; editing: boolean }) {
  const [draft, setDraft] = useState(box.value === null ? '' : String(box.value));
  useEffect(() => {
    // 편집을 시작할 때만 초안을 맞춘다
    if (editing) setDraft(box.value === null ? '' : String(box.value));
  }, [editing]);
  if (editing) {
    return (
      <input
        className="box-input big"
        autoFocus
        inputMode="decimal"
        value={draft}
        placeholder="숫자"
        onChange={(e) => {
          setDraft(e.target.value);
          const v = parseNumberInput(e.target.value);
          if (v !== null || e.target.value.trim() === '') useStore.getState().updateBox(box.id, { value: v }, `${box.id}:value`);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            stopEditing();
          }
        }}
        onBlur={stopEditing}
        onFocus={(e) => e.target.select()}
      />
    );
  }
  return <div className="box-value">{box.value === null ? <span className="muted">—</span> : formatNumber(box.value, box.format)}</div>;
}

function FormulaContent({ box, editing, result }: { box: Box; editing: boolean; result: BoxResult | undefined }) {
  return (
    <>
      {editing ? (
        <input
          className="box-input mono formula-input"
          autoFocus
          value={box.formula}
          placeholder="= 이름 + 이름"
          onChange={(e) => useStore.getState().updateBox(box.id, { formula: e.target.value }, `${box.id}:formula`)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.preventDefault();
              stopEditing();
            }
          }}
          onBlur={stopEditing}
        />
      ) : (
        <div className="formula-text mono">{box.formula.trim() || '='}</div>
      )}
      {result?.error !== undefined ? (
        <div className="formula-error">{result.error}</div>
      ) : (
        <div className="box-value">{result?.value !== undefined ? formatNumber(result.value, box.format) : '—'}</div>
      )}
    </>
  );
}

function ChecklistContent({ box, editing }: { box: Box; editing: boolean }) {
  const setItems = (items: CheckItem[], key?: string) => useStore.getState().updateBox(box.id, { items }, key);
  const focusId = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 편집을 시작하면 마지막 항목에 커서를 둔다
  useEffect(() => {
    if (!editing || !listRef.current) return;
    const inputs = listRef.current.querySelectorAll<HTMLInputElement>('input.check-input');
    inputs[inputs.length - 1]?.focus();
  }, [editing]);

  // Enter / Backspace 로 항목을 더하거나 지운 뒤 커서를 옮긴다
  useEffect(() => {
    if (!focusId.current || !listRef.current) return;
    listRef.current.querySelector<HTMLInputElement>(`[data-item-id="${focusId.current}"]`)?.focus();
    focusId.current = null;
  });

  return (
    <div
      className="checklist"
      ref={listRef}
      onBlur={(e) => {
        if (editing && !e.currentTarget.contains(e.relatedTarget as Node)) stopEditing();
      }}
    >
      {box.items.map((item, idx) => (
        <label key={item.id} className={`check-item${item.done ? ' done' : ''}`} data-no-drag>
          <input
            type="checkbox"
            checked={item.done}
            onChange={() => setItems(box.items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))}
          />
          {editing ? (
            <input
              type="text"
              className="check-input"
              data-item-id={item.id}
              value={item.text}
              placeholder="할 일"
              onChange={(e) => setItems(box.items.map((i) => (i.id === item.id ? { ...i, text: e.target.value } : i)), `${box.id}:item-text`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const n: CheckItem = { id: uid(), text: '', done: false };
                  focusId.current = n.id;
                  const next = [...box.items];
                  next.splice(idx + 1, 0, n);
                  setItems(next);
                } else if (e.key === 'Backspace' && item.text === '' && box.items.length > 1) {
                  e.preventDefault();
                  focusId.current = box.items[Math.max(0, idx - 1)].id;
                  setItems(box.items.filter((i) => i.id !== item.id));
                } else if (e.key === 'Escape') {
                  stopEditing();
                }
              }}
            />
          ) : (
            <span className="check-text">{item.text}</span>
          )}
        </label>
      ))}
    </div>
  );
}
