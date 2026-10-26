// 시작 화면: 템플릿으로 새로 만들기, 최근 파일 열기

import { useEffect, useState } from 'react';
import { newFromTemplate, openFromDialog, openPath } from '../fileOps';
import { fileNameOf, isDesktop, platform } from '../platform';
import { useStore } from '../store';
import { TEMPLATES } from '../templates';
import { Icon } from './icons';

function Thumb({ id }: { id: string }) {
  // 템플릿 모양을 흉내 낸 작은 미리보기
  const b = (l: number, t: number, w: number, h: number, extra = '') => (
    <span className={`thumb-box ${extra}`} style={{ left: l, top: t, width: w, height: h }} />
  );
  switch (id) {
    case 'blank':
      return (
        <div className="thumb dots blank">
          <Icon.plus />
        </div>
      );
    case 'budget':
      return (
        <div className="thumb dots">
          {b(16, 16, 50, 20, 'num')}
          {b(16, 44, 50, 20, 'num')}
          {b(16, 72, 50, 20, 'num')}
          {b(96, 40, 62, 30, 'fx')}
        </div>
      );
    case 'story':
      return (
        <div className="thumb dots">
          {b(18, 14, 30, 30, 'round')}
          {b(70, 14, 30, 30, 'round')}
          {b(122, 14, 30, 30, 'round')}
          {b(14, 64, 42, 28)}
          {b(66, 64, 42, 28)}
          {b(118, 64, 42, 28)}
        </div>
      );
    case 'planner':
      return (
        <div className="thumb dots">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => b(14 + (i % 4) * 38, 14 + Math.floor(i / 4) * 40, 32, 34))}
          {b(128, 54, 32, 34, 'sticky')}
        </div>
      );
    default:
      return (
        <div className="thumb dots">
          {b(66, 42, 48, 30, 'sel')}
          {b(14, 14, 36, 22)}
          {b(130, 14, 36, 22)}
          {b(14, 82, 36, 22)}
          {b(130, 82, 36, 22)}
        </div>
      );
  }
}

export function Home() {
  const [recent, setRecent] = useState<string[]>([]);
  const hasDoc = useStore((s) => s.doc.boxes.length > 0 || s.filePath !== null || s.dirty);
  const docTitle = useStore((s) => (s.filePath ? fileNameOf(s.filePath) : s.doc.title));

  useEffect(() => {
    platform.recent().then(setRecent).catch(() => setRecent([]));
  }, []);

  return (
    <div className="home">
      <div className="home-inner">
        <header className="home-head">
          <div>
            <h1>무엇을 정리해 볼까요?</h1>
            <p className="muted">빈 캔버스에서 시작하거나, 용도에 맞는 템플릿을 고르세요.</p>
          </div>
          <div className="row">
            {hasDoc && (
              <button className="btn" onClick={() => useStore.setState({ screen: 'editor' })}>
                ← {docTitle || '현재 문서'}로 돌아가기
              </button>
            )}
            <button className="btn primary" onClick={() => void openFromDialog()}>
              <Icon.folder /> 파일 열기
            </button>
          </div>
        </header>

        <section>
          <h2>새로 만들기</h2>
          <div className="template-grid">
            {TEMPLATES.map((t) => (
              <button key={t.id} className="template" onClick={() => newFromTemplate(t)}>
                <Thumb id={t.id} />
                <span className="template-title">{t.title}</span>
                <span className="template-desc">{t.desc}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>최근 워크시트</h2>
          {recent.length === 0 ? (
            <p className="muted small">
              {isDesktop ? '아직 저장하거나 연 파일이 없어요.' : '브라우저에서는 최근 파일 목록을 쓸 수 없어요.'}
            </p>
          ) : (
            <div className="recent-list">
              {recent.map((p) => (
                <div key={p} className="recent-row">
                  <button
                    className="recent-open"
                    onClick={async () => {
                      const ok = await openPath(p);
                      if (!ok) {
                        await platform.removeRecent(p);
                        setRecent(await platform.recent());
                      }
                    }}
                  >
                    <span className="recent-name">{fileNameOf(p)}</span>
                    <span className="recent-path muted">{p}</span>
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="목록에서 지우기"
                    title="목록에서 지우기"
                    onClick={async () => {
                      await platform.removeRecent(p);
                      setRecent(await platform.recent());
                    }}
                  >
                    <Icon.close />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
