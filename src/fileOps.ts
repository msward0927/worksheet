// 파일 열기/저장, 템플릿으로 새로 만들기

import { normalizeDoc } from './boxes';
import { fileNameOf, platform } from './platform';
import { useStore } from './store';
import type { Template } from './templates';
import { fitView } from './viewport';

function confirmDiscard(): boolean {
  if (!useStore.getState().dirty) return true;
  return window.confirm('저장하지 않은 변경 사항이 있어요.\n저장하지 않고 계속할까요?');
}

/** 저장에 성공하면 true */
export async function saveDoc(saveAs = false): Promise<boolean> {
  const { doc, filePath, markSaved, showToast } = useStore.getState();
  try {
    const path = await platform.save(saveAs ? null : filePath, JSON.stringify(doc), doc.title || '제목 없음');
    if (!path) return false;
    markSaved(path);
    showToast(`저장했어요 · ${fileNameOf(path)}`);
    return true;
  } catch (e) {
    showToast(`저장하지 못했어요: ${(e as Error).message}`);
    return false;
  }
}

function load(content: string, path: string | null) {
  const doc = normalizeDoc(JSON.parse(content));
  useStore.getState().openDoc(doc, path);
  // 저장된 화면 위치가 없으면(새 파일) 박스가 보이게 맞춘다
  if (doc.view.x === 0 && doc.view.y === 0 && doc.view.zoom === 1) requestAnimationFrame(() => fitView());
}

export async function openFromDialog() {
  if (!confirmDiscard()) return;
  try {
    const f = await platform.openFile();
    if (f) load(f.content, f.path);
  } catch (e) {
    useStore.getState().showToast(`열지 못했어요: ${(e as Error).message}`);
  }
}

export async function openPath(path: string): Promise<boolean> {
  if (!confirmDiscard()) return false;
  try {
    const f = await platform.openPath(path);
    if (!f) {
      useStore.getState().showToast('파일을 찾을 수 없어요');
      return false;
    }
    load(f.content, f.path);
    return true;
  } catch (e) {
    useStore.getState().showToast(`열지 못했어요: ${(e as Error).message}`);
    return false;
  }
}

export function openContent(content: string, path: string | null) {
  try {
    load(content, path);
  } catch (e) {
    useStore.getState().showToast(`열지 못했어요: ${(e as Error).message}`);
  }
}

export function newFromTemplate(t: Template) {
  if (!confirmDiscard()) return;
  const doc = t.make();
  useStore.getState().openDoc(doc, null);
  requestAnimationFrame(() => fitView());
}

