// 밝은 / 어두운 테마. 문서에는 밝은 테마 기준 색이 저장되고, 어두운 테마에서는 화면에 그릴 때만 바꿔 그린다.

export type Theme = 'light' | 'dark';

const DARK: Record<string, string> = {
  // 채우기
  '#ffffff': '#2e3238',
  '#fff4c7': '#4a4430',
  '#e3ecff': '#2c3d52',
  '#ddf3e6': '#2c443a',
  '#fce5d6': '#4a3a30',
  '#ece4fa': '#3d3550',
  '#f3f1ec': '#353a41',
  '#fbfaf7': '#2a2e33',
  // 테두리
  '#d6d1c6': '#4a5059',
  '#e2b48c': '#8a6a4e',
  '#c9daf8': '#3f5d7a',
  '#e8d88a': '#7a6e3e',
  '#b9b3a6': '#5a616b',
  '#d9a27e': '#9a7058',
  '#93aee6': '#5a7baa',
  '#b7a0e3': '#7e6aa8',
  // 선/글자 색
  '#3d4148': '#c9d1db',
  '#8a857a': '#8d96a3',
  '#2f5bd3': '#8cc8f0',
  '#a6531a': '#f0b985',
  '#2f7a4b': '#7fd1a0',
  '#7a52c7': '#c3a6f5',
  '#c2561b': '#f0a070',
  '#b23b3b': '#f08c8c',
};

/** 문서에 저장된 색을 지금 테마에서 그릴 색으로 바꾼다 */
export function themed(color: string, theme: Theme): string {
  if (theme === 'light') return color;
  return DARK[color.toLowerCase()] ?? color;
}

// 설정값은 이 컴퓨터(포터블이면 WorksheetData 폴더)에만 저장한다
export function loadPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v !== null && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장하지 못해도 이번 실행 동안은 유지된다
  }
}

export const loadTheme = (): Theme => loadPref('worksheet-theme', ['light', 'dark'] as const, 'light');
export const saveTheme = (theme: Theme) => savePref('worksheet-theme', theme);
export const loadSnap = () => loadPref('worksheet-snap', ['on', 'off'] as const, 'off') === 'on';
export const saveSnap = (on: boolean) => savePref('worksheet-snap', on ? 'on' : 'off');
