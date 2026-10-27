// 속성 패널과 빠른 편집 막대가 함께 쓰는 입력 부품

import { useStore } from '../store';
import { themed } from '../theme';
import type { NumberFormat, Shape } from '../types';
import { Icon } from './icons';

export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
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

export function Seg<T extends string>({ value, options, onChange, cols }: { value: T; options: { v: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void; cols?: number }) {
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

export const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

export function Swatches({ colors, value, onChange, label }: { colors: string[]; value: string; onChange: (c: string) => void; label: (c: string) => string }) {
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

export const fillLabel = (c: string) => (c === 'transparent' ? '배경 없음' : c);
export const strokeLabel = (c: string) => (c === 'none' ? '테두리 없음' : c);

export const SHAPES: { v: Shape; label: React.ReactNode; title: string }[] = [
  { v: 'rect', label: <Icon.shapeRect />, title: '사각형' },
  { v: 'rounded', label: <Icon.shapeRounded />, title: '둥근 사각형' },
  { v: 'ellipse', label: <Icon.shapeEllipse />, title: '원' },
  { v: 'diamond', label: <Icon.shapeDiamond />, title: '마름모' },
];

export const FORMATS: { v: NumberFormat; label: string }[] = [
  { v: 'plain', label: '1,000' },
  { v: 'currency', label: '₩ 통화' },
  { v: 'percent', label: '%' },
];

