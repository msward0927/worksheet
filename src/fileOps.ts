// 파일 열기 / 만들기 / 저장. 새 워크시트는 '내 워크시트' 모음에 바로 파일로 만들고, 바뀔 때마다 자동으로 저장한다.

import { normalizeDoc } from './boxes';
import { fileNameOf, platform } from './platform';
import { useStore } from './store';
import type { Template } from './templates';
import type { Doc } from './types';
import { fitView } from './viewport';

const AUTOSAVE_DELAY = 800;

let timer: number | undefined;
let saving: Promise<boolean> | null = null;

/** 지금 상태를 파일에 저장한다 (자동 저장과 Ctrl+S 가 함께 쓴다). 저장에 성공하면 true */
async function writeNow(): Promise<boolean> {
  const s = useStore.getState();
  if (!s.filePath) return false;
  const rev = s.rev;
  const path = s.filePath;
  s.setSaveState('saving');
  try {
    const saved = await platform.save(path, JSON.stringify(s.doc), s.doc.title || '제목 없음');
    if (!saved) {
      s.setSaveState('unsaved');
      return false;
    }
    useStore.getState().markSaved(saved, rev);
    return true;
  } catch (e) {
    useStore.getState().setSaveState('error');
    useStore.getState().showToast(`저장하지 못했어요: ${(e as Error).message}`);
    return false;
  }
}

/** 기다리는 자동 저장이 있으면 바로 저장한다 */
export async function flushSave(): Promise<boolean> {
  window.clearTimeout(timer);
  if (saving) await saving;
  const s = useStore.getState();
  if (!s.dirty) return true;
  if (!s.filePath) return false;
  saving = writeNow();
  const ok = await saving;
  saving = null;
  return ok;
}

/** 문서가 바뀌면 잠시 뒤 자동으로 저장한다. App 이 시작할 때 한 번 부른다 */
export function startAutosave() {
  return useStore.subscribe((s, prev) => {
    if (s.rev === prev.rev || !s.dirty || !s.autosave || !s.filePath) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void flushSave(), AUTOSAVE_DELAY);
  });
}

/** 다른 문서로 넘어가기 전에: 자동 저장이면 저장을 마치고, 아니면 버려도 되는지 묻는다 */
async function leaveCurrent(): Promise<boolean> {
  const s = useStore.getState();
  if (!s.dirty) return true;
  if (s.autosave && s.filePath && (await flushSave())) return true;
  return window.confirm('저장하지 않은 변경 사항이 있어요.\n저장하지 않고 계속할까요?');
}

/** Ctrl+S: 바로 저장 (모음에 없는 문서면 모음에 새로 만든다). saveAs 면 저장할 곳을 묻는다 */
export async function saveDoc(saveAs = false): Promise<boolean> {
  const s = useStore.getState();
  if (saveAs || !s.filePath) {
    try {
      const path = saveAs
        ? await platform.save(null, JSON.stringify(s.doc), s.doc.title || '제목 없음')
        : await platform.libCreate(s.doc.title || '제목 없음', JSON.stringify(s.doc));
      if (!path) return false;
      useStore.getState().markSaved(path);
      if (saveAs) useStore.getState().showToast(`저장했어요 · ${fileNameOf(path)}`);
      return true;
    } catch (e) {
      s.showToast(`저장하지 못했어요: ${(e as Error).message}`);
      return false;
    }
  }
  const ok = s.dirty ? await flushSave() : true;
  if (ok) s.showToast('저장했어요');
  return ok;
}

function show(doc: Doc, path: string | null) {
  useStore.getState().openDoc(doc, path);
  // 저장된 화면 위치가 없으면(새 파일) 박스가 보이게 맞춘다
  if (doc.view.x === 0 && doc.view.y === 0 && doc.view.zoom === 1) requestAnimationFrame(() => fitView());
}

export async function openFromDialog() {
  if (!(await leaveCurrent())) return;
  try {
    const f = await platform.openFile();
    if (f) show(normalizeDoc(JSON.parse(f.content)), f.path);
  } catch (e) {
    useStore.getState().showToast(`열지 못했어요: ${(e as Error).message}`);
  }
}

export async function openPath(path: string): Promise<boolean> {
  if (!(await leaveCurrent())) return false;
  try {
    const f = await platform.openPath(path);
    if (!f) {
      useStore.getState().showToast('파일을 찾을 수 없어요');
      return false;
    }
    show(normalizeDoc(JSON.parse(f.content)), f.path);
    return true;
  } catch (e) {
    useStore.getState().showToast(`열지 못했어요: ${(e as Error).message}`);
    return false;
  }
}

/** 끌어다 놓은 파일 등 경로 없이 받은 내용: 모음에 사본을 만들어 연다 */
export async function openContent(content: string, path: string | null) {
  if (!(await leaveCurrent())) return;
  try {
    const doc = normalizeDoc(JSON.parse(content));
    const target = path ?? (await platform.libCreate(doc.title || '가져온 워크시트', JSON.stringify(doc)));
    show(doc, target);
  } catch (e) {
    useStore.getState().showToast(`열지 못했어요: ${(e as Error).message}`);
  }
}

export async function newFromTemplate(t: Template) {
  if (!(await leaveCurrent())) return;
  const doc = t.make();
  try {
    const path = await platform.libCreate(doc.title || '제목 없음', JSON.stringify(doc));
    useStore.getState().openDoc(doc, path);
    requestAnimationFrame(() => fitView());
  } catch (e) {
    useStore.getState().showToast(`만들지 못했어요: ${(e as Error).message}`);
  }
}

/** 제목을 바꾸면 파일 이름도 함께 바꾼다 */
export async function renameDoc(title: string) {
  const s = useStore.getState();
  const name = title.trim() || '제목 없음';
  if (name !== s.doc.title) s.setTitle(name);
  if (!s.filePath) return;
  await flushSave();
  try {
    const next = await platform.libRename(useStore.getState().filePath!, name);
    if (next !== useStore.getState().filePath) useStore.setState({ filePath: next });
  } catch (e) {
    s.showToast(`이름을 바꾸지 못했어요: ${(e as Error).message}`);
  }
}

/** 현재 문서의 표시 이름: 파일이 있으면 파일 이름 */
export const docName = (filePath: string | null, title: string) => (filePath ? fileNameOf(filePath) : title || '제목 없음');
