export type ElementType = 'sticky' | 'rect' | 'circle' | 'arrow' | 'freehand';

export interface BaseElementProps {
  x: number;
  y: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface StickyProps extends BaseElementProps {
  text: string;
  width: number;
  height: number;
  fontSize?: number;
  textColor?: string;
}

export interface RectProps extends BaseElementProps {
  width: number;
  height: number;
}

export interface CircleProps extends BaseElementProps {
  radius?: number;    // 後方互換（旧データ用）
  radiusX?: number;
  radiusY?: number;
}

export interface ArrowProps {
  points: number[];
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  pointerLength?: number;
  pointerWidth?: number;
}

export interface FreehandProps {
  points: number[];
  stroke?: string;
  strokeWidth?: number;
  tension?: number;
}

export type ElementProps =
  | StickyProps
  | RectProps
  | CircleProps
  | ArrowProps
  | FreehandProps;

export interface BoardElement {
  id: string;
  boardId: string;
  type: ElementType;
  props: ElementProps;
  zIndex: number;
  createdBy: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
}

export interface Board {
  id: string;
  title: string;
  groupId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface GroupMember {
  groupId: string;
  userId: string;
}
