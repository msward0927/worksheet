import { useMemo } from 'react';
import { evaluateAll } from './formula';
import { useStore } from './store';

/** 모든 숫자/수식/체크 박스의 계산 결과. 박스가 바뀔 때만 다시 계산한다 */
export function useResults() {
  const boxes = useStore((s) => s.doc.boxes);
  return useMemo(() => evaluateAll(boxes), [boxes]);
}
