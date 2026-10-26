// 텍스트 박스 글자 모양

import type { CSSProperties } from 'react';
import { themed, type Theme } from './theme';
import type { Box, FontFamily, VAlign } from './types';

export const FONTS: { v: FontFamily; label: string; stack: string }[] = [
  { v: 'sans', label: '기본 (맑은 고딕)', stack: 'var(--font)' },
  { v: 'serif', label: '명조 (바탕)', stack: "Batang, '바탕', AppleMyungjo, 'Noto Serif KR', serif" },
  { v: 'gulim', label: '굴림', stack: "Gulim, '굴림', 'Noto Sans KR', sans-serif" },
  { v: 'dotum', label: '돋움', stack: "Dotum, '돋움', 'Noto Sans KR', sans-serif" },
  { v: 'gungsuh', label: '궁서', stack: "Gungsuh, '궁서', 'Noto Serif KR', serif" },
  { v: 'mono', label: '고정폭', stack: 'var(--mono)' },
];

const VALIGN: Record<VAlign, CSSProperties['justifyContent']> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

/** 글자에 쓰는 스타일 (글꼴, 크기, 굵기, 꾸밈, 색, 줄 간격, 자간, 가로 정렬) */
export function textStyle(box: Box, theme: Theme): CSSProperties {
  const deco = [box.underline && 'underline', box.strike && 'line-through'].filter(Boolean).join(' ');
  return {
    fontFamily: FONTS.find((f) => f.v === box.fontFamily)?.stack,
    fontSize: box.fontSize,
    fontWeight: box.bold ? 700 : 400,
    fontStyle: box.italic ? 'italic' : 'normal',
    textDecoration: deco || 'none',
    color: box.textColor ? themed(box.textColor, theme) : undefined,
    lineHeight: box.lineHeight,
    letterSpacing: box.letterSpacing ? `${box.letterSpacing}px` : undefined,
    textAlign: box.align,
  };
}

/** 세로 정렬 (box-inner 의 flex 배치) */
export const verticalJustify = (box: Box) => VALIGN[box.valign] ?? 'flex-start';
