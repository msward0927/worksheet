// 설정 창: 왼쪽 목록에서 항목을 고르면 오른쪽에 그 항목만 보인다

import { useEffect, useRef, useState } from 'react';
import { version } from '../../package.json';
import { isDesktop, platform } from '../platform';
import { useStore, type SettingsTab } from '../store';
import type { Theme } from '../theme';
import { Icon } from './icons';
import { TOOLS } from './Toolbar';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'display', label: '화면' },
  { id: 'canvas', label: '캔버스' },
  { id: 'mouse', label: '마우스 조작' },
  { id: 'keys', label: '단축키' },
  { id: 'formula', label: '계산 (수식)' },
  { id: 'about', label: '정보' },
];

export function SettingsDialog() {
  const tab = useStore((s) => s.settingsTab);
  const close = useStore((s) => s.closeSettings);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1} ref={dialogRef}>
        <header className="settings-head">
          <h2 id="settings-title">설정</h2>
          <button className="icon-btn" onClick={close} aria-label="설정 닫기" title="닫기 (Esc)">
            <Icon.close />
          </button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav" aria-label="설정 항목">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={t.id === tab ? 'on' : ''}
                aria-current={t.id === tab ? 'page' : undefined}
                onClick={() => useStore.getState().openSettings(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {tab === 'display' && <DisplayTab />}
            {tab === 'canvas' && <CanvasTab />}
            {tab === 'mouse' && <MouseTab />}
            {tab === 'keys' && <KeysTab />}
            {tab === 'formula' && <FormulaTab />}
            {tab === 'about' && <AboutTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({ value, label, desc }: { value: Theme; label: string; desc: string }) {
  const theme = useStore((s) => s.theme);
  const on = theme === value;
  return (
    <button className={`theme-card${on ? ' on' : ''}`} onClick={() => useStore.getState().setTheme(value)} aria-pressed={on}>
      <span className={`theme-preview preview-${value}`} aria-hidden="true">
        <span className="pv-bar" />
        <span className="pv-box pv-a" />
        <span className="pv-box pv-b" />
        <span className="pv-line" />
      </span>
      <span className="theme-label">
        {on && <Icon.check />} {label}
      </span>
      <span className="muted small">{desc}</span>
    </button>
  );
}

function DisplayTab() {
  return (
    <>
      <h3>테마</h3>
      <div className="theme-cards">
        <ThemeCard value="light" label="밝은 테마" desc="종이색 바탕 + 파란 강조" />
        <ThemeCard value="dark" label="어두운 테마" desc="어두운 회색 바탕 + 옅은 하늘색 강조" />
      </div>
      <p className="muted small">
        위쪽 막대의 해/달 버튼으로도 바로 바꿀 수 있어요. 박스 색은 화면에서만 테마에 맞춰 바뀌고, 파일에 저장된 색은 그대로예요.
      </p>
    </>
  );
}

function CanvasTab() {
  const snapOn = useStore((s) => s.snap);
  return (
    <>
      <h3>점에 맞추기</h3>
      <label className="setting-row">
        <span>
          <b>항상 점에 맞추기</b>
          <span className="muted small">박스를 옮기거나 만들거나 크기를 바꿀 때 늘 점에 맞춥니다.</span>
        </span>
        <input type="checkbox" checked={snapOn} onChange={(e) => useStore.getState().setSnap(e.target.checked)} />
      </label>
      <ul className="help">
        <li>
          꺼져 있어도 <kbd>Shift</kbd> 를 누르고 있으면 점에 맞춰져요.
        </li>
        <li>옮길 때는 끄는 박스의 왼쪽 위 꼭짓점을, 만들 때는 네 꼭짓점을 모두 점에 맞춰요.</li>
        <li>점은 종이에 인쇄된 것처럼 24px 간격으로 고정이에요. 확대하면 점과 간격이 함께 커지고, 축소하면 함께 작아져요.</li>
        <li>아주 많이 축소해서 점이 빽빽해지면 점을 흐리게 보여 줘요.</li>
      </ul>
    </>
  );
}

function Rows({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <table className="key-table">
      <tbody>
        {rows.map(([a, b], i) => (
          <tr key={i}>
            <th scope="row">{a}</th>
            <td>{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const K = ({ children }: { children: string }) => (
  <>
    {children.split(/\+(?=.)/).map((k, i) => (
      <span key={i}>
        {i > 0 && '+'}
        <kbd>{k}</kbd>
      </span>
    ))}
  </>
);

function MouseTab() {
  return (
    <>
      <h3>화면</h3>
      <Rows
        rows={[
          ['휠', '확대 / 축소 (5% ~ 800%, 끝에 가까울수록 천천히)'],
          [<K key="k">Space</K>, '누른 채 끌어서 화면 이동'],
          ['휠 버튼 끌기', '화면 이동'],
        ]}
      />
      <h3>선택</h3>
      <Rows
        rows={[
          ['클릭', '박스나 연결선 선택'],
          ['빈 곳 끌기', '영역 안의 박스 여러 개 선택'],
          [<K key="k">Ctrl</K>, '누르고 클릭하면 하나씩 선택 추가 / 빼기'],
          ['빈 곳 클릭', '선택 해제'],
        ]}
      />
      <h3>박스</h3>
      <Rows
        rows={[
          ['끌기', '옮기기 (선택한 박스 모두 함께)'],
          [<K key="k">Shift</K>, '누르고 끌면 왼쪽 위 꼭짓점을 점에 맞춰 옮기기'],
          [<K key="k">Alt</K>, '누르고 끌면 복사'],
          ['모서리 손잡이', '크기 조절 (Shift: 점에 맞춤, Alt: 비율 유지)'],
          ['오른쪽 파란 점', '다른 박스로 끌어서 연결선 만들기'],
          ['더블클릭', '내용 편집 · 빈 곳이면 새 글상자'],
        ]}
      />
      <h3>만들기</h3>
      <Rows
        rows={[
          ['도구 고르고 클릭', '기본 크기로 만들기'],
          ['도구 고르고 끌기', '원하는 크기로 만들기'],
          [<K key="k">Shift</K>, '누르고 만들면 네 꼭짓점을 점에 맞춤'],
          ['파일 끌어다 놓기', '이미지 박스 만들기 · .wsht 파일 열기'],
        ]}
      />
    </>
  );
}

function KeysTab() {
  return (
    <>
      <h3>도구</h3>
      <Rows rows={TOOLS.map((t) => [<kbd key={t.tool}>{t.key}</kbd>, t.label] as [React.ReactNode, React.ReactNode])} />
      <h3>편집</h3>
      <Rows
        rows={[
          [<K key="1">Ctrl+Z</K>, '실행 취소'],
          [<K key="2">Ctrl+Y</K>, '다시 실행 (Ctrl+Shift+Z 도 가능)'],
          [<K key="3">Ctrl+C</K>, '복사'],
          [<K key="4">Ctrl+X</K>, '잘라내기'],
          [<K key="5">Ctrl+V</K>, '붙여넣기 (이미지, 글도 가능)'],
          [<K key="6">Ctrl+D</K>, '복제'],
          [<K key="7">Ctrl+A</K>, '모두 선택'],
          [<K key="8">Delete</K>, '삭제'],
          [<K key="9">Enter</K>, '선택한 박스 편집'],
          [<K key="10">Esc</K>, '편집 끝내기 · 도구 해제 · 선택 해제'],
          ['방향키', '1px 옮기기 (Shift: 점 한 칸)'],
        ]}
      />
      <h3>파일 · 보기</h3>
      <Rows
        rows={[
          [<K key="1">Ctrl+N</K>, '새 워크시트'],
          [<K key="2">Ctrl+O</K>, '열기'],
          [<K key="3">Ctrl+S</K>, '저장'],
          [<K key="4">Ctrl+Shift+S</K>, '다른 이름으로 저장'],
          [<K key="5">Ctrl+,</K>, '설정'],
          [<K key="6">Ctrl+0</K>, '100% 로 보기'],
          [<K key="7">Ctrl+1</K>, '화면에 맞추기'],
          [<K key="8">Ctrl++</K>, '확대'],
          [<K key="9">Ctrl+-</K>, '축소'],
        ]}
      />
    </>
  );
}

function FormulaTab() {
  return (
    <>
      <h3>기본</h3>
      <p className="small">
        숫자 박스에 <b>이름</b>(예: <span className="mono">식비</span>)을 붙이고, 수식 박스에 이름으로 계산식을 쓰면 값이 바뀔 때마다 자동으로 다시 계산돼요.
      </p>
      <Rows
        rows={[
          [<span key="1" className="mono">= 식비 + 교통비 * 2</span>, '사칙연산 + - * / 와 괄호 (× ÷ 도 가능)'],
          [<span key="2" className="mono">= 수입합계 - 지출합계</span>, '다른 수식 박스의 결과도 부를 수 있어요'],
          [<span key="3" className="mono">= [11월 식비] / 4</span>, '띄어쓰기가 있는 이름은 대괄호로'],
          [<span key="4" className="mono">= 월요일.완료</span>, '체크 박스의 완료 개수 (.전체 / .남음 도 가능)'],
        ]}
      />
      <h3>함수</h3>
      <Rows
        rows={[
          [<span key="1" className="mono">SUM(a, b, …)</span>, '합계'],
          [<span key="2" className="mono">AVG(a, b, …)</span>, '평균'],
          [<span key="3" className="mono">MIN / MAX</span>, '가장 작은 값 / 큰 값'],
          [<span key="4" className="mono">ROUND(값, 자릿수)</span>, '반올림. 자릿수를 빼면 정수로'],
          [<span key="5" className="mono">ABS(값)</span>, '절댓값'],
        ]}
      />
      <h3>주의</h3>
      <ul className="help">
        <li>숫자 안에 천 단위 쉼표(1,000)는 쓰지 않아요. 쉼표는 함수 값 구분에 써요.</li>
        <li>없는 이름, 같은 이름이 두 개, 서로를 부르는 순환 참조, 0으로 나누기는 박스에 오류로 보여요.</li>
        <li>박스를 복사하면 이름 뒤에 숫자가 붙어서 겹치지 않게 돼요.</li>
      </ul>
    </>
  );
}

function AboutTab() {
  const [dir, setDir] = useState<string | null>(null);
  useEffect(() => {
    platform.dataDir().then(setDir).catch(() => setDir(null));
  }, []);
  return (
    <>
      <h3>Worksheet</h3>
      <Rows
        rows={[
          ['버전', version],
          ['파일 형식', '.wsht (이미지를 포함한 JSON)'],
          ['설정 저장 위치', dir ?? (isDesktop ? '…' : '브라우저 저장소')],
        ]}
      />
      <p className="muted small">포터블 버전은 설정과 최근 파일 목록을 실행 파일 옆 WorksheetData 폴더에 저장해요.</p>
    </>
  );
}
