// 워크시트 문서의 데이터 구조. 파일(.wsht)에는 Doc 이 JSON 으로 그대로 저장된다.

export type BoxKind = 'text' | 'number' | 'formula' | 'checklist' | 'image';
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
