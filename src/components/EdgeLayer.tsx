// 박스 사이의 연결선

import { memo } from 'react';
import { arrowHead, edgeGeometry, type EdgeGeometry } from '../geometry';
import { useStore } from '../store';
import { themed } from '../theme';
import type { Box, Edge } from '../types';

interface Props {
  edges: Edge[];
  boxes: Box[];
  selectedEdge: string | null;
  zoom: number;
}

function geometries(edges: Edge[], boxes: Box[]) {
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const out: { edge: Edge; g: EdgeGeometry }[] = [];
  for (const edge of edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (a && b) out.push({ edge, g: edgeGeometry(a, b, edge.curve) });
  }
  return out;
}

function EdgeLinesImpl({ edges, boxes, selectedEdge, zoom }: Props) {
  const list = geometries(edges, boxes);
  const theme = useStore((s) => s.theme);
  return (
    <svg className="edge-layer" aria-hidden="true">
      {list.map(({ edge, g }) => {
        const sel = edge.id === selectedEdge;
        const size = 7 + edge.width * 2;
        const color = themed(edge.color, theme);
        return (
          <g key={edge.id}>
            {sel && <path d={g.d} style={{ stroke: 'var(--accent)' }} strokeOpacity={0.3} strokeWidth={edge.width + 8 / zoom} fill="none" strokeLinecap="round" />}
            <path
              d={g.d}
              stroke={color}
              strokeWidth={edge.width}
              strokeDasharray={edge.style === 'dashed' ? `${edge.width * 3.5} ${edge.width * 3}` : undefined}
              fill="none"
            />
            {edge.arrow !== 'none' && <polygon points={arrowHead(g.end, g.endDir, size)} fill={color} />}
            {edge.arrow === 'both' && <polygon points={arrowHead(g.start, g.startDir, size)} fill={color} />}
            {/* 클릭하기 쉽도록 넓은 투명 선 */}
            <path d={g.d} data-edge-id={edge.id} className="edge-hit" strokeWidth={Math.max(14, 14 / zoom)} />
            {sel && (
              <>
                <circle cx={g.start.x} cy={g.start.y} r={5 / zoom} className="edge-end" strokeWidth={2 / zoom} />
                <circle cx={g.end.x} cy={g.end.y} r={5 / zoom} className="edge-end" strokeWidth={2 / zoom} />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function EdgeLabelsImpl({ edges, boxes, selectedEdge }: Props) {
  const list = geometries(edges, boxes);
  const theme = useStore((s) => s.theme);
  return (
    <>
      {list
        .filter(({ edge }) => edge.label.trim() !== '')
        .map(({ edge, g }) => (
          <div
            key={edge.id}
            data-edge-id={edge.id}
            className={`edge-label${edge.id === selectedEdge ? ' selected' : ''}`}
            style={{ left: g.mid.x, top: g.mid.y, color: themed(edge.color, theme), borderColor: themed(edge.color, theme) }}
          >
            {edge.label}
          </div>
        ))}
    </>
  );
}

export const EdgeLines = memo(EdgeLinesImpl);
export const EdgeLabels = memo(EdgeLabelsImpl);
