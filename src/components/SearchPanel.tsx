// 찾기 · 목차 (Ctrl+F): 글자로 박스를 찾아 그 자리로 간다. 아무것도 안 쓰면 워크박스와 큰 제목으로 목차를 보여 준다

import { useEffect, useMemo, useRef, useState } from 'react';
import { KIND_LABEL } from '../boxes';
import { useStore } from '../store';
import type { Box } from '../types';
import { focusBox } from '../viewport';
import { Icon } from './icons';

/** 박스에서 찾을 수 있는 글: 내용, 이름, 체크 항목, 수식 */
function textOf(b: Box): string {
  return [b.name, b.text, b.formula, ...b.items.map((i) => i.text)].filter(Boolean).join('\n');
}

function titleOf(b: Box): string {
  const first = (b.text || b.items.find((i) => i.text)?.text || '').split('\n').find((l) => l.trim());
  return b.name || first?.trim() || KIND_LABEL[b.kind];
}

const byPosition = (a: Box, b: Box) => a.y - b.y || a.x - b.x;

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function SearchPanel() {
  const boxes = useStore((s) => s.doc.boxes);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const query = q.trim();
  const results = useMemo(() => {
    if (query) {
      const lq = query.toLowerCase();
      return boxes
        .filter((b) => textOf(b).toLowerCase().includes(lq))
        .sort(byPosition)
        .map((b) => {
          // 찾은 글자가 들어 있는 줄을 보여 준다
          const line = textOf(b).split('\n').find((l) => l.toLowerCase().includes(lq)) ?? '';
          return { box: b, title: line.trim() || titleOf(b), sub: KIND_LABEL[b.kind], depth: 0 };
        });
    }
    // 목차: 안에 박스가 든 워크박스와 큰 글씨(제목)를 위치 순서대로
    const parents = new Set(boxes.map((b) => b.parentId).filter(Boolean));
    const byId = new Map(boxes.map((b) => [b.id, b]));
    const depthOf = (b: Box) => {
      let d = 0;
      for (let p = b.parentId; p; p = byId.get(p)?.parentId ?? null) d++;
      return d;
    };
    return boxes
      .filter((b) => (b.kind === 'shape' && parents.has(b.id)) || ((b.kind === 'text' || b.kind === 'shape') && b.text.trim() && b.fontSize >= 22))
      .filter((b) => depthOf(b) <= 2)
      .sort(byPosition)
      .map((b) => {
        const n = boxes.filter((c) => c.parentId === b.id).length;
        return { box: b, title: titleOf(b), sub: n ? `안에 ${n}개` : '제목', depth: depthOf(b) };
      });
  }, [boxes, query]);

  useEffect(() => setCursor(0), [query]);

  const go = (i: number) => {
    const r = results[i];
    if (!r) return;
    setCursor(i);
    useStore.getState().select([r.box.id]);
    focusBox(r.box.id);
  };

  return (
    <aside className="search-panel" aria-label="찾기">
      <div className="search-head">
        <Icon.search />
        <input
          ref={inputRef}
          value={q}
          placeholder="박스 안의 글 찾기"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const n = results.length;
              if (!n) return;
              // 지금 고른 결과로 가고, 다음 Enter 는 그다음(Shift 면 이전) 결과로
              const i = cursor % n;
              go(i);
              setCursor((i + (e.shiftKey ? -1 : 1) + n) % n);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(results.length - 1, c + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === 'Escape') {
              useStore.getState().setSearchOpen(false);
            }
          }}
        />
        <button className="icon-btn" onClick={() => useStore.getState().setSearchOpen(false)} aria-label="찾기 닫기">
          <Icon.close />
        </button>
      </div>
      <div className="search-meta">{query ? `찾은 박스 ${results.length}개 · Enter 로 차례로 이동` : '목차'}</div>
      <div className="search-results">
        {results.length === 0 ? (
          <div className="sr-empty">
            {query ? '찾는 글이 들어 있는 박스가 없어요.' : '안에 박스를 담은 워크박스나 큰 글씨(22px 이상) 제목이 목차로 보여요.'}
          </div>
        ) : (
          results.map((r, i) => (
            <button key={r.box.id} className={`sr-item depth-${Math.min(r.depth, 2)}${i === cursor ? ' on' : ''}`} onClick={() => go(i)}>
              <span className="sr-title">
                <Highlight text={r.title} q={query} />
              </span>
              <span className="sr-sub">{r.sub}</span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
