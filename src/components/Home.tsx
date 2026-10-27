// 시작 화면: '내 워크시트' 모음. 만든 워크시트가 미리보기 그림과 함께 최근 순서로 모이고, 템플릿으로 새로 만든다.

import { useEffect, useMemo, useState } from 'react';
import { flushSave, newFromTemplate, openFromDialog, openPath } from '../fileOps';
import { isDesktop, platform, previewOf, type LibraryItem, type PreviewBox } from '../platform';
import { useStore } from '../store';
import { TEMPLATES, type Template } from '../templates';
import { themed, type Theme } from '../theme';
import { Icon } from './icons';
import { Logo, Menu, SettingsButton, ThemeButton } from './TopBar';

/** 박스 배치를 줄여 그린 미리보기 */
function Thumbnail({ boxes, theme }: { boxes: PreviewBox[]; theme: Theme }) {
  const shown = boxes.filter((b) => [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0);
  if (shown.length === 0) {
    return (
      <div className="thumb">
        <div className="thumb-empty">
          <Icon.plus />
        </div>
      </div>
    );
  }
  const x0 = Math.min(...shown.map((b) => b.x));
  const y0 = Math.min(...shown.map((b) => b.y));
  const x1 = Math.max(...shown.map((b) => b.x + b.w));
  const y1 = Math.max(...shown.map((b) => b.y + b.h));
  const pad = Math.max(x1 - x0, y1 - y0) * 0.06 + 12;
  const vb = `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`;
  // 미리보기에서도 선이 너무 가늘어지지 않게 크기에 맞춰 굵기를 정한다
  const sw = Math.max(1.2, (x1 - x0 + pad * 2) / 220);
  const fillOf = (b: PreviewBox) => {
    if (b.fill && b.fill !== 'transparent' && b.fill !== 'undefined') return themed(b.fill, theme);
    if (b.kind === 'image') return theme === 'dark' ? '#3a3f46' : '#e9e6df';
    return 'none';
  };
  const strokeOf = (b: PreviewBox) => (b.stroke && b.stroke !== 'none' && b.stroke !== 'undefined' ? themed(b.stroke, theme) : 'none');
  const lineColor = theme === 'dark' ? '#5a616b' : '#cfcabf';
  return (
    <div className="thumb">
      <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" aria-hidden="true">
        {shown.map((b, i) => {
          const common = { fill: fillOf(b), stroke: strokeOf(b), strokeWidth: sw };
          const r = Math.min(b.w, b.h);
          return (
            <g key={i}>
              {b.shape === 'ellipse' ? (
                <ellipse cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} {...common} />
              ) : b.shape === 'diamond' ? (
                <polygon points={`${b.x + b.w / 2},${b.y} ${b.x + b.w},${b.y + b.h / 2} ${b.x + b.w / 2},${b.y + b.h} ${b.x},${b.y + b.h / 2}`} {...common} />
              ) : (
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={b.shape === 'rect' ? r * 0.04 : r * 0.12} {...common} />
              )}
              {b.text && b.w > 30 && b.h > 14 && (
                <rect x={b.x + b.w * 0.14} y={b.y + Math.min(b.h / 2, 22) - sw * 1.6} width={b.w * 0.5} height={sw * 3.2} rx={sw * 1.6} fill={lineColor} />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ago(ms: number): string {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return '방금 전';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  const d = new Date(ms);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

// 템플릿 미리보기는 한 번만 만든다
const tplPreview = new Map<string, PreviewBox[]>();
function templateBoxes(t: Template) {
  let v = tplPreview.get(t.id);
  if (!v) {
    v = previewOf(JSON.stringify(t.make()))?.boxes ?? [];
    tplPreview.set(t.id, v);
  }
  return v;
}

function SheetCard({ item, theme, onChanged }: { item: LibraryItem; theme: Theme; onChanged: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const toast = useStore.getState().showToast;

  const commitRename = async () => {
    setRenaming(false);
    const name = draft.trim();
    if (!name || name === item.name) return setDraft(item.name);
    try {
      await platform.libRename(item.path, name);
      onChanged();
    } catch (e) {
      toast(`이름을 바꾸지 못했어요: ${(e as Error).message}`);
    }
  };

  const count = item.preview?.count ?? 0;
  return (
    <div className="lib-card">
      <button className="lib-open" onClick={() => void openPath(item.path).then((ok) => !ok && onChanged())} disabled={renaming} aria-label={`${item.name} 열기`}>
        <Thumbnail boxes={item.preview?.boxes ?? []} theme={theme} />
        <span className="lib-meta">
          {renaming ? (
            <input
              className="lib-rename"
              value={draft}
              autoFocus
              onFocus={(e) => e.target.select()}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  setDraft(item.name);
                  setRenaming(false);
                }
              }}
            />
          ) : (
            <span className="lib-name" title={item.path}>
              {item.name}
              {item.external && <span className="lib-tag">다른 폴더</span>}
            </span>
          )}
          <span className="lib-sub">
            {ago(item.mtime)} · 박스 {count}개
          </span>
        </span>
      </button>
      <div className="lib-more">
        <Menu
          label={`${item.name} 메뉴`}
          align="right"
          trigger={<Icon.more />}
          items={[
            { label: '열기', run: () => void openPath(item.path) },
            {
              label: '이름 바꾸기',
              run: () => {
                setDraft(item.name);
                setRenaming(true);
              },
            },
            {
              label: '사본 만들기',
              run: async () => {
                await platform.libDuplicate(item.path);
                onChanged();
              },
            },
            ...(isDesktop ? [{ label: '폴더에서 보기', run: () => void platform.libReveal(item.path) }] : []),
            item.external
              ? {
                  divider: true,
                  label: '목록에서 빼기',
                  run: async () => {
                    await platform.removeRecent(item.path);
                    onChanged();
                  },
                }
              : {
                  divider: true,
                  danger: true,
                  label: isDesktop ? '휴지통으로' : '삭제',
                  run: async () => {
                    if (!window.confirm(`'${item.name}' 을(를) ${isDesktop ? '휴지통으로 옮길까요' : '삭제할까요'}?`)) return;
                    const ok = await platform.libTrash(item.path);
                    if (!ok) toast('지우지 못했어요');
                    else {
                      const s = useStore.getState();
                      // 열려 있던 문서를 지웠으면 더는 그 파일에 저장하지 않는다
                      if (s.filePath === item.path) useStore.setState({ filePath: null, dirty: false, doc: { ...s.doc, boxes: [], edges: [] } });
                      toast(isDesktop ? '휴지통으로 옮겼어요' : '삭제했어요');
                    }
                    onChanged();
                  },
                },
          ]}
        />
      </div>
    </div>
  );
}

export function Home() {
  const theme = useStore((s) => s.theme);
  const filePath = useStore((s) => s.filePath);
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [q, setQ] = useState('');

  const refresh = () => {
    platform
      .libList()
      .then(setItems)
      .catch(() => setItems([]));
  };

  useEffect(() => {
    // 편집하던 문서를 먼저 저장해야 미리보기에 바로 반영된다
    void flushSave().finally(refresh);
  }, []);

  const shown = useMemo(() => {
    const lq = q.trim().toLowerCase();
    return (items ?? []).filter((i) => !lq || i.name.toLowerCase().includes(lq) || i.preview?.title.toLowerCase().includes(lq));
  }, [items, q]);
  const current = filePath ? items?.find((i) => i.path === filePath) : undefined;

  return (
    <div className="home">
      <header className="home-top">
        <span className="brand static">
          <Logo />
          <span className="brand-name">워크시트</span>
        </span>
        <div className="spacer" />
        <label className="home-search">
          <Icon.search />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="워크시트 찾기" aria-label="워크시트 찾기" />
        </label>
        <div className="spacer" />
        <button className="btn ghost" onClick={() => void openFromDialog()}>
          <Icon.folder /> 다른 파일 열기
        </button>
        {isDesktop && (
          <button className="icon-btn" onClick={() => void platform.libReveal(null)} aria-label="모음 폴더 열기" data-tip="모음 폴더 열기">
            <Icon.layout />
          </button>
        )}
        <ThemeButton />
        <SettingsButton />
      </header>

      <div className="home-inner">
        <section>
          <div className="home-section-title">
            <h2>새로 만들기</h2>
          </div>
          <div className="tpl-row">
            {TEMPLATES.map((t) => (
              <button key={t.id} className="tpl-card" onClick={() => void newFromTemplate(t)}>
                <Thumbnail boxes={templateBoxes(t)} theme={theme} />
                <span className="tpl-title">{t.title}</span>
                <span className="tpl-desc">{t.desc}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="home-section-title">
            <h2>내 워크시트{items && items.length > 0 ? ` · ${items.length}` : ''}</h2>
            {current && (
              <button className="btn" onClick={() => useStore.setState({ screen: 'editor' })}>
                ← {current.name} 이어서 하기
              </button>
            )}
          </div>
          {items === null ? null : items.length === 0 ? (
            <div className="lib-empty">
              아직 워크시트가 없어요.
              <br />
              위에서 템플릿을 고르면 바로 만들어지고, 고칠 때마다 자동으로 저장돼요.
            </div>
          ) : shown.length === 0 ? (
            <div className="lib-empty">'{q}' 와(과) 맞는 워크시트가 없어요.</div>
          ) : (
            <div className="lib-grid">
              {shown.map((it) => (
                <SheetCard key={it.path} item={it} theme={theme} onChanged={refresh} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
