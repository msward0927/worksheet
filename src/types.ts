// 워크시트 문서의 데이터 구조. 파일(.wsht)에는 Doc 이 JSON 으로 그대로 저장된다.

/** shape: 글 없는 워크박스(다른 박스를 담는 틀), text: 텍스트 박스 */
export type BoxKind = 'shape' | 'text' | 'number' | 'formula' | 'checklist' | 'image';
export type TextAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';
export type FontFamily = 'sans' | 'serif' | 'gulim' | 'dotum' | 'gungsuh' | 'mono';
export type Shape = 'rect' | 'rounded' | 'ellipse' | 'diamond';
export type NumberFormat = 'plain' | 'currency' | 'percent';

export interface CheckItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Box {
  id: string;
  kind: BoxKind;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: Shape;
  /** 배경색. 'transparent' 면 배경 없음 */
  fill: string;
  /** 테두리색. 'none' 이면 테두리 없음 */
  stroke: string;
  /** 박스 이름. 제목으로 보이고, 수식에서 이 이름으로 값을 부른다 */
  name: string;
  text: string;
  value: number | null;
  formula: string;
  items: CheckItem[];
  /** 이미지 data URL */
  image: string | null;
  format: NumberFormat;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  /** 가로 / 세로 정렬 */
  align: TextAlign;
  valign: VAlign;
  /** 글자 색. 빈 문자열이면 테마의 기본 글자 색 */
  textColor: string;
  fontFamily: FontFamily;
  lineHeight: number;
  /** 자간 (px) */
  letterSpacing: number;
  /** 안쪽 여백 (px). null 이면 박스 모양에 맞춰 자동 */
  padding: number | null;
  /** 이 박스를 담고 있는 워크박스. 좌표는 부모와 상관없이 캔버스 기준이다 */
  parentId: string | null;
}

export type ArrowMode = 'none' | 'end' | 'both';
export type EdgeCurve = 'straight' | 'curved' | 'elbow';
export type EdgeStyle = 'solid' | 'dashed';

export interface Edge {
  id: string;
  from: string;
  to: string;
  label: string;
  arrow: ArrowMode;
  curve: EdgeCurve;
  style: EdgeStyle;
  color: string;
  width: number;
}

export interface View {
  x: number;
  y: number;
  zoom: number;
}

export interface Doc {
  app: 'worksheet';
  version: 1;
  title: string;
  boxes: Box[];
  edges: Edge[];
  view: View;
}

export type Tool =
  | 'select'
  | 'hand'
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'sticky'
  | 'number'
  | 'formula'
  | 'checklist'
  | 'image'
  | 'connect';
