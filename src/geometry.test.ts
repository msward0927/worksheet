import { describe, expect, it } from 'vitest';
import { makeBox } from './boxes';
import { edgeGeometry } from './geometry';

describe('연결선 테두리', () => {
  const a = makeBox('text', 0, 0, { w: 100, h: 40 });
  const b = makeBox('text', 300, 200, { w: 100, h: 40 });

  it('자동이면 위치에 맞는 테두리', () => {
    const g = edgeGeometry(a, b, 'curved');
    expect(g.start).toEqual({ x: 100, y: 20 });
    expect(g.end).toEqual({ x: 300, y: 220 });
  });

  it('정한 테두리 가운데에 붙고, 화살표는 테두리 안쪽을 향한다', () => {
    const g = edgeGeometry(a, b, 'curved', 'bottom', 'top');
    expect(g.start).toEqual({ x: 50, y: 40 });
    expect(g.end).toEqual({ x: 350, y: 200 });
    expect(g.endDir).toEqual({ x: -0, y: 1 });
    const r = edgeGeometry(a, b, 'straight', 'right', 'left');
    expect(r.start).toEqual({ x: 100, y: 20 });
    expect(r.end).toEqual({ x: 300, y: 220 });
  });

  it('꺾은선: 가로에서 세로로 한 번 꺾는다', () => {
    const g = edgeGeometry(a, b, 'elbow', 'right', 'top');
    expect(g.d).toBe('M100 20 L350 20 L350 200');
    expect(g.endDir).toEqual({ x: 0, y: 1 });
  });
});
