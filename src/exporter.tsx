// PNG / PDF 내보내기. 박스들을 화면 밖 '무대'에 실제 크기(100%)로 다시 그린 뒤,
// PNG 는 SVG(foreignObject) 그림으로 바꿔 캔버스에 찍고, PDF 는 인쇄용 CSS 로 무대만 보이게 해서 한 장으로 찍는다.

import { Fragment } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { BoxView } from './components/BoxView';
import { EdgeLabels, EdgeLines } from './components/EdgeLayer';
import { docName } from './fileOps';
import { evaluateAll } from './formula';
import { boundsOf } from './geometry';
import { platform } from './platform';
import { useStore } from './store';
import { edgeLayer, withDescendants } from './tree';
import type { Box, Edge } from './types';

export type ExportFormat = 'png' | 'pdf';

const PAD = 48;
/** PNG 는 선명하게 2배로 찍되, 너무 크면 줄인다 */
const PNG_SCALE = 2;
const MAX_SIDE = 16000;
const MAX_AREA = 120_000_000;
/** PDF 한 장의 가장 긴 변 (px, 약 2.5m). 이보다 크면 줄여서 찍는다 */
const MAX_PDF_SIDE = 9000;

const NO_EDGES: Edge[] = [];

function Scene({ boxes, edges, ox, oy }: { boxes: Box[]; edges: Edge[]; ox: number; oy: number }) {
  const results = evaluateAll(boxes);
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const groups = new Map<string | null, Edge[]>();
  for (const e of edges) {
    const key = edgeLayer(byId, e.from, e.to);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return (
    <div className="world" style={{ transform: `translate(${ox}px, ${oy}px)` }}>
      <EdgeLines edges={groups.get(null) ?? NO_EDGES} boxes={boxes} selectedEdge={null} zoom={1} />
      {boxes.map((b) => (
        <Fragment key={b.id}>
          <BoxView box={b} selected={false} single={false} editing={false} flash={false} result={results.get(b.id)} zoom={1} showDots={false} dropTarget={false} />
          {groups.has(b.id) && <EdgeLines edges={groups.get(b.id)!} boxes={boxes} selectedEdge={null} zoom={1} />}
        </Fragment>
      ))}
      <EdgeLabels edges={edges} boxes={boxes} selectedEdge={null} zoom={1} />
    </div>
  );
}

/** 내보낼 박스와 연결선: 고른 박스만이면 그 안의 박스까지, 연결선은 양 끝이 모두 들어간 것만 */
function pick(onlySelection: boolean) {
  const { doc, selected } = useStore.getState();
  if (!onlySelection || selected.length === 0) return { boxes: doc.boxes, edges: doc.edges };
  const ids = withDescendants(doc.boxes, selected);
  return {
    boxes: doc.boxes.filter((b) => ids.has(b.id)),
    edges: doc.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
  };
}

interface Stage {
  el: HTMLDivElement;
  width: number;
  height: number;
  dispose(): void;
}

async function buildStage(boxes: Box[], edges: Edge[]): Promise<Stage | null> {
  const b = boundsOf(boxes);
  if (!b) return null;
  const width = Math.ceil(b.w + PAD * 2);
  const height = Math.ceil(b.h + PAD * 2);
  const el = document.createElement('div');
  el.className = 'export-stage';
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  // 점 모눈도 화면과 같은 자리에 오게 맞춘다
  el.style.backgroundPosition = `${PAD - b.x}px ${PAD - b.y}px`;
  document.body.appendChild(el);
  const root = createRoot(el);
  flushSync(() => root.render(<Scene boxes={boxes} edges={edges} ox={PAD - b.x} oy={PAD - b.y} />));
  // 그림과 글꼴이 모두 그려질 때까지 기다린다
  await Promise.all(
    Array.from(el.querySelectorAll('img')).map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))),
  );
  await document.fonts.ready;
  return {
    el,
    width,
    height,
    dispose() {
      root.unmount();
      el.remove();
    },
  };
}

// ---------- PNG ----------

let fontCss: Promise<string> | null = null;

/** 문서의 CSS 전체. 글꼴 파일은 그림 안에서 불러올 수 없어서 data URL 로 바꿔 넣는다 */
function collectCss(): Promise<string> {
  fontCss ??= (async () => {
    const parts: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        let text = rule.cssText;
        if (rule instanceof CSSFontFaceRule) {
          const urls = [...text.matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1]);
          for (const u of urls) {
            if (u.startsWith('data:')) continue;
            try {
              const res = await fetch(new URL(u, sheet.href ?? location.href));
              const blob = await res.blob();
              const data = await new Promise<string>((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(String(r.result));
                r.onerror = () => reject(r.error);
                r.readAsDataURL(blob);
              });
              text = text.split(u).join(data);
            } catch {
              // 글꼴을 못 읽으면 기본 글꼴로 그린다
            }
          }
        }
        parts.push(text);
      }
    }
    return parts.join('\n');
  })();
  return fontCss;
}

async function stageToPng(stage: Stage): Promise<Uint8Array> {
  const css = await collectCss();
  const theme = document.documentElement.dataset.theme ?? 'light';
  // 무대는 화면 밖(left 가 아주 왼쪽)에 있으니, 그림 안에서는 제자리에 오게 한 복사본을 쓴다
  const copy = stage.el.cloneNode(true) as HTMLDivElement;
  copy.style.position = 'relative';
  copy.style.left = '0';
  const html = new XMLSerializer().serializeToString(copy);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${stage.width}" height="${stage.height}" data-theme="${theme}">` +
    `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${html}</foreignObject></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const scale = Math.min(PNG_SCALE, MAX_SIDE / Math.max(stage.width, stage.height), Math.sqrt(MAX_AREA / (stage.width * stage.height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(stage.width * scale));
  canvas.height = Math.max(1, Math.round(stage.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('그림을 그릴 수 없어요');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('그림이 너무 커요');
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------- PDF ----------

async function stageToPdf(stage: Stage, name: string): Promise<string | null> {
  const fit = Math.min(1, MAX_PDF_SIDE / Math.max(stage.width, stage.height));
  const width = Math.ceil(stage.width * fit);
  const height = Math.ceil(stage.height * fit);
  const page = document.createElement('style');
  page.textContent = `@page { size: ${width}px ${height}px; margin: 0; }`;
  document.head.appendChild(page);
  stage.el.style.zoom = String(fit);
  document.documentElement.classList.add('printing');
  try {
    return await platform.exportPdf(name, { width, height });
  } finally {
    document.documentElement.classList.remove('printing');
    page.remove();
  }
}

let busy = false;

export async function exportDoc(format: ExportFormat, onlySelection: boolean) {
  const s = useStore.getState();
  if (busy) return;
  const { boxes, edges } = pick(onlySelection);
  if (boxes.length === 0) {
    s.showToast('내보낼 박스가 없어요');
    return;
  }
  busy = true;
  // 편집 중인 글이 있으면 먼저 끝낸다
  if (s.editingId) s.setEditing(null);
  const name = docName(s.filePath, s.doc.title) + (onlySelection ? ' (일부)' : '');
  let stage: Stage | null = null;
  try {
    stage = await buildStage(boxes, edges);
    if (!stage) return;
    let saved: string | null;
    if (format === 'png') saved = await platform.exportPng(name, await stageToPng(stage));
    else saved = await stageToPdf(stage, name);
    if (saved) useStore.getState().showToast(`내보냈어요 · ${saved.split(/[\\/]/).pop()}`);
  } catch (e) {
    useStore.getState().showToast(`내보내지 못했어요: ${(e as Error).message}`);
  } finally {
    stage?.dispose();
    busy = false;
  }
}
